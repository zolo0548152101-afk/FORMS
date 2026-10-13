"use client";
import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { nanoid } from "nanoid";
import { PdfPlacement } from "@/components/pdf/PdfPlacement";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { addPdfOnlyElement } from "@/lib/forms/pdf-only";
import { sampleForm } from "../../../../tests/fixtures/sample-form";

/** No-database demo: generates a blank A4 PDF in the browser and lets you place sample-form fields on it. */
export function PlacementDemo() {
  const [definition, setDefinition] = useState(sampleForm);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [mapping, setMapping] = useState<PdfMapping>({ schemaVersion: 1, pages: [{ width: 595.28, height: 841.89 }], stamps: [] });
  useEffect(() => {
    (async () => {
      const doc = await PDFDocument.create();
      doc.addPage([595.28, 841.89]);
      setData(await doc.save());
    })();
  }, []);
  if (!data) return <p>טוען…</p>;
  return (
    <>
      <PdfPlacement
        definition={definition}
        source={{ data }}
        pages={mapping.pages}
        mapping={mapping}
        onMappingChange={setMapping}
        onDrawElement={(entry, page, at) => {
          const r = addPdfOnlyElement(definition, entry, page, at, () => nanoid(8));
          setDefinition(r.definition);
          setMapping((m) => ({ ...m, stamps: [...m.stamps, r.stamp] }));
          return r.stamp.id;
        }}
      />
      <pre dir="ltr" data-testid="mapping" className="mt-4 max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(mapping.stamps, null, 1)}</pre>
    </>
  );
}
