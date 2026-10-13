"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function VenueClaimForm({ venueId }: { venueId: string }) {
  const t = useTranslations("venueClaim");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ contactEmail: "", contactPhone: "", note: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contactEmail && !form.contactPhone && !form.note) { setError(t("proofRequired")); return; }
    setState("sending"); setError("");
    const res = await fetch(`/api/venues/${venueId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setState("sent"); return; }
    const { error: code } = await res.json().catch(() => ({ error: "" }));
    setState("error");
    setError(code === "already_pending" ? t("alreadyPending") : code === "not_claimable" ? t("alreadyClaimed") : t("failed"));
  };
  if (state === "sent") return <p className="rounded-2xl bg-muted p-5">{t("sent")}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("businessEmail")}</span>
        <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("businessPhone")}</span>
        <Input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("note")}</span>
        <Textarea rows={4} maxLength={1000} placeholder={t("notePlaceholder")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
