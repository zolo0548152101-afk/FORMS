/**
 * Which things can be placed on a PDF for a given form, and how a placed stamp maps back to one.
 * Pure logic for the placement UI.
 */
import { FIELD_TYPE_META } from "./field-types";
import type { PdfStamp } from "./pdf-mapping";
import { resolveOptions } from "./lookups";
import { allFields, type FormDefinition, type FormField } from "./schema";

export interface PlaceableItem {
  key: string;
  fieldId: string;
  part?: string;
  whenValue?: string;
  kind: PdfStamp["kind"];
  label: string;
  /** Group heading in the list (field label). */
  group: string;
  multiline?: boolean;
}

export const stampKey = (s: { fieldId: string; part?: string; whenValue?: string }) => `${s.fieldId}|${s.part ?? ""}|${s.whenValue ?? ""}`;

export const DEFAULT_SIZE: Record<PdfStamp["kind"], { width: number; height: number }> = {
  text: { width: 120, height: 16 },
  check: { width: 12, height: 12 },
  signature: { width: 120, height: 40 },
  image: { width: 80, height: 40 },
  comb: { width: 180, height: 20 },
  date_signed: { width: 90, height: 16 },
  initials: { width: 50, height: 18 },
  stamp_image: { width: 90, height: 90 },
};

const UNSUPPORTED = new Set(["radio_grid", "checkbox_grid", "file_upload", "hidden"]);

function itemsForField(f: FormField, idPrefix: string, labelPrefix: string): PlaceableItem[] {
  const meta = FIELD_TYPE_META[f.type];
  if (!meta.hasAnswer || UNSUPPORTED.has(f.type)) return [];
  const fieldId = idPrefix + f.id;
  const group = labelPrefix + (f.label || f.id);
  const base = { fieldId, group };
  const make = (over: Partial<PlaceableItem> & { kind: PlaceableItem["kind"]; label: string }): PlaceableItem => {
    const item = { ...base, ...over, key: "" };
    item.key = stampKey(item);
    return item;
  };

  if (f.type === "signature") return [make({ kind: "signature", label: "חתימה" })];
  if (f.type === "consent") return [make({ kind: "check", label: "סימון X כשמאושר" })];
  if (f.type === "yes_no") {
    return [
      make({ kind: "check", whenValue: "yes", label: "X ב\"כן\"" }),
      make({ kind: "check", whenValue: "no", label: "X ב\"לא\"" }),
    ];
  }
  if (f.type === "radio" || f.type === "checkboxes") {
    const checks = resolveOptions(f).map((o) => make({ kind: "check", whenValue: o.value, label: `X ליד "${o.label}"` }));
    return [make({ kind: "text", label: f.type === "radio" ? "הטקסט שנבחר" : "הבחירות כטקסט" }), ...checks];
  }
  if (meta.parts) return meta.parts.map((p) => make({ kind: "text", part: p.key, label: p.label }));
  if (f.type === "long_text") return [make({ kind: "text", label: "טקסט", multiline: true })];
  return [make({ kind: "text", label: "טקסט" })];
}

/** `tableRows[tableId]` = how many rows to offer for a repeating table (UI controlled). */
export function placeableItems(def: FormDefinition, tableRows: Record<string, number> = {}): PlaceableItem[] {
  const out: PlaceableItem[] = [];
  for (const f of allFields(def)) {
    if (f.type === "repeating_table") {
      const max = Number(f.settings?.maxRows ?? 10);
      const rows = Math.min(tableRows[f.id] ?? Math.min(max, Math.max(1, Number(f.settings?.minRows ?? 1))), max);
      for (let r = 0; r < rows; r++) {
        for (const col of f.fields ?? []) out.push(...itemsForField(col, `${f.id}[${r}].`, `${f.label} · שורה ${r + 1} · `));
      }
    } else {
      out.push(...itemsForField(f, "", ""));
    }
  }
  return out;
}

/** Stamps whose field (or table column) no longer exists in the form. */
export function orphanStamps(def: FormDefinition, stamps: PdfStamp[]): PdfStamp[] {
  const known = new Set(placeableItems(def, Object.fromEntries(allFields(def).filter((f) => f.type === "repeating_table").map((f) => [f.id, 100]))).map((i) => i.key));
  // Stamps that do not read an answer are never orphans.
  return stamps.filter((s) => s.kind !== "date_signed" && s.kind !== "stamp_image" && !known.has(stampKey(s)));
}
