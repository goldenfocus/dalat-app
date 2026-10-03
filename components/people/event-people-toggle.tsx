"use client";

import { useId, useState } from "react";
import { useRouter } from "@/lib/i18n/routing";
import { Loader2 } from "lucide-react";
import { requestPeople } from "./request";

interface EventPeopleCopy {
  share: string;
  description: string;
  attendeeNotice: string;
  required: string;
  shared: string;
  unshared: string;
  error: string;
}

export function EventPeopleToggle({
  eventId,
  joined,
  canJoin,
  copy,
}: {
  eventId: string;
  joined: boolean;
  canJoin: boolean;
  copy: EventPeopleCopy;
}) {
  const router = useRouter();
  const id = useId();
  const [shared, setShared] = useState(joined);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(value: boolean) {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      await requestPeople("/api/people/event", value ? "POST" : "DELETE", { event_id: eventId });
      setShared(value);
      setStatus(value ? copy.shared : copy.unshared);
      router.refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input
          id={id}
          type="checkbox"
          checked={shared}
          disabled={busy || (!canJoin && !shared)}
          onChange={(event) => void change(event.target.checked)}
          aria-describedby={`${id}-description`}
          className="h-5 w-5 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <span>{copy.share}</span>
        {busy && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
      </label>
      <p id={`${id}-description`} className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.attendeeNotice}</p>
      {!canJoin && !shared && <p className="mt-3 text-sm text-muted-foreground">{copy.required}</p>}
      {status && <p role="status" className="mt-3 text-sm">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
