"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clampBox, pdfBoxToScreen, round1, screenBoxToPdf } from "@/lib/pdf/coords";
import { DEFAULT_SIZE, orphanStamps, placeableItems, stampKey, type PlaceableItem } from "@/lib/forms/pdf-items";
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { PDF_PALETTE, type PaletteEntry } from "@/lib/forms/pdf-only";
import { PageCanvas } from "./PageCanvas";
import { StampStyleControls } from "./StampStyleControls";
import { usePdfDocument, type PdfSource } from "./usePdfDocument";

const ITEM_DRAG = "application/x-pdf-item";
const ELEMENT_DRAG = "application/x-pdf-element";
const KIND_LABEL = {
  text: "טקסט",
  check: "X",
  signature: "חתימה",
  image: "תמונה",
  comb: "תאים",
  date_signed: "תאריך חתימה",
  initials: "ראשי תיבות",
  stamp_image: "חותמת",
} as const;

export interface PdfPlacementProps {
  definition: FormDefinition;
  source: PdfSource;
  pages: { width: number; height: number }[];
  mapping: PdfMapping;
  onMappingChange: (m: PdfMapping) => void;
  /** Optional server-side preview with sample data. */
  onPreview?: () => void;
  previewBusy?: boolean;
  /**
   * Draw-on-PDF mode: dropping a palette element creates a form field and a stamp.
   * Returns the new stamp id so it can be selected.
   */
  onDrawElement?: (entry: PaletteEntry, page: number, at: { x: number; y: number }) => string;
}

