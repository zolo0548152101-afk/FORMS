"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Redo2, Undo2 } from "lucide-react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { publishAction, saveDraftAction } from "@/app/admin/forms/actions";
import {
  addField, addPage, duplicateField, findLocation, moveField, movePage, publishIssues, removeField, removePage,
  renameFieldId, updateField, updatePage,
} from "@/lib/forms/builder";
import type { Answers } from "@/lib/forms/conditions";
import type { FieldType } from "@/lib/forms/field-types";
import { parseFormDefinition, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { Canvas, type Selection } from "./Canvas";
import { Palette } from "./Palette";
import { FieldSettings, PageSettings } from "./SettingsPanel";
import { PdfTab, type PdfState } from "./PdfTab";

type TabId = "edit" | "preview" | "pdf" | "json";
type SaveState = "saved" | "saving" | "dirty" | "error";

export interface FormEditorProps {
  templateId: string;
  initial: FormDefinition;
  initialVersion: number;
  initiallyPublished: boolean;
  initialPdf: PdfState | null;
  initialTab?: TabId;
}

export function FormEditor({ templateId, initial, initialVersion, initiallyPublished, initialPdf, initialTab = "edit" }: FormEditorProps) {
  const [def, setDef] = useState(initial);
  const [past, setPast] = useState<FormDefinition[]>([]);
  const [future, setFuture] = useState<FormDefinition[]>([]);
  const [selection, setSelection] = useState<Selection | null>({ kind: "page", index: 0 });
  const [tab, setTab] = useState<TabId>(initialTab);
  const [save, setSave] = useState<SaveState>("saved");
  const [version, setVersion] = useState(initialVersion);
  const [published, setPublished] = useState(initiallyPublished);
  const [pdf, setPdf] = useState<PdfState | null>(initialPdf);
  const [issues, setIssues] = useState<string[]>([]);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const first = useRef(true);

  /** All edits go through here so undo/redo and autosave see them. */
  const commit = useCallback((next: FormDefinition) => {
    setPast((p) => [...p.slice(-49), def]);
    setFuture([]);
    setDef(next);
  }, [def]);

  const undo = () => setPast((p) => {
    if (!p.length) return p;
    setFuture((f) => [def, ...f]);
    setDef(p.at(-1)!);
    return p.slice(0, -1);
  });
  const redo = () => setFuture((f) => {
    if (!f.length) return f;
    setPast((p) => [...p, def]);
    setDef(f[0]!);
    return f.slice(1);
  });

  // Debounced autosave of the draft.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      const r = await saveDraftAction(templateId, def, { pdfFileId: pdf?.file.id ?? null, pdfMapping: pdf?.mapping ?? null });
      if ("error" in r) { setSave("error"); return; }
      setVersion(r.version);
      setPublished(false);
      setSave("saved");
    }, 1200);
    return () => clearTimeout(t);
  }, [def, pdf, templateId]);

  const selectedField: FormField | null = useMemo(() => {
    if (selection?.kind !== "field") return null;
    const loc = findLocation(def, selection.id);
    return loc ? def.pages[loc.page]!.fields[loc.index]! : null;
  }, [def, selection]);

  const addAt = (type: FieldType, page: number, index: number) => {
    const r = addField(def, type, { page, index });
    commit(r.def);
    setSelection({ kind: "field", id: r.id });
  };
  const addToEnd = (type: FieldType) => {
    const page = selection?.kind === "page" ? selection.index : selectedField ? findLocation(def, selectedField.id)!.page : def.pages.length - 1;
    addAt(type, page, def.pages[page]!.fields.length);
  };

  const stepField = (id: string, dir: -1 | 1) => {
    const loc = findLocation(def, id)!;
    const page = def.pages[loc.page]!;
    if (dir === -1) {
      if (loc.index > 0) commit(moveField(def, id, { page: loc.page, index: loc.index - 1 }));
      else if (loc.page > 0) commit(moveField(def, id, { page: loc.page - 1, index: def.pages[loc.page - 1]!.fields.length }));
    } else if (loc.index < page.fields.length - 1) commit(moveField(def, id, { page: loc.page, index: loc.index + 2 }));
    else if (loc.page < def.pages.length - 1) commit(moveField(def, id, { page: loc.page + 1, index: 0 }));
  };

  async function onPublish() {
    const problems = publishIssues(def);
    if (problems.length) { setIssues(problems.map((p) => p.message)); return; }
    setSave("saving");
    const saved = await saveDraftAction(templateId, def, { pdfFileId: pdf?.file.id ?? null, pdfMapping: pdf?.mapping ?? null });
    if ("error" in saved) { setSave("error"); setIssues([saved.error]); return; }
    const r = await publishAction(templateId);
    if (!r.ok) { setSave("error"); setIssues(r.issues); return; }
    setIssues([]);
    setVersion(r.version);
    setPublished(true);
    setSave("saved");
  }

  const SAVE_LABEL: Record<SaveState, string> = { saved: "נשמר", saving: "שומר…", dirty: "יש שינויים…", error: "השמירה נכשלה" };
  const exportJson = JSON.stringify(def, null, 2);

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
        <Link href="/admin/forms" className="text-sm text-muted-foreground hover:text-foreground">← טפסים</Link>
        <Input
          aria-label="שם הטופס"
          value={def.title}
          onChange={(e) => commit({ ...def, title: e.target.value })}
          className="h-9 max-w-xs font-semibold"
        />
        <Badge tone={published ? "success" : "warning"}>{published ? `גרסה ${version} פורסמה` : `טיוטה (גרסה ${version})`}</Badge>
        <span role="status" className="text-xs text-muted-foreground">{SAVE_LABEL[save]}</span>
        <a
          href={`/preview/form/${templateId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          צפייה בטופס (בחלון חדש)
        </a>
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="ביטול" disabled={!past.length} onClick={undo}><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="שחזור" disabled={!future.length} onClick={redo}><Redo2 className="size-4" /></Button>
          <Button onClick={onPublish} disabled={published || save === "saving"}>{published ? "פורסם" : "פרסום"}</Button>
        </div>
      </div>

      {issues.length > 0 && (
        <div role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <p className="font-medium">אי אפשר לפרסם עדיין:</p>
          <ul className="list-disc ps-5">{issues.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {published && (
        <p className="border-b bg-muted px-4 py-1.5 text-xs text-muted-foreground">גרסה {version} נעולה. כל שינוי ייצור אוטומטית גרסה {version + 1} כטיוטה.</p>
      )}

      <div className="px-4 pt-2">
        <Tabs<TabId>
          value={tab}
          onChange={(t) => { setTab(t); if (t === "json") { setJsonText(exportJson); setJsonError(null); } }}
          tabs={[{ id: "edit", label: "עריכה" }, { id: "preview", label: "תצוגה מקדימה" }, { id: "pdf", label: "PDF" }, { id: "json", label: "JSON" }]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "edit" && (
          <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[14rem_1fr_20rem]">
            <aside className="lg:overflow-auto"><Palette onAdd={addToEnd} /></aside>
            <div className="lg:overflow-auto">
              <Canvas
                def={def}
                selection={selection}
                onSelect={setSelection}
                onPatchField={(id, patch) => commit(updateField(def, id, patch))}
                onDropAt={(page, index, data) => {
                  if (data.type) addAt(data.type, page, index);
                  else if (data.fieldId) commit(moveField(def, data.fieldId, { page, index }));
                }}
                onMoveField={stepField}
                onDuplicate={(id) => { const r = duplicateField(def, id); commit(r.def); setSelection({ kind: "field", id: r.id }); }}
                onRemove={(id) => { commit(removeField(def, id)); setSelection(null); }}
                onAddPage={() => { commit(addPage(def)); setSelection({ kind: "page", index: def.pages.length }); }}
                onRemovePage={(i) => { commit(removePage(def, i)); setSelection({ kind: "page", index: 0 }); }}
                onMovePage={(i, dir) => { commit(movePage(def, i, i + dir)); setSelection({ kind: "page", index: i + dir }); }}
              />
            </div>
            <aside className="rounded-lg border bg-card p-3 lg:overflow-auto" aria-label="הגדרות">
              {selectedField ? (
                <FieldSettings
                  key={selectedField.id}
                  def={def}
                  field={selectedField}
                  onPatch={(patch) => commit(updateField(def, selectedField.id, patch))}
                  onRename={(to) => {
                    const r = renameFieldId(def, selectedField.id, to);
                    if (r.error) return r.error;
                    commit(r.def);
                    setSelection({ kind: "field", id: to });
                  }}
                />
              ) : selection?.kind === "page" && def.pages[selection.index] ? (
                <PageSettings def={def} index={selection.index} onPatch={(patch) => commit(updatePage(def, (selection as { index: number }).index, patch))} />
              ) : (
                <p className="text-sm text-muted-foreground">בחרו שדה או עמוד כדי לערוך את ההגדרות שלו.</p>
              )}
            </aside>
          </div>
        )}

        {tab === "preview" && (
          <div className="mx-auto max-w-3xl p-4">
            <p className="mb-4 rounded-md bg-muted p-2 text-xs text-muted-foreground">תצוגה מקדימה חיה. המילוי כאן לא נשמר.</p>
            <FormRenderer definition={def} answers={previewAnswers} onChange={setPreviewAnswers} onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })} />
          </div>
        )}

        {tab === "pdf" && <div className="p-4"><PdfTab definition={def} pdf={pdf} onChange={setPdf} onDefinitionChange={commit} /></div>}

        {tab === "json" && (
          <div className="mx-auto max-w-4xl space-y-3 p-4">
            <p className="text-sm text-muted-foreground">גיבוי והעברה של הגדרת הטופס. אפשר לערוך ולהחיל, או להעתיק לשמירה.</p>
            <Textarea dir="ltr" rows={22} value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs" />
            {jsonError && <p role="alert" className="text-sm text-destructive">{jsonError}</p>}
            <div className="flex gap-2">
              <Button onClick={() => {
                try {
                  const parsed = parseFormDefinition(JSON.parse(jsonText));
                  if (!parsed.success) { setJsonError(`הגדרה לא תקינה: ${parsed.error.issues[0]?.message ?? ""}`); return; }
                  setJsonError(null);
                  commit(parsed.data);
                  setSelection({ kind: "page", index: 0 });
                } catch { setJsonError("JSON לא תקין"); }
              }}>החלה</Button>
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(exportJson)}>העתקה</Button>
              <Button variant="outline" onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([exportJson], { type: "application/json" }));
                a.download = `${def.title || "form"}.json`;
                a.click();
              }}>הורדה</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
