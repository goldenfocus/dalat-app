"use client";
import { useEffect, useRef, useState } from "react";
import { autofill, restoreAutofill } from "@/lib/experiences/autofill";
import { needsPeopleReminder } from "@/lib/experiences/sensitive-media";
import {
  publicationReady,
  confirmPublication,
} from "@/lib/experiences/publication";
import { AttributedText } from "./attributed-text";
import { LiveInterview } from "./live-interview";
import { recordingMime } from "@/lib/experiences/recording";
import type { LiveTurn } from "@/lib/experiences/live-schema";
import {
  Camera,
  Mic,
  Square,
  ArrowRight,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import {
  categories,
  type saveSchema,
  type ExperienceStory,
} from "@/lib/experiences/schema";
import { localDraft, clearLocalDraft } from "@/lib/experiences/local-draft";
import type { z } from "zod";
import type en from "@/messages/en.json";
import type { Locale } from "@/lib/i18n/routing";
type Labels = typeof en.experiences;
type Story = z.infer<typeof saveSchema>;
type Media = {
  id: string;
  kind: "audio" | "photo";
  mime: string;
  preview_path: string | null;
  capture_mode?: "record" | "live";
};
type Pending = {
  capture_mode?: "record" | "live";
  id: string;
  blob: Blob;
  kind: "audio" | "photo";
  mime: string;
};
type Recovery = { story: Story; notes: string; pending: Pending[] };
export type InitialExperienceData = {
  username?: string | null;
  story: Story;
  notes: string;
  transcript: string;
  question: string;
  suggestion: ExperienceStory | null;
  media: Media[];
  published: boolean;
  conversation: LiveTurn[];
  photoHints?: {
    venues: Venue[];
    hasLocation: boolean;
    date: string | null;
    basis?: string;
  };
};
type Venue = { id: string; name: string; address: string };
function PendingPhoto({ blob, alt }: { blob: Blob; alt: string }) {
  const [src] = useState(() => URL.createObjectURL(blob));
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  return (
    <img
      src={src}
      alt={alt}
      className="h-16 w-16 shrink-0 rounded-lg object-cover mr-3"
    />
  );
}

export function ExperienceEditor({
  id,
  userId,
  locale,
  labels: t,
  aiAvailable,
  liveAvailable,
  initial,
}: {
  id: string;
  userId: string;
  locale: Locale;
  labels: Labels;
  aiAvailable: boolean;
  liveAvailable: boolean;
  initial: InitialExperienceData;
}) {
  const router = useRouter();
  const key = `${userId}/${id}`;
  const [story, setStory] = useState<Story>(() =>
    initial.suggestion && !initial.published
      ? restoreAutofill(initial.story, initial.suggestion)
      : initial.story,
  );
  const [notes, setNotes] = useState(initial.notes);
  const [transcript, setTranscript] = useState(initial.transcript);
  const [reviewing, setReviewing] = useState(
    !!(initial.story.title || initial.suggestion),
  );
  const [photoHints, setPhotoHints] = useState(initial.photoHints);
  const reviewRef = useRef<HTMLElement>(null);
  const [suggestion, setSuggestion] = useState<ExperienceStory | null>(
    initial.suggestion,
  );
  const [media, setMedia] = useState<Media[]>(initial.media);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [published, setPublished] = useState(initial.published);
  const [liveActive, setLiveActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [venues, setVenues] = useState<Venue[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const latest = useRef<Recovery>({ story, notes, pending });
  const recordingId = useRef("");
  const stopReason = useRef("");
  const [audioErrors, setAudioErrors] = useState<string[]>([]);
  const localWrite = useRef(Promise.resolve());
  latest.current = { story, notes, pending };
  const waitingWrite = useRef<Recovery | null>(null);
  const writingRecovery = useRef(false);
  function persist(value: Recovery) {
    // Coalesce rapid audio updates instead of retaining a queue of ever-growing
    // blobs and full photo selections on memory-constrained phones.
    waitingWrite.current = value;
    if (!writingRecovery.current) {
      writingRecovery.current = true;
      localWrite.current = (async () => {
        try {
          while (waitingWrite.current) {
            const next = waitingWrite.current;
            waitingWrite.current = null;
            await localDraft(key, next);
          }
        } catch {
          setMessage(t.storageWarning);
        } finally {
          writingRecovery.current = false;
        }
      })();
    }
    return localWrite.current;
  }
  async function api(url: string, method = "GET", body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(t.recovery);
    return result;
  }
  async function refresh() {
    const data = await api(`/api/experiences/${id}`);
    setMedia(data.media);
    setTranscript(data.source?.transcript || "");
    return data;
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Owner-authorized data is already in the server-rendered page. Only
        // device recovery remains; do not repeat auth and database reads over HTTP.
        const recovered = await localDraft<Recovery>(key).catch(
          () => undefined,
        );
        if (!active) return;
        if (recovered && !initial.published) {
          setStory(
            initial.suggestion
              ? restoreAutofill(recovered.story, initial.suggestion)
              : recovered.story,
          );
          setNotes(recovered.notes);
          setPending(recovered.pending || []);
        }
        const restored =
          recovered && !initial.published
            ? recovered
            : { story: initial.story, notes: initial.notes, pending: [] };
        const filled =
          initial.suggestion && !initial.published
            ? restoreAutofill(restored.story, initial.suggestion)
            : restored.story;
        latest.current = { ...restored, story: filled };
        setStory(filled);
        setReady(true);
        if (initial.suggestion && !initial.published)
          void save("save", filled).catch(() => setMessage(t.recovery));
      } catch {
        if (active) setMessage(t.recovery);
      }
    })();
    return () => {
      active = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
    // Initial hydration is keyed by this private draft, never by changes to its fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);
  useEffect(() => {
    if (ready) void persist({ story, notes, pending });
  }, [story, notes, pending, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const hide = () => {
      if (document.hidden && recorder.current?.state === "recording") {
        stopReason.current = t.recordingInterrupted;
        recorder.current.stop();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [recording, t.recordingInterrupted]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (recording || liveActive || busy) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [recording, liveActive, busy]);
  useEffect(() => {
    if (!(recording || liveActive) || !("wakeLock" in navigator)) return;
    let released = false;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (released) await next.release();
        else lock = next;
      } catch {
        /* Low battery or browser policy can deny the optional wake lock. */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, [recording, liveActive]);
  function field<K extends keyof Story>(name: K, value: Story[K]) {
    setStory((s) => ({ ...s, [name]: value }));
  }
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    try {
      await fn();
    } catch {
      setMessage(t.recovery);
    } finally {
      setBusy("");
    }
  }
  async function save(
    action: "save" | "publish" | "unpublish" = "save",
    value = latest.current.story,
  ) {
    await persist({ ...latest.current, story: value });
    await api(`/api/experiences/${id}`, "PATCH", {
      action,
      story: value,
      notes: latest.current.notes,
    });
    setMessage(t.saved);
  }
  async function uploadPending() {
    const db = createClient();
    for (const file of [...latest.current.pending]) {
      const path = `${userId}/${id}/${file.id}`;
      const { error } = await db.storage
        .from("experience-originals")
        .upload(path, file.blob, {
          contentType: file.mime.split(";")[0],
          upsert: false,
        });
      // A previous upload may have succeeded before connectivity was lost. Attach idempotently.
      if (
        error &&
        !["409", "Duplicate"].includes(
          String((error as { statusCode?: string }).statusCode),
        ) &&
        !/already exists/i.test(error.message)
      )
        throw error;
      await api(`/api/experiences/${id}/media`, "POST", {
        id: file.id,
        mime: file.mime,
        kind: file.kind,
        capture_mode: file.capture_mode || "record",
      });
      const next = {
        ...latest.current,
        pending: latest.current.pending.filter((p) => p.id !== file.id),
        story: {
          ...latest.current.story,
          photos:
            file.kind === "photo" &&
            !latest.current.story.photos.some((p) => p.id === file.id)
              ? [
                  ...latest.current.story.photos,
                  { id: file.id, alt: "", caption: "" },
                ]
              : latest.current.story.photos,
          selected_media:
            file.kind === "photo"
              ? Array.from(
                  new Set([...latest.current.story.selected_media, file.id]),
                )
              : latest.current.story.selected_media,
        },
      };
      latest.current = next;
      setPending(next.pending);
      setStory(next.story);
      await persist(next);
      await save("save", next.story);
    }
    await refresh();
  }
  async function record() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMessage(t.unsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mime = recordingMime();
      if (!mime) {
        stream.getTracks().forEach((t) => t.stop());
        setMessage(t.unsupported);
        return;
      }
      const r = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      recorder.current = r;
      chunks.current = [];
      recordingId.current = crypto.randomUUID();
      stopReason.current = "";
      r.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.current.push(e.data);
        const file: Pending = {
          id: recordingId.current,
          kind: "audio",
          mime: r.mimeType,
          blob: new Blob(chunks.current, { type: r.mimeType }),
        };
        const next = {
          ...latest.current,
          pending: [
            ...latest.current.pending.filter((p) => p.id !== file.id),
            file,
          ],
        };
        latest.current = next;
        setPending(next.pending);
        void persist(next);
        if (file.blob.size >= 18 * 1024 * 1024 && r.state === "recording") {
          stopReason.current = t.recordingLimit;
          r.stop();
        }
      };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setMessage(stopReason.current || t.recordingSaved);
        await localWrite.current;
        await run(t.preparing, generate);
        if (stopReason.current) setMessage(stopReason.current);
      };
      r.onerror = () => {
        stopReason.current = t.recovery;
        if (r.state === "recording") r.stop();
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setMessage(t.recovery);
      };
      r.start(1000);
      setSeconds(0);
      setRecording(true);
    } catch {
      setMessage(t.unsupported);
    }
  }
  async function generate() {
    await uploadPending();
    await save();
    const current = await refresh();
    const audio = current.media.find(
      (m: Media) =>
        m.kind === "audio" &&
        m.capture_mode !== "live" &&
        !(current.source?.transcribed_audio_ids || []).includes(m.id),
    );
    const result = await api(`/api/experiences/${id}/prepare`, "POST", {
      locale,
      ...(audio ? { audio_id: audio.id } : {}),
    }).catch((error) => {
      // Recovery keeps an editable preview and Save available after provider failure.
      setReviewing(true);
      throw error;
    });
    setTranscript(result.transcript);
    const filled = autofill(latest.current.story, result.story, suggestion);
    latest.current = { ...latest.current, story: filled };
    setStory(filled);
    setSuggestion(result.story);
    setPhotoHints(result.photoHints);
    await save("save", filled);
    setReviewing(true);
    setMessage(t.readyToReview);
    requestAnimationFrame(() =>
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  const inputClass =
    "w-full rounded-xl border bg-background px-4 py-3 text-base";
  return (
    <div
      className="mx-auto max-w-2xl px-4 pb-28 pt-8 space-y-8"
      inert={!ready}
      aria-busy={!ready}
    >
      <header className="space-y-3">
        <Link href="/experiences" className="text-sm text-muted-foreground">
          ← {t.experiences}
        </Link>
        <p className="text-xs tracking-widest uppercase text-muted-foreground">
          Đà Lạt · {t.personalJournal}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{t.create}</h1>
        <p className="text-muted-foreground">{t.promise}</p>
        <p className="text-sm text-muted-foreground">{t.experienceHint}</p>
        {!published && !reviewing && (
          <Button
            variant="outline"
            className="min-h-12 w-full"
            disabled={recording || liveActive}
            onClick={() =>
              run(t.saving, async () => {
                await persist(latest.current);
                await uploadPending();
                await save();
                router.push("/experiences");
              })
            }
          >
            {t.saveClose}
          </Button>
        )}
        <p className="rounded-xl bg-muted/50 p-3 text-sm">
          {published ? t.publicNotice : t.privateNotice}
        </p>
        {!aiAvailable && !published && (
          <p className="rounded-xl border p-3 text-sm">{t.aiUnavailable}</p>
        )}
      </header>
      {published ? (
        <div className="space-y-4">
          <Link href={`/experiences/${id}`} className="underline">
            {t.openPage}
          </Link>
          <Button
            onClick={() =>
              run(t.saving, async () => {
                await save("unpublish");
                setPublished(false);
              })
            }
          >
            {t.unpublish}
          </Button>
        </div>
      ) : (
        <>
          <fieldset
            hidden={reviewing}
            disabled={!!busy || recording || liveActive}
            className="space-y-4 disabled:opacity-70"
          >
            <legend className="text-lg font-medium mb-3">1 · {t.photos}</legend>
            <label className="flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-muted/20 p-5">
              <Camera aria-hidden />
              <span>{t.choosePhotos}</span>
              <input
                aria-label={t.choosePhotos}
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (
                    files.some((f) => f.size > 20 * 1024 * 1024) ||
                    files.length +
                      media.filter((m) => m.kind === "photo").length +
                      pending.filter((m) => m.kind === "photo").length >
                      12
                  ) {
                    setMessage(t.fileLimit);
                    return;
                  }
                  const added = files.map((blob) => ({
                    id: crypto.randomUUID(),
                    blob,
                    kind: "photo" as const,
                    mime: blob.type || "image/heic",
                  }));
                  const next = {
                    ...latest.current,
                    pending: [...latest.current.pending, ...added],
                  };
                  latest.current = next;
                  setPending(next.pending);
                  await persist(next);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">{t.fileHint}</p>
            <div className="grid grid-cols-3 gap-2">
              {media
                .filter((m) => m.kind === "photo")
                .map((m) => (
                  <div key={m.id} className="relative">
                    <img
                      className={`aspect-square w-full rounded-xl object-cover ${story.selected_media.includes(m.id) ? "" : "opacity-30"}`}
                      src={`/api/experiences/${id}/media/${m.id}`}
                      alt={
                        story.photos.find((p) => p.id === m.id)?.alt ||
                        t.originalPhoto
                      }
                    />
                    <button
                      aria-label={t.removePhoto}
                      className="absolute bottom-1 right-1 min-h-11 min-w-11 rounded-full bg-background/90"
                      onClick={() =>
                        field(
                          "selected_media",
                          story.selected_media.includes(m.id)
                            ? story.selected_media.filter((i) => i !== m.id)
                            : [...story.selected_media, m.id],
                        )
                      }
                    >
                      {story.selected_media.includes(m.id) ? (
                        <Check className="mx-auto" />
                      ) : (
                        "+"
                      )}
                    </button>
                  </div>
                ))}
            </div>
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border p-3 text-sm"
              >
                {p.kind === "photo" && (
                  <PendingPhoto blob={p.blob} alt={t.originalPhoto} />
                )}
                <span>
                  {p.kind === "photo" ? t.photoWaiting : t.recordingWaiting} ·{" "}
                  {(p.blob.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  aria-label={t.removePhoto}
                  className="p-3"
                  onClick={() =>
                    setPending((s) => s.filter((f) => f.id !== p.id))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {pending.length > 0 && (
              <Button
                variant="outline"
                onClick={() => run(t.uploading, uploadPending)}
              >
                {t.upload}
              </Button>
            )}
          </fieldset>
          <section hidden={reviewing} className="space-y-4">
            <h2 className="text-lg font-medium">2 · {t.tellStory}</h2>
            <p className="text-sm text-muted-foreground">{t.voiceHint}</p>
            <details>
              <summary className="min-h-11 py-3 cursor-pointer">
                {t.recordInstead}
              </summary>
              <Button
                size="lg"
                disabled={!!busy || liveActive}
                variant={recording ? "destructive" : "outline"}
                className="w-full min-h-14 rounded-2xl"
                onClick={() =>
                  recording ? recorder.current?.stop() : record()
                }
              >
                {recording ? (
                  <>
                    <Square className="mr-2" />
                    {t.stop} · {seconds}s
                  </>
                ) : (
                  <>
                    <Mic className="mr-2" />
                    {t.record}
                  </>
                )}
              </Button>
            </details>
            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
            {liveAvailable && (
              <LiveInterview
                id={id}
                userId={userId}
                labels={t}
                initial={initial.conversation}
                disabled={!!busy || recording || published}
                onActive={setLiveActive}
                onAudio={async (blob, mime) => {
                  const file: Pending = {
                    id: crypto.randomUUID(),
                    blob,
                    mime,
                    kind: "audio",
                    capture_mode: "live",
                  };
                  const next = {
                    ...latest.current,
                    pending: [...latest.current.pending, file],
                  };
                  latest.current = next;
                  setPending(next.pending);
                  await persist(next);
                  await uploadPending();
                }}
                onFinish={() => run(t.preparing, generate)}
              />
            )}
            <details>
              <summary className="min-h-11 py-3 cursor-pointer">
                {t.notesAndRecordings}
              </summary>
              {media
                .filter((m) => m.kind === "audio")
                .map((m) => (
                  <div key={m.id} className="space-y-2">
                    <audio
                      controls
                      preload="none"
                      className="w-full"
                      onError={() =>
                        setAudioErrors((current) =>
                          current.includes(m.id) ? current : [...current, m.id],
                        )
                      }
                      src={`/api/experiences/${id}/media/${m.id}`}
                    />
                    {audioErrors.includes(m.id) && (
                      <p className="text-sm" role="status">
                        {t.audioRecovery}
                      </p>
                    )}
                    <a
                      className="inline-flex min-h-11 items-center text-sm underline"
                      href={`/api/experiences/${id}/media/${m.id}?original=1`}
                      download
                    >
                      {t.downloadAudio}
                    </a>
                  </div>
                ))}
              <label className="block space-y-2">
                <span>{t.notes}</span>
                <textarea
                  disabled={!!busy || recording || liveActive}
                  className={inputClass}
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={18000}
                />
              </label>
            </details>
            <p className="text-xs text-muted-foreground">{t.aiNotice}</p>
            <Button
              disabled={!!busy || recording || liveActive}
              className="w-full min-h-12"
              onClick={() => run(t.preparing, generate)}
            >
              {t.finishAction}
              <ArrowRight className="ml-2" size={18} />
            </Button>
            {transcript && (
              <details>
                <summary className="py-3 cursor-pointer">
                  {t.privateTranscript}
                </summary>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {transcript}
                </p>
              </details>
            )}
          </section>
          <section
            ref={reviewRef}
            hidden={!reviewing}
            className="scroll-mt-32 space-y-5"
          >
            <h2 className="text-2xl font-semibold">{t.readyToReview}</h2>
            <p className="text-sm text-muted-foreground">{t.reviewHint}</p>
            <div className="rounded-2xl border p-5 space-y-3">
              <h3 className="text-xl font-semibold">
                {story.title || t.draft}
              </h3>
              <p className="whitespace-pre-wrap">
                <AttributedText
                  text={story.narrative}
                  username={initial.username}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                {t[story.category]} · {story.visit_date}
              </p>
              {story.tags.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {story.tags.map((tag) => `#${tag}`).join(" ")}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                {media
                  .filter(
                    (m) =>
                      m.kind === "photo" && story.selected_media.includes(m.id),
                  )
                  .map((m) => (
                    <img
                      key={m.id}
                      className="aspect-square rounded-lg object-cover"
                      src={`/api/experiences/${id}/media/${m.id}`}
                      alt={
                        story.photos.find((p) => p.id === m.id)?.alt ||
                        t.originalPhoto
                      }
                    />
                  ))}
              </div>
            </div>
            {photoHints?.date && photoHints.date !== story.visit_date && (
              <Button
                variant="outline"
                onClick={() => field("visit_date", photoHints.date!)}
              >
                {t.usePhotoDate} · {photoHints.date}
              </Button>
            )}
            {!!photoHints?.venues.length && !story.venue_confirmed && (
              <div className="rounded-xl border p-4 space-y-2">
                <p>
                  {photoHints.basis === "name" ? t.namePlaces : t.photoPlaces}
                </p>
                {photoHints.venues.map((v) => (
                  <Button
                    variant="outline"
                    className="w-full min-h-12 h-auto whitespace-normal text-left"
                    key={v.id}
                    onClick={() =>
                      setStory((current) => ({
                        ...current,
                        venue_id: v.id,
                        venue_name: v.name,
                        venue_address: v.address || "",
                        venue_confirmed: true,
                      }))
                    }
                  >
                    {v.name} · {v.address}
                  </Button>
                ))}
              </div>
            )}
            {story.venue_name && (
              <div className="rounded-xl border p-4 space-y-3">
                <p>{story.venue_name}</p>
                {story.venue_address && (
                  <p className="text-sm text-muted-foreground">
                    {story.venue_address}
                  </p>
                )}
                <Button
                  variant="ghost"
                  onClick={() =>
                    setStory((current) => ({
                      ...current,
                      venue_id: null,
                      venue_name: "",
                      venue_address: "",
                      venue_confirmed: false,
                    }))
                  }
                >
                  {t.leavePlaceOff}
                </Button>
              </div>
            )}
            {!story.venue_name && (
              <p className="text-sm text-muted-foreground">{t.placeOptional}</p>
            )}
            <Button variant="outline" onClick={() => setReviewing(false)}>
              {t.addMore}
            </Button>
          </section>
          <details hidden={!reviewing} className="rounded-xl border p-4">
            <summary className="cursor-pointer min-h-11 font-medium">
              {t.editDetails}
            </summary>
            <fieldset disabled={recording || liveActive} className="space-y-5">
              <legend className="text-lg font-medium mb-3">
                3 · {t.review}
              </legend>
              <label className="block space-y-2">
                <span>{t.title}</span>
                <input
                  className={inputClass}
                  value={story.title}
                  maxLength={160}
                  onChange={(e) => field("title", e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span>{t.story}</span>
                <textarea
                  className={inputClass}
                  rows={8}
                  aria-label={t.story}
                  value={story.narrative}
                  maxLength={12000}
                  onChange={(e) => field("narrative", e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span>{t.summary}</span>
                <textarea
                  className={inputClass}
                  rows={2}
                  aria-label={t.summary}
                  value={story.summary}
                  maxLength={500}
                  onChange={(e) => field("summary", e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span>{t.visitDate}</span>
                  <input
                    className={inputClass}
                    type="date"
                    value={story.visit_date}
                    onChange={(e) => field("visit_date", e.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span>{t.category}</span>
                  <select
                    aria-label={t.category}
                    className={inputClass}
                    value={story.category}
                    onChange={(e) =>
                      field("category", e.target.value as Story["category"])
                    }
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {t[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-2">
                <span>{t.venue}</span>
                <input
                  className={inputClass}
                  value={story.venue_name}
                  maxLength={200}
                  onChange={(e) => {
                    setStory((s) => ({
                      ...s,
                      venue_name: e.target.value,
                      venue_id: null,
                      venue_confirmed: false,
                    }));
                    setVenues([]);
                  }}
                />
              </label>
              <Button
                variant="outline"
                onClick={() =>
                  run(t.searching, async () => {
                    const r = await api(
                      `/api/experiences/venues?q=${encodeURIComponent(story.venue_name)}`,
                    );
                    setVenues(r.venues);
                    if (!r.venues.length) setMessage(t.pendingVenue);
                  })
                }
              >
                {t.findVenue}
              </Button>
              {venues.map((v) => (
                <button
                  className="block w-full rounded-xl border p-4 text-left"
                  key={v.id}
                  onClick={() => {
                    setStory((s) => ({
                      ...s,
                      venue_id: v.id,
                      venue_name: v.name,
                      venue_address: v.address || "",
                      venue_confirmed: false,
                    }));
                    setVenues([]);
                  }}
                >
                  <strong>{v.name}</strong>
                  <span className="block text-sm text-muted-foreground">
                    {v.address}
                  </span>
                </button>
              ))}
              <label className="block space-y-2">
                <span>{t.address}</span>
                <input
                  className={inputClass}
                  disabled={!!story.venue_id}
                  maxLength={400}
                  value={story.venue_address}
                  onChange={(e) =>
                    setStory((s) => ({
                      ...s,
                      venue_address: e.target.value,
                      venue_confirmed: false,
                    }))
                  }
                />
              </label>
              {!story.venue_id && (
                <p className="text-xs text-muted-foreground">
                  {t.pendingVenue}
                </p>
              )}
              {story.photos
                .filter((p) => story.selected_media.includes(p.id))
                .map((p) => (
                  <div key={p.id} className="space-y-3">
                    <label className="block space-y-2">
                      <span>{t.photoDescription}</span>
                      <input
                        className={inputClass}
                        value={p.alt}
                        maxLength={300}
                        onChange={(e) =>
                          field(
                            "photos",
                            story.photos.map((x) =>
                              x.id === p.id ? { ...x, alt: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="block space-y-2">
                      <span>{t.photoCaption}</span>
                      <input
                        className={inputClass}
                        value={p.caption}
                        maxLength={400}
                        onChange={(e) =>
                          field(
                            "photos",
                            story.photos.map((x) =>
                              x.id === p.id
                                ? { ...x, caption: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
              {story.observations.length > 0 && (
                <details>
                  <summary className="py-3">{t.observations}</summary>
                  {story.observations.map((o, i) => (
                    <div className="border-b py-3" key={i}>
                      <p>
                        {o.value} {o.context}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t[o.source_type]} · {o.evidence}
                      </p>
                      <button
                        className="min-h-11 underline"
                        onClick={() =>
                          field(
                            "observations",
                            story.observations.filter((_, n) => n !== i),
                          )
                        }
                      >
                        {t.remove}
                      </button>
                    </div>
                  ))}
                </details>
              )}
              <label className="block space-y-2">
                <span>{t.sponsorship}</span>
                <input
                  className={inputClass}
                  maxLength={300}
                  value={story.sponsorship}
                  onChange={(e) => field("sponsorship", e.target.value)}
                />
              </label>
            </fieldset>
          </details>
          <section hidden={!reviewing} className="space-y-4">
            {story.selected_media.length > 0 &&
              needsPeopleReminder(
                [
                  story.title,
                  story.narrative,
                  ...story.tags,
                  ...story.photos.map((p) => p.alt + " " + p.caption),
                ].join(" "),
              ) && (
                <aside className="rounded-xl border p-4 text-sm space-y-2">
                  <p className="font-medium">{t.peopleReminderTitle}</p>
                  <p>{t.peopleReminder}</p>
                  <Button variant="outline" onClick={() => setReviewing(false)}>
                    {t.reviewPhotos}
                  </Button>
                </aside>
              )}
            <p className="text-sm text-muted-foreground">{t.publishConsent}</p>
            <p className="text-sm text-muted-foreground">{t.publishNotice}</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 min-h-12"
                onClick={() =>
                  run(t.saving, async () => {
                    await uploadPending();
                    await save();
                    router.push("/experiences");
                  })
                }
              >
                {t.saveClose}
              </Button>
              <Button
                className="flex-1 min-h-12"
                disabled={!!busy || recording || liveActive}
                onClick={() =>
                  run(t.publishing, async () => {
                    const reviewed = confirmPublication(latest.current.story);
                    if (
                      !publicationReady(
                        reviewed,
                        new Date().toLocaleDateString("en-CA", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        }),
                      )
                    ) {
                      setMessage(t.checkReview);
                      return;
                    }
                    await save("publish", reviewed);
                    await Promise.all([
                      clearLocalDraft(key),
                      clearLocalDraft(`${key}/live`),
                    ]).catch(() => {});
                    router.push(`/experiences/${id}`);
                    router.refresh();
                  })
                }
              >
                {t.publish}
              </Button>
            </div>
          </section>
        </>
      )}
      <div role="status" aria-live="polite" className="text-sm">
        {busy ? (
          <span className="flex gap-2 items-center">
            <Loader2 className="animate-spin" size={18} />
            {busy}
          </span>
        ) : (
          message
        )}
      </div>
      <details className="text-sm text-muted-foreground">
        <summary className="py-3">{t.delete}</summary>
        <Button
          variant="destructive"
          disabled={!!busy || recording || liveActive}
          onClick={() =>
            run(t.saving, async () => {
              await api(`/api/experiences/${id}`, "DELETE");
              await Promise.all([
                clearLocalDraft(key),
                clearLocalDraft(`${key}/live`),
              ]).catch(() => {});
              router.push("/experiences");
            })
          }
        >
          {t.deleteConfirm}
        </Button>
      </details>
    </div>
  );
}
