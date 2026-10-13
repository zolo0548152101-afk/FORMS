/**
 * "Draw on the PDF": the admin picks an element from a palette and drops it on a page.
 * That creates a form field (marked `settings.pdfOnly`, living on the first form page) and the stamp that draws it.
 * Pure logic, no React.
 */
import type { PdfStamp } from "./pdf-mapping";
import { DEFAULT_SIZE } from "./pdf-items";
import type { FieldType } from "./field-types";
import { allFields, type FormDefinition, type FormField } from "./schema";

export interface PaletteEntry {
  id: string;
  label: string;
  /** Field created for this element; null = stamp only (nothing to fill in). */
  fieldType: FieldType | null;
  stamp: Pick<PdfStamp, "kind"> & Partial<PdfStamp>;
  /** Label given to the new field. */
  fieldLabel?: string;
  size?: { width: number; height: number };
}

export const PDF_PALETTE: PaletteEntry[] = [
  { id: "text", label: "טקסט", fieldType: "short_text", fieldLabel: "טקסט", stamp: { kind: "text" } },
  { id: "long", label: "טקסט רב-שורה", fieldType: "long_text", fieldLabel: "פסקה", stamp: { kind: "text", multiline: true }, size: { width: 220, height: 60 } },
  { id: "id", label: 'ת"ז בתאים', fieldType: "id_number", fieldLabel: "מספר זהות", stamp: { kind: "comb", comb: { cells: 9 } }, size: { width: 180, height: 20 } },
  { id: "phone", label: "טלפון", fieldType: "phone", fieldLabel: "טלפון", stamp: { kind: "text" } },
  { id: "date", label: "תאריך", fieldType: "date", fieldLabel: "תאריך", stamp: { kind: "text", align: "center" }, size: { width: 80, height: 16 } },
  { id: "check", label: "תיבת סימון", fieldType: "consent", fieldLabel: "אישור", stamp: { kind: "check" } },
  { id: "signature", label: "חתימה", fieldType: "signature", fieldLabel: "חתימה", stamp: { kind: "signature" } },
  { id: "initials", label: "ראשי תיבות", fieldType: "short_text", fieldLabel: "שם מלא (ראשי תיבות)", stamp: { kind: "initials" } },
  { id: "date_signed", label: "תאריך חתימה", fieldType: null, stamp: { kind: "date_signed", align: "center" } },
];

/** Smallest `<base>N` not used by any field in the form. */
export function uniqueFieldId(def: FormDefinition, base: string): string {
  const used = new Set(allFields(def).map((f) => f.id));
  let n = 1;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface PdfOnlyResult {
  definition: FormDefinition;
  stamp: PdfStamp;
}

/** Add the field (if any) to the first form page and build the stamp at `box`. */
export function addPdfOnlyElement(
  def: FormDefinition,
  entry: PaletteEntry,
  page: number,
  box: { x: number; y: number },
  newId: () => string,
): PdfOnlyResult {
  const size = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
  let definition = def;
  let fieldId: string;
  if (entry.fieldType) {
    fieldId = uniqueFieldId(def, `pdf_${entry.id}_`);
    const field: FormField = {
      id: fieldId,
      type: entry.fieldType,
      label: entry.fieldLabel ?? entry.label,
      settings: { pdfOnly: true },
    };
    const [first, ...rest] = def.pages;
    definition = { ...def, pages: [{ ...first!, fields: [...first!.fields, field] }, ...rest] };
  } else {
    // Stamp-only elements point at a fixed id that stampPdf never resolves.
    fieldId = `_${entry.id}`;
  }
  const stamp: PdfStamp = { ...entry.stamp, id: newId(), fieldId, page, x: box.x, y: box.y, ...size };
  return { definition, stamp };
}

/** Remove a pdf-only field when its stamp is deleted. */
export function dropPdfOnlyField(def: FormDefinition, fieldId: string): FormDefinition {
  const target = allFields(def).find((f) => f.id === fieldId);
  if (!target?.settings?.pdfOnly) return def;
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.filter((f) => f.id !== fieldId) })) };
}
