"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { CheckCircle2, ImageUp, Link2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateFlyerMetadata } from "@/lib/events/flyer-suggestion";

export interface SuggestEventCopy {
  urlLabel: string;
  urlPlaceholder: string;
  or: string;
  flyerLabel: string;
  flyerHint: string;
  chooseFlyer: string;
  replaceFlyer: string;
  removeFlyer: string;
  privacyNote: string;
  submit: string;
  submitting: string;
  success: string;
  successDelayed: string;
  duplicate: string;
  suggestAnother: string;
  errors: Record<string, string>;
}

interface SuggestEventFormProps {
  copy: SuggestEventCopy;
}

type SubmissionResult = {
  duplicate?: boolean;
  reviewDelayed?: boolean;
};

export function SuggestEventForm({ copy }: SuggestEventFormProps) {
  const [url, setUrl] = useState("");
  const [flyer, setFlyer] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const flyerInputRef = useRef<HTMLInputElement>(null);

  function handleFlyerChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    if (!selected) return;
    const validationCode = validateFlyerMetadata(selected);
    if (validationCode) {
      setFlyer(null);
      event.target.value = "";
      setError(copy.errors[validationCode] ?? copy.errors.unknown);
      return;
    }
    setFlyer(selected);
    setUrl("");
  }

  function removeFlyer() {
    setFlyer(null);
    if (flyerInputRef.current) flyerInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = flyer
        ? await (() => {
            const formData = new FormData();
            formData.append("flyer", flyer);
            return fetch("/api/events/suggest", { method: "POST", body: formData });
          })()
        : await fetch("/api/events/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        duplicate?: boolean;
        reviewDelayed?: boolean;
      };

      if (!response.ok) {
        setError(copy.errors[body.code ?? "unknown"] ?? copy.errors.unknown);
        return;
      }

      setResult({ duplicate: body.duplicate, reviewDelayed: body.reviewDelayed });
      setUrl("");
      removeFlyer();
    } catch {
      setError(copy.errors.network);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
        <p className="font-medium">
          {result.duplicate
            ? copy.duplicate
            : result.reviewDelayed
              ? copy.successDelayed
              : copy.success}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 min-h-11"
          onClick={() => setResult(null)}
        >
          {copy.suggestAnother}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <label htmlFor="event-source-url" className="mb-2 block text-sm font-medium">
        {copy.urlLabel}
      </label>
      <div className="relative">
        <Link2
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="event-source-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          maxLength={2048}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (event.target.value) removeFlyer();
          }}
          placeholder={copy.urlPlaceholder}
          className="h-12 pl-10"
          aria-describedby="event-suggestion-note event-suggestion-error"
        />
      </div>
      <div className="my-4 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {copy.or}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div>
        <span className="mb-2 block text-sm font-medium">{copy.flyerLabel}</span>
        <input
          ref={flyerInputRef}
          id="event-flyer"
          name="flyer"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleFlyerChange}
        />
        {flyer ? (
          <div className="flex min-h-12 items-center gap-3 rounded-md border px-3 py-2">
            <ImageUp className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm">{flyer.name}</span>
            <label
              htmlFor="event-flyer"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-medium hover:bg-accent"
            >
              {copy.replaceFlyer}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={removeFlyer}
              aria-label={copy.removeFlyer}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <label
            htmlFor="event-flyer"
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm font-medium hover:bg-accent"
          >
            <ImageUp className="h-5 w-5" aria-hidden="true" />
            {copy.chooseFlyer}
          </label>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{copy.flyerHint}</p>
      </div>
      <p id="event-suggestion-note" className="mt-2 text-sm text-muted-foreground">
        {copy.privacyNote}
      </p>
      {error && (
        <p id="event-suggestion-error" className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="mt-5 min-h-11 w-full"
        loading={submitting}
        disabled={!url.trim() && !flyer}
      >
        {!submitting && <Send aria-hidden="true" />}
        {submitting ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
