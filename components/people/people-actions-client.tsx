"use client";

import { useId, useState } from "react";
import { Flag, ShieldBan } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PEOPLE_REPORT_REASONS } from "@/lib/people/constants";
import { requestPeople } from "./request";

export interface PeopleActionCopy {
  block: string;
  blocking: string;
  blockConfirm: string;
  blockScope: string;
  blockedSuccess: string;
  actionError: string;
  report: string;
  reportTitle: string;
  reportReason: string;
  reportDetails: string;
  reportDetailsPlaceholder: string;
  submitReport: string;
  submittingReport: string;
  reportSuccess: string;
  reportError: string;
  reportReasons: Record<string, string>;
  cancel: string;
}

export function PeopleActionsClient({ userId, copy, reportOnly = false }: { userId: string; copy: PeopleActionCopy; reportOnly?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [panel, setPanel] = useState<"block" | "report" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function block() {
    setBusy(true);
    setError(null);
    try {
      await requestPeople("/api/people/block", "POST", { user_id: userId });
      toast.success(copy.blockedSuccess);
      setPanel(null);
      setStatus(copy.blockedSuccess);
      router.refresh();
    } catch {
      setError(copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPeople("/api/people/report", "POST", { user_id: userId, reason, details: details.trim() });
      setStatus(copy.reportSuccess);
      setPanel(null);
      setDetails("");
      setReason("");
    } catch {
      setError(copy.reportError);
    } finally {
      setBusy(false);
    }
  }

  function open(next: "block" | "report") {
    setError(null);
    setStatus(null);
    setPanel(panel === next ? null : next);
  }

  return (
    <div className={reportOnly ? "mt-1" : "mt-6 border-t border-border pt-3"}>
      <div className="flex flex-wrap gap-2">
        {!reportOnly && <Button type="button" variant="ghost" disabled={busy} onClick={() => open("block")} aria-expanded={panel === "block"} className="min-h-11 text-muted-foreground">
          <ShieldBan aria-hidden="true" />{copy.block}
        </Button>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => open("report")} aria-expanded={panel === "report"} className="min-h-11 text-muted-foreground">
          <Flag aria-hidden="true" />{copy.report}
        </Button>
      </div>

      {panel === "block" && (
        <div className="mt-3 space-y-3 rounded-xl border border-border p-4">
          <p className="font-medium">{copy.blockConfirm}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.blockScope}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className="min-h-11" disabled={busy} loading={busy} onClick={() => void block()}>{busy ? copy.blocking : copy.block}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setPanel(null)}>{copy.cancel}</Button>
          </div>
        </div>
      )}

      {panel === "report" && (
        <form onSubmit={report} className="mt-3 space-y-4 rounded-xl border border-border p-4">
          <h3 className="font-medium">{copy.reportTitle}</h3>
          <div className="space-y-2">
            <label htmlFor={`${id}-reason`} className="text-sm font-medium">{copy.reportReason}</label>
            <select id={`${id}-reason`} required value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="" disabled>{copy.reportReason}</option>
              {PEOPLE_REPORT_REASONS.map((value) => <option key={value} value={value}>{copy.reportReasons[value]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-details`} className="text-sm font-medium">{copy.reportDetails}</label>
            <Textarea id={`${id}-details`} value={details} onChange={(event) => setDetails(event.target.value)} disabled={busy} maxLength={1000} rows={4} placeholder={copy.reportDetailsPlaceholder} className="text-base" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !reason} loading={busy} className="min-h-11">{busy ? copy.submittingReport : copy.submitReport}</Button>
            <Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={() => setPanel(null)}>{copy.cancel}</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    </div>
  );
}
