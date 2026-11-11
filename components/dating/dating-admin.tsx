"use client";
import { useState } from "react";
import type { DatingCopy } from "@/lib/dating/live-types";
interface Report {
  id: string;
  target_name: string;
  reporter_name: string;
  reason: string;
  details: string;
}
export function DatingAdmin({
  initial,
  copy: c,
}: {
  initial: Report[];
  copy: DatingCopy;
}) {
  const [evidence, setEvidence] = useState<
    Record<string, { id: string; sender_id: string; body: string }[]>
  >({});
  const [reports, setReports] = useState(initial),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  async function review(id: string, suspend: boolean) {
    setBusy(id);
    try {
      const r = await fetch("/api/dating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "moderate", report: id, suspend }),
      });
      if (!r.ok) throw new Error();
      setReports((p) => p.filter((x) => x.id !== id));
    } catch {
      setError(c.error);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{c.adminTitle}</h1>
      {error && <p role="alert">{error}</p>}
      {!reports.length && <p>{c.noReports}</p>}
      {reports.map((r) => (
        <article key={r.id} className="border p-5 space-y-3">
          <h2>{r.target_name}</h2>
          <p>
            {c.reportFrom}: {r.reporter_name}
          </p>
          <p>{c[r.reason]}</p>
          <p className="whitespace-pre-wrap break-words">{r.details}</p>
          <button
            onClick={() => {
              void fetch(`/api/dating?admin=1&report=${r.id}`, {
                cache: "no-store",
              })
                .then((res) => {
                  if (!res.ok) throw new Error();
                  return res.json();
                })
                .then((d) => setEvidence((p) => ({ ...p, [r.id]: d.messages })))
                .catch(() => setError(c.error));
            }}
          >
            {c.viewMessages}
          </button>
          {evidence[r.id]?.map((m) => (
            <p
              className="whitespace-pre-wrap break-words border-l pl-3"
              key={m.id}
            >
              {m.body}
            </p>
          ))}
          <div className="flex gap-4">
            <button
              disabled={busy !== null}
              onClick={() => void review(r.id, false)}
            >
              {c.reviewed}
            </button>
            <button
              disabled={busy !== null}
              onClick={() => void review(r.id, true)}
            >
              {c.suspend}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
