import { describe, expect, it } from "vitest";
import { addPdfOnlyElement, dropPdfOnlyField, PDF_PALETTE, uniqueFieldId } from "@/lib/forms/pdf-only";
import { parseFormDefinition } from "@/lib/forms/schema";
import { pdfMappingSchema } from "@/lib/forms/pdf-mapping";

const empty = () => parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields: [] }] }).data!;
const entry = (id: string) => PDF_PALETTE.find((e) => e.id === id)!;

describe("pdf-only elements", () => {
  it("creates a field and a stamp together", () => {
    let n = 0;
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("id"), 0, { x: 100, y: 200 }, () => `s${++n}`);
    const f = definition.pages[0]!.fields[0]!;
    expect(f).toMatchObject({ type: "id_number", settings: { pdfOnly: true } });
    expect(stamp).toMatchObject({ kind: "comb", fieldId: f.id, comb: { cells: 9 }, x: 100, y: 200, page: 0 });
    expect(parseFormDefinition(definition).success).toBe(true);
    expect(pdfMappingSchema.safeParse({ schemaVersion: 1, pages: [{ width: 1, height: 1 }], stamps: [stamp] }).success).toBe(true);
  });

  it("keeps ids unique across repeated adds", () => {
    let def = empty();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = addPdfOnlyElement(def, entry("text"), 0, { x: 0, y: 0 }, () => `s${i}`);
      def = r.definition;
      ids.push(r.stamp.fieldId);
    }
    expect(new Set(ids).size).toBe(3);
    expect(uniqueFieldId(def, "pdf_text_")).toBe("pdf_text_4");
  });

  it("stamp-only elements add no field", () => {
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("date_signed"), 1, { x: 5, y: 5 }, () => "d");
    expect(definition.pages[0]!.fields).toHaveLength(0);
    expect(stamp).toMatchObject({ kind: "date_signed", page: 1 });
  });

  it("drops only pdf-only fields", () => {
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("signature"), 0, { x: 0, y: 0 }, () => "x");
    expect(dropPdfOnlyField(definition, stamp.fieldId).pages[0]!.fields).toHaveLength(0);
    const normal = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields: [{ id: "a", type: "short_text", label: "א" }] }] }).data!;
    expect(dropPdfOnlyField(normal, "a")).toBe(normal);
  });
});
