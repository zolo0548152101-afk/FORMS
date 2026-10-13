import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { blankForm, publishIssues } from "@/lib/forms/builder";
import { parseFormDefinition, type FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";

const { formTemplates, formTemplateVersions, pdfFiles } = schema;

export async function listTemplates() {
  return db.select().from(formTemplates).orderBy(desc(formTemplates.updatedAt));
}

export async function createTemplate(title: string, definition?: FormDefinition, kind: "web" | "pdf" | "both" = "web"): Promise<string> {
  const def = definition ?? blankForm(title);
  const [t] = await db
    .insert(formTemplates)
    .values({ slug: `form-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`, title, kind })
    .returning({ id: formTemplates.id });
  await db.insert(formTemplateVersions).values({ templateId: t!.id, version: 1, definition: { ...def, title } });
  return t!.id;
}

/** The newest version (draft if one exists, otherwise the published one). */
export async function getEditorData(templateId: string) {
  const [template] = await db.select().from(formTemplates).where(eq(formTemplates.id, templateId));
  if (!template) return null;
  const [version] = await db
    .select()
    .from(formTemplateVersions)
    .where(eq(formTemplateVersions.templateId, templateId))
    .orderBy(desc(formTemplateVersions.version))
    .limit(1);
  return { template, version: version! };
}

export async function getPublishedVersion(templateId: string) {
  const [v] = await db
    .select()
    .from(formTemplateVersions)
    .where(and(eq(formTemplateVersions.templateId, templateId)))
    .orderBy(desc(formTemplateVersions.version));
  return v ?? null;
}

/**
 * Saves into the newest version if it is still a draft; if it is published, creates the next
 * version as a draft (published versions are immutable). Returns the version number saved to.
 */
export async function saveDraft(
  templateId: string,
  definition: unknown,
  pdf?: { pdfFileId: string | null; pdfMapping: PdfMapping | null },
): Promise<{ version: number } | { error: string }> {
  const parsed = parseFormDefinition(definition);
  if (!parsed.success) return { error: "הגדרת הטופס אינה תקינה" };
  const data = await getEditorData(templateId);
  if (!data) return { error: "הטופס לא נמצא" };
  const { version } = data;
  const extra = pdf ? { pdfFileId: pdf.pdfFileId, pdfMapping: pdf.pdfMapping } : {};
  if (version.publishedAt) {
    await db.insert(formTemplateVersions).values({
      templateId,
      version: version.version + 1,
      definition: parsed.data,
      pdfFileId: pdf ? pdf.pdfFileId : version.pdfFileId,
      pdfMapping: pdf ? pdf.pdfMapping : version.pdfMapping,
    });
    await db.update(formTemplates).set({ title: parsed.data.title }).where(eq(formTemplates.id, templateId));
    return { version: version.version + 1 };
  }
  await db.update(formTemplateVersions).set({ definition: parsed.data, ...extra }).where(eq(formTemplateVersions.id, version.id));
  await db.update(formTemplates).set({ title: parsed.data.title }).where(eq(formTemplates.id, templateId));
  return { version: version.version };
}

export async function publishTemplate(templateId: string): Promise<{ ok: true; version: number } | { ok: false; issues: string[] }> {
  const data = await getEditorData(templateId);
  if (!data) return { ok: false, issues: ["הטופס לא נמצא"] };
  if (data.version.publishedAt) return { ok: false, issues: ["אין טיוטה חדשה לפרסום"] };
  const issues = publishIssues(data.version.definition);
  if (issues.length) return { ok: false, issues: issues.map((i) => i.message) };
  await db.update(formTemplateVersions).set({ publishedAt: new Date() }).where(eq(formTemplateVersions.id, data.version.id));
  await db
    .update(formTemplates)
    .set({ status: "active", publishedVersion: data.version.version, title: data.version.definition.title })
    .where(eq(formTemplates.id, templateId));
  return { ok: true, version: data.version.version };
}

export async function duplicateTemplate(templateId: string): Promise<string | null> {
  const data = await getEditorData(templateId);
  if (!data) return null;
  const title = `${data.template.title} (עותק)`;
  return createTemplate(title, data.version.definition);
}

export async function setArchived(templateId: string, archived: boolean) {
  const data = await getEditorData(templateId);
  if (!data) return;
  await db
    .update(formTemplates)
    .set({ status: archived ? "archived" : data.template.publishedVersion ? "active" : "draft" })
    .where(eq(formTemplates.id, templateId));
}

export async function getPdfFile(id: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(pdfFiles).where(eq(pdfFiles.id, id));
  return row ?? null;
}
