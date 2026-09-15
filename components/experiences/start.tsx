"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
export function StartExperience({
  label,
  errorLabel,
  from,
}: {
  label: string;
  errorLabel: string;
  from?: string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <Button
        className="w-full min-h-14 rounded-xl"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          try {
            const r = await fetch("/api/experiences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale, ...(from ? { from } : {}) }),
            });
            if (!r.ok) throw Error();
            const { id } = await r.json();
            router.push(`/experiences/${id}/edit`);
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : label}
      </Button>
      {error && (
        <p role="alert" className="py-3">
          {errorLabel}
        </p>
      )}
    </div>
  );
}
