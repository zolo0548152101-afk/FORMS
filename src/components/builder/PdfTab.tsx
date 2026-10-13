"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PdfPlacement } from "@/components/pdf/PdfPlacement";
import { nanoid } from "nanoid";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { addPdfOnlyElement, dropPdfOnlyField } from "@/lib/forms/pdf-only";
import type { FormDefinition } from "@/lib/forms/schema";

export interface PdfState {
  file: { id: string; name: string; url: string; pages: { width: number; height: number }[] };
  mapping: PdfMapping;
}

export function PdfTab({
  definition,
  pdf,
  onChange,
  onDefinitionChange,
}: {
  definition: FormDefinition;
  pdf: PdfState | null;
  onChange: (p: PdfState | null) => void;
  onDefinitionChange: (d: FormDefinition) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/pdf", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "ההעלאה נכשלה"); return; }
      const same = pdf && pdf.file.pages.length === json.pages.length;
      onChange({
        file: { id: json.id, name: json.name, url: json.url, pages: json.pages },
        // Keep existing stamps when the new PDF has the same page count (e.g. a corrected version of the same form).
        mapping: { schemaVersion: 1, pages: json.pages, stamps: same ? pdf.mapping.stamps : [] },
      });
    } catch {
      setError("ההעלאה נכשלה, נסו שוב");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function preview() {
    if (!pdf) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pdf-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pdfFileId: pdf.file.id, definition, mapping: pdf.mapping }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "יצירת התצוגה נכשלה"); return; }
      setPreviewUrl(URL.createObjectURL(await res.blob()));
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Button variant={pdf ? "outline" : "default"} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "מעלה…" : pdf ? "החלפת PDF" : "העלאת PDF"}
        </Button>
        {pdf && <span className="text-sm text-muted-foreground">{pdf.file.name} · {pdf.file.pages.length} עמודים</span>}
        {pdf && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>הסרת ה-PDF מהטופס</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!pdf && <p className="text-sm text-muted-foreground">העלו PDF של הטופס (עד 4MB), ואז הצמידו אליו את שדות הטופס. כך נוצר PDF ממולא וחתום.</p>}
      {pdf && (
        <PdfPlacement
          definition={definition}
          source={{ url: pdf.file.url }}
          pages={pdf.file.pages}
          mapping={pdf.mapping}
          onMappingChange={(mapping) => {
            // Deleting a stamp of a drawn-on-PDF field also removes the field it created.
            const kept = new Set(mapping.stamps.map((st) => st.fieldId));
            let def = definition;
            for (const st of pdf.mapping.stamps) if (!kept.has(st.fieldId)) def = dropPdfOnlyField(def, st.fieldId);
            if (def !== definition) onDefinitionChange(def);
            onChange({ ...pdf, mapping });
          }}
          onDrawElement={(entry, page, at) => {
            const { definition: next, stamp } = addPdfOnlyElement(definition, entry, page, at, () => nanoid(8));
            if (next !== definition) onDefinitionChange(next);
            onChange({ ...pdf, mapping: { ...pdf.mapping, stamps: [...pdf.mapping.stamps, stamp] } });
            return stamp.id;
          }}
          onPreview={preview}
          previewBusy={previewBusy}
        />
      )}
      <Dialog open={!!previewUrl} onClose={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} title="תצוגה מקדימה עם נתוני דוגמה" className="h-[90dvh] w-[min(95vw,60rem)]">
        {previewUrl && <iframe src={previewUrl} title="PDF ממולא" className="min-h-0 w-full flex-1 rounded border" />}
      </Dialog>
    </div>
  );
}
