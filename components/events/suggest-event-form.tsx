"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Link2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SuggestEventCopy {
  urlLabel: string;
  urlPlaceholder: string;
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/events/suggest", {
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
          required
          maxLength={2048}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={copy.urlPlaceholder}
          className="h-12 pl-10"
          aria-describedby="event-suggestion-note event-suggestion-error"
        />
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
        disabled={!url.trim()}
      >
        {!submitting && <Send aria-hidden="true" />}
        {submitting ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
