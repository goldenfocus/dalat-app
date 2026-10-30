"use client";

import { useRouter } from "@/lib/i18n/routing";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/storage/client";
import type { OperatingHours } from "@/lib/types";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type Fields = {
  name: string; description: string; phone: string; email: string; website_url: string;
  facebook_url: string; instagram_url: string; logo_url: string;
};

export function VenueProfileForm({ venue }: {
  venue: Fields & { id: string; slug: string; operating_hours: OperatingHours | null };
}) {
  const t = useTranslations("venueClaim");
  const tv = useTranslations("venues");
  const locale = useLocale();
  const router = useRouter();
  const dayLabel = (i: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)));
  const [f, setF] = useState<Fields>({
    name: venue.name, description: venue.description || "", phone: venue.phone || "", email: venue.email || "",
    website_url: venue.website_url || "", facebook_url: venue.facebook_url || "",
    instagram_url: venue.instagram_url || "", logo_url: venue.logo_url || "",
  });
  const [hours, setHours] = useState<OperatingHours>(venue.operating_hours || {});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const field = (key: keyof Fields, label: string, type = "text") => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Input type={type} required={key === "name"} maxLength={key === "name" ? 200 : undefined} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    const { publicUrl } = await uploadFile("venue-media", file, { entityId: venue.id });
    setF((s) => ({ ...s, logo_url: publicUrl }));
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    try {
      const fields = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, value.trim() || null]));
      const res = await fetch(`/api/venues/${venue.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, operating_hours: Object.keys(hours).length ? hours : null }),
      });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) router.refresh();
    } catch { setStatus("error"); }
  };
  return (
    <form onSubmit={save} className="space-y-5">
      {field("name", t("venueName"))}
      <div className="flex items-center gap-4">
        {f.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <span className="h-16 w-16 rounded-xl bg-muted" />
        )}
        <label className="text-sm font-medium underline cursor-pointer">
          {t("uploadLogo")}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => uploadLogo(e.target.files?.[0])} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{tv("about")}</span>
        <Textarea rows={5} maxLength={4000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      {field("phone", t("businessPhone"), "tel")}
      {field("email", t("businessEmail"), "email")}
      {field("website_url", tv("visitWebsite"), "url")}
      {field("facebook_url", "Facebook", "url")}
      {field("instagram_url", "Instagram", "url")}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tv("hours")}</legend>
        {DAYS.map((d, i) => {
          const v = hours[d];
          const closed = v === "closed";
          const open = v && v !== "closed" ? v : { open: "", close: "" };
          return (
            <div key={d} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-sm">
              <span className="min-w-0">{dayLabel(i)}</span>
              <Input type="time" className="min-w-0 w-full" disabled={closed} value={open.open}
                onChange={(e) => setHours({ ...hours, [d]: { open: e.target.value, close: open.close || "21:00" } })} />
              <Input type="time" className="min-w-0 w-full" disabled={closed} value={open.close}
                onChange={(e) => setHours({ ...hours, [d]: { open: open.open || "08:00", close: e.target.value } })} />
              <label className="col-span-2 col-start-2 flex min-h-11 items-center gap-1">
                <input type="checkbox" checked={closed}
                  onChange={(e) => setHours({ ...hours, [d]: e.target.checked ? "closed" : { open: "08:00", close: "21:00" } })} />
                {t("closed")}
              </label>
            </div>
          );
        })}
      </fieldset>
      <Button type="submit" className="w-full" disabled={status === "saving"}>
        {status === "saving" ? t("saving") : t("save")}
      </Button>
      {status === "saved" && <p className="text-sm text-green-600">{t("saved")}</p>}
      {status === "error" && <p className="text-sm text-destructive">{t("failed")}</p>}
    </form>
  );
}
