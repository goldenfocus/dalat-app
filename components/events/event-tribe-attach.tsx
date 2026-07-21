"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type HostableTribe = { id: string; slug: string; name: string };

type Membership = {
  role: string;
  tribes: { id: string; slug: string; name: string } | null;
};

/**
 * Inline "Add to a tribe" control on the event page, for the event owner.
 *
 * Exists because 167 of 168 published events predate any tribe attachment, and
 * sending an organizer back through the full event form to set one field is
 * the friction that kept events unattached.
 */
export function EventTribeAttach({
  eventSlug,
  currentTribeId,
}: {
  eventSlug: string;
  currentTribeId: string | null;
}) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [tribes, setTribes] = useState<HostableTribe[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || tribes) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/tribes/me");
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { tribes: Membership[] };
        if (cancelled) return;
        // Same leader/admin filter the event form applies — you can only host
        // as a tribe you actually run.
        setTribes(
          data.tribes
            .filter((m) => m.role === "leader" || m.role === "admin")
            .map((m) => m.tribes)
            .filter((x): x is HostableTribe => x !== null)
        );
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, tribes]);

  function handleSelect(tribeId: string) {
    setError(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/events/${eventSlug}/tribe`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tribe_id: tribeId }),
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="min-h-11 px-3 -ml-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
      >
        {currentTribeId ? (
          <Users className="w-4 h-4 mr-2" />
        ) : (
          <Plus className="w-4 h-4 mr-2" />
        )}
        {currentTribeId ? t("changeTribe") : t("addToTribe")}
      </Button>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-2">{t("attachFailed")}</p>
    );
  }

  if (tribes === null) {
    return (
      <p className="text-sm text-muted-foreground py-2">{t("loadingTribes")}</p>
    );
  }

  if (tribes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        {t("noTribesToAttach")}
      </p>
    );
  }

  return (
    <Select onValueChange={handleSelect} disabled={isPending}>
      <SelectTrigger className="min-h-11">
        <SelectValue placeholder={t("pickTribe")} />
      </SelectTrigger>
      <SelectContent>
        {tribes.map((tribe) => (
          <SelectItem key={tribe.id} value={tribe.id}>
            {tribe.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
