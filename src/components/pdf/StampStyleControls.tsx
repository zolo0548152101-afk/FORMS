"use client";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/checkbox";
import { DATE_FORMATS } from "@/lib/pdf/stamp-helpers";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";

/** Ink colours offered for stamps (PDF output is not themed, so these are literal values). */
export const STAMP_COLORS = [
  { value: "", label: "שחור" },
  { value: "#1a3c8c", label: "כחול" },
  { value: "#b00020", label: "אדום" },
  { value: "#1b6b3a", label: "ירוק" },
] as const;

const TEXTUAL = new Set<PdfStamp["kind"]>(["text", "comb", "date_signed", "initials"]);

/** Typography and repeat settings for the selected stamp. */
export function StampStyleControls({
  stamp,
  pageCount,
  onPatch,
}: {
  stamp: PdfStamp;
  pageCount: number;
  onPatch: (patch: Partial<PdfStamp>) => void;
}) {
  const textual = TEXTUAL.has(stamp.kind);
  const allPages = Array.from({ length: pageCount }, (_, i) => i).filter((i) => i !== stamp.page);
  const onAll = allPages.length > 0 && allPages.every((i) => stamp.repeatOnPages?.includes(i));
  return (
    <>
      {textual && (
        <>
          <div className="space-y-1">
            <Label className="text-muted-foreground">גודל גופן (ריק = אוטומטי)</Label>
            <Input type="number" dir="ltr" className="h-9 text-start" min={4} max={40} value={stamp.fontSize ?? ""} onChange={(e) => onPatch({ fontSize: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">יישור</Label>
            <Select className="h-9" aria-label="יישור" value={stamp.align ?? ""} onChange={(e) => onPatch({ align: (e.target.value || undefined) as PdfStamp["align"] })}>
              <option value="">אוטומטי (לפי השפה)</option><option value="right">ימין</option><option value="left">שמאל</option><option value="center">מרכז</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">יישור אנכי</Label>
            <Select className="h-9" aria-label="יישור אנכי" value={stamp.valign ?? ""} onChange={(e) => onPatch({ valign: (e.target.value || undefined) as PdfStamp["valign"] })}>
              <option value="">אמצע</option><option value="top">למעלה</option><option value="bottom">למטה</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">צבע</Label>
            <Select className="h-9" aria-label="צבע" value={stamp.color ?? ""} onChange={(e) => onPatch({ color: e.target.value || undefined })}>
              {STAMP_COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={!!stamp.bold} onCheckedChange={(c) => onPatch({ bold: c || undefined })} label="בולד" />
            בולד
          </label>
        </>
      )}
      {stamp.kind === "text" && (
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={!!stamp.multiline} onCheckedChange={(c) => onPatch({ multiline: c || undefined })} label="רב-שורה" />
          רב-שורה
        </label>
      )}
      {stamp.kind === "comb" && (
        <div className="space-y-1">
          <Label className="text-muted-foreground">מספר תאים</Label>
          <Input type="number" dir="ltr" className="h-9 text-start" min={1} max={40} value={stamp.comb?.cells ?? ""} onChange={(e) => onPatch({ comb: e.target.value ? { cells: Math.min(40, Math.max(1, Number(e.target.value))) } : undefined })} />
        </div>
      )}
      {stamp.kind === "date_signed" && (
        <div className="space-y-1">
          <Label className="text-muted-foreground">פורמט תאריך</Label>
          <Select className="h-9" aria-label="פורמט תאריך" value={stamp.dateFormat ?? "dd/mm/yyyy"} onChange={(e) => onPatch({ dateFormat: e.target.value as PdfStamp["dateFormat"] })}>
            {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
      )}
      {pageCount > 1 && (
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={onAll} onCheckedChange={(c) => onPatch({ repeatOnPages: c ? allPages : undefined })} label="בכל העמודים" />
          בכל העמודים
        </label>
      )}
    </>
  );
}