export function PdfPlacement({ definition, source, pages, mapping, onMappingChange, onPreview, previewBusy, onDrawElement }: PdfPlacementProps) {
  const { doc, error } = usePdfDocument(source);
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [tableRows, setTableRows] = useState<Record<string, number>>({});
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const items = useMemo(() => placeableItems(definition, tableRows), [definition, tableRows]);
  const groups = useMemo(() => {
    const m = new Map<string, PlaceableItem[]>();
    for (const it of items) m.set(it.group, [...(m.get(it.group) ?? []), it]);
    return [...m.entries()];
  }, [items]);
  const stampByKey = useMemo(() => new Map(mapping.stamps.map((s) => [stampKey(s), s])), [mapping.stamps]);
  const orphans = useMemo(() => orphanStamps(definition, mapping.stamps), [definition, mapping.stamps]);
  const selectedStamp = mapping.stamps.find((s) => s.id === selected) ?? null;
  const labelOf = (s: PdfStamp) => items.find((i) => i.key === stampKey(s))?.label ?? s.fieldId;

  const setStamps = (stamps: PdfStamp[]) => onMappingChange({ ...mapping, stamps });
  const patchStamp = (id: string, patch: Partial<PdfStamp>) => setStamps(mapping.stamps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function place(item: PlaceableItem, page: number, at?: { x: number; y: number }) {
    const existing = stampByKey.get(item.key);
    const size = DEFAULT_SIZE[item.kind];
    const dims = item.multiline ? { width: 200, height: 50 } : size;
    const pg = pages[page]!;
    const pos = at ?? { x: (pg.width - dims.width) / 2, y: pg.height / 2 };
    const box = clampBox({ ...pos, ...dims }, pg.width, pg.height);
    if (existing) {
      patchStamp(existing.id, { page, ...box });
      setSelected(existing.id);
      return;
    }
    const stamp: PdfStamp = {
      id: nanoid(8), fieldId: item.fieldId, part: item.part, whenValue: item.whenValue, kind: item.kind, page, ...box,
      ...(item.multiline ? { multiline: true } : {}),
    };
    // Optional keys must be absent (not undefined) to keep the JSON clean.
    if (stamp.part === undefined) delete stamp.part;
    if (stamp.whenValue === undefined) delete stamp.whenValue;
    setStamps([...mapping.stamps, stamp]);
    setSelected(stamp.id);
  }

  function draw(entry: PaletteEntry, page: number, at?: { x: number; y: number }) {
    if (!onDrawElement) return;
    const dims = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
    const pg = pages[page]!;
    const pos = at ?? { x: (pg.width - dims.width) / 2, y: pg.height / 2 };
    const box = clampBox({ ...pos, ...dims }, pg.width, pg.height);
    setSelected(onDrawElement(entry, page, { x: round1(box.x), y: round1(box.y) }));
  }

  function startDrag(e: React.PointerEvent, stamp: PdfStamp, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    setSelected(stamp.id);
    const pg = pages[stamp.page]!;
    const startX = e.clientX, startY = e.clientY;
    const origin = { x: stamp.x, y: stamp.y, width: stamp.width, height: stamp.height };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = -(ev.clientY - startY) / scale; // screen down = PDF down
      const box = mode === "move"
        ? { ...origin, x: origin.x + dx, y: origin.y + dy }
        // Resize from the bottom-end corner: width grows with dx, the top edge stays put.
        : { x: origin.x, width: origin.width + dx, height: origin.height - dy, y: origin.y + dy };
      const c = clampBox(box, pg.width, pg.height);
      patchStampLive(stamp.id, { x: round1(c.x), y: round1(c.y), width: round1(c.width), height: round1(c.height) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  // During a drag the closure's `mapping` is stale, so always patch from the latest ref.
  const latest = useRef(mapping);
  useEffect(() => { latest.current = mapping; });
  const patchStampLive = (id: string, patch: Partial<PdfStamp>) =>
    onMappingChange({ ...latest.current, stamps: latest.current.stamps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  function onKey(e: React.KeyboardEvent) {
    if (!selectedStamp || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (d[e.key]) {
      e.preventDefault();
      const pg = pages[selectedStamp.page]!;
      const c = clampBox({ ...selectedStamp, x: selectedStamp.x + d[e.key]![0], y: selectedStamp.y + d[e.key]![1] }, pg.width, pg.height);
      patchStamp(selectedStamp.id, { x: round1(c.x), y: round1(c.y) });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      setStamps(mapping.stamps.filter((s) => s.id !== selectedStamp.id));
      setSelected(null);
    }
  }

  const tables = allFields(definition).filter((f) => f.type === "repeating_table");
  const rowsFor = (t: (typeof tables)[number]) => tableRows[t.id] ?? (Math.max(1, Number(t.settings?.minRows ?? 1)) || 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr_16rem]" onKeyDown={onKey}>
      {/* Fields to place */}
      <aside className="space-y-3 lg:max-h-[75vh] lg:overflow-auto" aria-label="שדות למיקום">
        <p className="text-xs text-muted-foreground">לחצו על &quot;מיקום&quot; או גררו שדה אל העמוד. פריט מסומן ב-✓ כבר ממוקם.</p>
        {onDrawElement && (
          <section aria-label="הוספה על המסמך">
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">הוספת שדה על המסמך</h4>
            <ul className="grid grid-cols-2 gap-1">
              {PDF_PALETTE.map((entry) => (
                <li
                  key={entry.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(ELEMENT_DRAG, entry.id)}
                  className="flex items-center justify-between gap-1 rounded-md border bg-card px-2 py-1 text-xs"
                >
                  <span className="truncate">{entry.label}</span>
                  <Button variant="ghost" size="sm" aria-label={`הוספת ${entry.label}`} onClick={() => draw(entry, activePage)}><Plus className="size-3" /></Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tables.map((t) => {
          const current = rowsFor(t);
          const max = Number(t.settings?.maxRows ?? 20);
          return (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>שורות ב&quot;{t.label}&quot;</span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="sm" aria-label="פחות שורות" onClick={() => setTableRows((r) => ({ ...r, [t.id]: Math.max(1, current - 1) }))}><Minus className="size-3" /></Button>
                <span className="w-5 text-center">{current}</span>
                <Button variant="outline" size="sm" aria-label="עוד שורות" onClick={() => setTableRows((r) => ({ ...r, [t.id]: Math.min(max, current + 1) }))}><Plus className="size-3" /></Button>
              </span>
            </div>
          );
        })}
        {groups.map(([group, list]) => (
          <section key={group}>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{group}</h4>
            <ul className="space-y-1">
              {list.map((it) => {
                const placed = stampByKey.get(it.key);
                return (
                  <li
                    key={it.key}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(ITEM_DRAG, it.key)}
                    className={cn("flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm", placed && selected === placed.id && "border-primary")}
                  >
                    <span className="flex-1 truncate">{placed ? "✓ " : ""}{it.label}</span>
                    <span className="text-xs text-muted-foreground">{KIND_LABEL[it.kind]}</span>
                    <Button variant="ghost" size="sm" aria-label={`מיקום ${it.group} ${it.label}`} onClick={() => place(it, activePage)}><Crosshair className="size-4" /></Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {orphans.length > 0 && (
          <section className="rounded-md border border-destructive p-2 text-sm">
            <p className="font-medium text-destructive">חותמות של שדות שנמחקו ({orphans.length})</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => setStamps(mapping.stamps.filter((s) => !orphans.includes(s)))}>הסרה</Button>
          </section>
        )}
      </aside>

      {/* Pages */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span>זום</span>
          {[0.75, 1, 1.25, 1.5].map((z) => (
            <Button key={z} size="sm" variant={scale === z ? "default" : "outline"} onClick={() => setScale(z)}>{Math.round(z * 100)}%</Button>
          ))}
          {onPreview && <Button className="ms-auto" variant="secondary" disabled={previewBusy} onClick={onPreview}>{previewBusy ? "מכין…" : "תצוגה מקדימה עם נתוני דוגמה"}</Button>}
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="space-y-4 overflow-auto rounded-lg bg-muted p-3 lg:max-h-[75vh]">
          {/* PDF space is physical (origin bottom-left, x to the right), so this subtree is LTR. */}
          <div dir="ltr" className="space-y-4">
            {doc && pages.map((pg, pi) => (
              <div
                key={pi}
                ref={(el) => { pageRefs.current[pi] = el; }}
                data-testid={`pdf-page-${pi}`}
                className="relative mx-auto shadow"
                style={{ width: pg.width * scale, height: pg.height * scale }}
                onPointerDown={() => { setActivePage(pi); setSelected(null); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const entry = PDF_PALETTE.find((p) => p.id === e.dataTransfer.getData(ELEMENT_DRAG));
                  if (entry) {
                    const r = pageRefs.current[pi]!.getBoundingClientRect();
                    const d = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
                    const b = screenBoxToPdf({ x: e.clientX - r.left, y: e.clientY - r.top, width: d.width * scale, height: d.height * scale }, pg.height, scale);
                    draw(entry, pi, { x: round1(b.x), y: round1(b.y) });
                    return;
                  }
                  const item = items.find((i) => i.key === e.dataTransfer.getData(ITEM_DRAG));
                  if (!item) return;
                  const rect = pageRefs.current[pi]!.getBoundingClientRect();
                  const dims = item.multiline ? { width: 200, height: 50 } : DEFAULT_SIZE[item.kind];
                  const box = screenBoxToPdf({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: dims.width * scale, height: dims.height * scale }, pg.height, scale);
                  place(item, pi, { x: round1(box.x), y: round1(box.y) });
                }}
              >
                <PageCanvas doc={doc} pageNumber={pi + 1} scale={scale} />
                {mapping.stamps.filter((s) => s.page === pi).map((s) => {
                  const b = pdfBoxToScreen(s, pg.height, scale);
                  const active = s.id === selected;
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${s.fieldId} ${labelOf(s)}`}
                      data-stamp={s.id}
                      onPointerDown={(e) => startDrag(e, s, "move")}
                      className={cn(
                        "absolute cursor-move touch-none border-2 text-[10px] leading-none",
                        active ? "border-primary bg-primary/25" : "border-primary/60 bg-primary/10",
                        orphans.includes(s) && "border-destructive bg-destructive/15",
                      )}
                      style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
                    >
                      <span className="pointer-events-none block truncate px-0.5 text-primary">{s.kind === "check" ? "X" : s.kind === "date_signed" ? "תאריך חתימה" : s.fieldId}</span>
                      {active && (
                        <span
                          aria-label="שינוי גודל"
                          onPointerDown={(e) => startDrag(e, s, "resize")}
                          className="absolute -bottom-1.5 -end-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-primary bg-card"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected stamp settings */}
      <aside className="space-y-3 rounded-lg border bg-card p-3" aria-label="הגדרות חותמת">
        {!selectedStamp ? (
          <p className="text-sm text-muted-foreground">בחרו חותמת על העמוד כדי לערוך אותה. חיצים מזיזים (Shift = 10), Delete מוחק.</p>
        ) : (
          <>
            <p className="text-sm font-medium">{labelOf(selectedStamp)}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">{selectedStamp.fieldId}{selectedStamp.part ? `.${selectedStamp.part}` : ""}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-muted-foreground">{{ x: "X", y: "Y", width: "רוחב", height: "גובה" }[k]}</Label>
                  <Input type="number" dir="ltr" className="h-9 text-start" value={selectedStamp[k]} onChange={(e) => {
                    const pg = pages[selectedStamp.page]!;
                    const c = clampBox({ ...selectedStamp, [k]: Number(e.target.value) || 0 }, pg.width, pg.height);
                    patchStamp(selectedStamp.id, { x: c.x, y: c.y, width: c.width, height: c.height });
                  }} />
                </div>
              ))}
            </div>
            <StampStyleControls stamp={selectedStamp} pageCount={pages.length} onPatch={(patch) => patchStamp(selectedStamp.id, patch)} />
            <div className="space-y-1">
              <Label className="text-muted-foreground">עמוד</Label>
              <Select className="h-9" value={selectedStamp.page} onChange={(e) => {
                const page = Number(e.target.value);
                const pg = pages[page]!;
                const c = clampBox(selectedStamp, pg.width, pg.height);
                patchStamp(selectedStamp.id, { page, ...c });
              }}>
                {pages.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
              </Select>
            </div>
            <Button variant="destructive" size="sm" onClick={() => { setStamps(mapping.stamps.filter((s) => s.id !== selectedStamp.id)); setSelected(null); }}>
              <Trash2 className="size-4" />הסרת החותמת
            </Button>
          </>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground">{mapping.stamps.length} חותמות ממופות</p>
      </aside>
    </div>
  );
}
