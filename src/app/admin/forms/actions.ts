"use server";
import { redirect } from "next/navigation";
import { createTemplate, duplicateTemplate, publishTemplate, saveDraft, setArchived } from "@/server/forms-store";
import { parseFormDefinition } from "@/lib/forms/schema";
import { pdfMappingSchema } from "@/lib/forms/pdf-mapping";

export async function createFormAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "טופס חדש";
  const id = await createTemplate(title);
  redirect(`/admin/forms/${id}`);
}

/** A form that starts from an uploaded PDF: opens straight on the PDF tab. */
export async function createPdfFormAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "טופס מ-PDF";
  const id = await createTemplate(title, undefined, "pdf");
  redirect(`/admin/forms/${id}?tab=pdf`);
}

export async function importFormAction(formData: FormData) {
  const raw = String(formData.get("json") ?? "");
  let parsed;
  try {
    parsed = parseFormDefinition(JSON.parse(raw));
  } catch {
    return redirect("/admin/forms?error=json");
  }
  if (!parsed.success) return redirect("/admin/forms?error=schema");
  const id = await createTemplate(parsed.data.title, parsed.data);
  redirect(`/admin/forms/${id}`);
}

export async function duplicateFormAction(formData: FormData) {
  const id = await duplicateTemplate(String(formData.get("id")));
  redirect(id ? `/admin/forms/${id}` : "/admin/forms");
}

export async function archiveFormAction(formData: FormData) {
  await setArchived(String(formData.get("id")), formData.get("archive") === "1");
  redirect("/admin/forms");
}

export async function saveDraftAction(templateId: string, definition: unknown, pdf?: { pdfFileId: string | null; pdfMapping: unknown }) {
  let pdfArg;
  if (pdf) {
    const mapping = pdf.pdfMapping === null ? null : pdfMappingSchema.safeParse(pdf.pdfMapping);
    if (mapping && "success" in mapping && !mapping.success) return { error: "מיפוי ה-PDF אינו תקין" };
    pdfArg = { pdfFileId: pdf.pdfFileId, pdfMapping: mapping && "success" in mapping ? mapping.data : null };
  }
  return saveDraft(templateId, definition, pdfArg);
}

export async function publishAction(templateId: string) {
  return publishTemplate(templateId);
}
