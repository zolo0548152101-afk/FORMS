import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { listTemplates } from "@/server/forms-store";
import { archiveFormAction, createFormAction, createPdfFormAction, duplicateFormAction, importFormAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS = { draft: ["טיוטה", "warning"], active: ["פעיל", "success"], archived: ["בארכיון", "muted"] } as const;

export default async function FormsListPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const templates = await listTemplates();
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">טפסים</h1>
        <form action={createFormAction} className="flex gap-2">
          <Input name="title" placeholder="שם הטופס החדש" className="w-56" />
          <Button type="submit">טופס חדש</Button>
          <Button type="submit" variant="outline" formAction={createPdfFormAction}>טופס מ-PDF</Button>
        </form>
      </div>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">הייבוא נכשל: {error === "json" ? "הקובץ אינו JSON תקין" : "הגדרת הטופס אינה תקינה"}</p>}

      <Card className="divide-y">
        {templates.length === 0 && <p className="p-6 text-center text-muted-foreground">עדיין אין טפסים. צרו את הראשון למעלה.</p>}
        {templates.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1">
              <Link href={`/admin/forms/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
              <p className="text-xs text-muted-foreground" dir="ltr">{t.slug}</p>
            </div>
            <Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>
            <span className="text-sm text-muted-foreground">{t.publishedVersion ? `גרסה ${t.publishedVersion}` : "לא פורסם"}</span>
            <span className="text-sm text-muted-foreground">{fmt.format(t.updatedAt)}</span>
            <div className="flex gap-1">
              <form action={duplicateFormAction}><input type="hidden" name="id" value={t.id} /><Button variant="ghost" size="sm" type="submit">שכפול</Button></form>
              <form action={archiveFormAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="archive" value={t.status === "archived" ? "0" : "1"} />
                <Button variant="ghost" size="sm" type="submit">{t.status === "archived" ? "שחזור" : "ארכוב"}</Button>
              </form>
            </div>
          </div>
        ))}
      </Card>

      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">ייבוא טופס מ-JSON</summary>
        <form action={importFormAction} className="mt-3 space-y-2">
          <Textarea name="json" dir="ltr" rows={6} placeholder='{"schemaVersion":1,"title":"…","pages":[…]}' required />
          <Button type="submit" variant="outline">ייבוא</Button>
        </form>
      </details>
    </main>
  );
}
