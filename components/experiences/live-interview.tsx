"use client";
import {
  interviewInstructions,
  interviewStyles,
  monologueCommand,
  type InterviewStyle,
} from "@/lib/experiences/interview";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localDraft } from "@/lib/experiences/local-draft";
import { archiveLiveAudio } from "@/lib/experiences/recording";
import {
  liveConversationSchema,
  type LiveTurn,
} from "@/lib/experiences/live-schema";
import type en from "@/messages/en.json";
type Labels = typeof en.experiences;
export function LiveInterview({
  id,
  userId,
  labels: t,
  initial,
  disabled,
  onActive,
  onAudio,
  onFinish,
}: {
  id: string;
  userId: string;
  labels: Labels;
  initial: LiveTurn[];
  disabled: boolean;
  onActive: (active: boolean) => void;
  onAudio: (blob: Blob, mime: string) => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const key = `${userId}/${id}/live`;
  const [style, setStyle] = useState<InterviewStyle>("quick");
  const [turns, setTurns] = useState(initial);
  const [phase, setPhase] = useState<
    "idle" | "connecting" | "live" | "finishing"
  >("idle");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const all = useRef(initial);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const archive = useRef<(() => Promise<void>) | null>(null);
  const pendingTranscripts = useRef(new Set<string>());
  const stopping = useRef(false);
  const callbacks = useRef({ onActive, onAudio, onFinish });
  callbacks.current = { onActive, onAudio, onFinish };
  const writing = useRef(Promise.resolve());
  async function sync() {
    const response = await fetch(`/api/experiences/${id}/live`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all.current),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("save_failed");
  }
  function keep(turn: LiveTurn) {
    if (all.current.some((t) => t.id === turn.id)) return;
    all.current = [...all.current, turn];
    setTurns(all.current);
    const snapshot = all.current;
    writing.current = writing.current
      .catch(() => {})
      .then(async () => {
        await localDraft(key, snapshot).catch(() =>
          setMessage(t.storageWarning),
        );
        await sync();
      })
      .catch(() => {
        setMessage(t.liveRecovery);
      });
  }
  async function closeConnection() {
    channel.current?.close();
    channel.current = null;
    peer.current?.close();
    peer.current = null;
    const finishArchive = archive.current;
    archive.current = null;
    try {
      await finishArchive?.();
    } finally {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      if (audio.current) audio.current.srcObject = null;
      callbacks.current.onActive(false);
    }
  }
  async function finish(prepare: boolean) {
    if (stopping.current) return;
    stopping.current = true;
    setPhase("finishing");
    try {
      if (channel.current?.readyState === "open") {
        channel.current.send(
          JSON.stringify({ type: "input_audio_buffer.commit" }),
        );
        channel.current.send(JSON.stringify({ type: "response.cancel" }));
        stream.current?.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        const started = Date.now();
        while (
          Date.now() - started < 10000 &&
          (Date.now() - started < 1500 || pendingTranscripts.current.size)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      await closeConnection().catch(() => setMessage(t.liveRecovery));
      await writing.current;
      await localDraft(key, all.current).catch(() =>
        setMessage(t.storageWarning),
      );
      await sync();
      if (prepare) await callbacks.current.onFinish();
      setMessage(prepare ? t.saved : t.liveRecovery);
    } catch {
      setMessage(t.liveRecovery);
    } finally {
      await closeConnection().catch(() => setMessage(t.liveRecovery));
      setPhase("idle");
      stopping.current = false;
    }
  }
  useEffect(() => {
    let active = true;
    localDraft<LiveTurn[]>(key)
      .then((saved) => {
        if (!active) return;
        const parsed = liveConversationSchema.safeParse(saved);
        if (parsed.success) {
          const combined = [...initial];
          for (const turn of parsed.data)
            if (!combined.some((t) => t.id === turn.id)) combined.push(turn);
          all.current = combined;
          setTurns(combined);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
      stopping.current = true;
      void closeConnection().catch(() => {});
    };
    // This connection belongs to one private draft, not to changing callback props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setMessage(t.unsupported);
      return;
    }
    pendingTranscripts.current.clear();
    setPhase("connecting");
    setMessage("");
    stopping.current = false;
    callbacks.current.onActive(true);
    try {
      await sync();
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = mic;
      // Start archiving before negotiating: a connection failure cannot discard captured audio.
      archive.current = archiveLiveAudio(mic, (blob, mime) =>
        callbacks.current.onAudio(blob, mime),
      );
      const pc = new RTCPeerConnection();
      peer.current = pc;
      pc.ontrack = (event) => {
        if (audio.current) {
          audio.current.srcObject = event.streams[0];
          void audio.current.play().catch(() => setMessage(t.livePlay));
        }
      };
      pc.onconnectionstatechange = () => {
        if (
          ["failed", "closed"].includes(pc.connectionState) &&
          !stopping.current
        )
          void finish(false);
      };
      mic.getAudioTracks()[0].onended = () => {
        if (!stopping.current) void finish(false);
      };
      pc.addTrack(mic.getAudioTracks()[0], mic);
      const dc = pc.createDataChannel("oai-events");
      channel.current = dc;
      let spokenResponses = 0;
      let currentStyle: InterviewStyle = "quick";
      setStyle("quick");
      function changeStyle(next: InterviewStyle) {
        currentStyle = next;
        spokenResponses = 0;
        setStyle(next);
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              instructions: interviewInstructions(next),
              audio: {
                input: {
                  turn_detection: {
                    type: "semantic_vad",
                    eagerness: "low",
                    create_response: next !== "monologue",
                    interrupt_response: true,
                  },
                },
              },
            },
          }),
        );
      }
      dc.onmessage = ({ data }) => {
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          return;
        }
        if (
          event.type === "response.function_call_arguments.done" &&
          event.name === "finish_experience"
        ) {
          void finish(true);
          return;
        }
        if (
          event.type === "response.function_call_arguments.done" &&
          event.name === "set_interview_style"
        ) {
          try {
            const next = JSON.parse(event.arguments)?.style;
            if (!interviewStyles.includes(next) || !event.call_id) return;
            changeStyle(next);
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: event.call_id,
                  output: JSON.stringify({ style: next }),
                },
              }),
            );
            if (next !== "monologue")
              dc.send(JSON.stringify({ type: "response.create" }));
          } catch {
            /* Invalid tool output cannot change the interview. */
          }
          return;
        }
        if (event.type === "input_audio_buffer.committed")
          pendingTranscripts.current.add(event.item_id);
        if (
          event.type === "conversation.item.input_audio_transcription.completed"
        ) {
          pendingTranscripts.current.delete(event.item_id);
          if (event.transcript?.trim())
            keep({
              id: event.item_id,
              role: "user",
              text: event.transcript,
              at: new Date().toISOString(),
            });
          if (currentStyle === "monologue") {
            const command = monologueCommand(event.transcript || "");
            if (command === "finish") {
              void finish(true);
              return;
            }
            if (command === "story") {
              changeStyle("story");
              dc.send(JSON.stringify({ type: "response.create" }));
            }
          }
        }
        if (
          event.type === "conversation.item.input_audio_transcription.failed"
        ) {
          pendingTranscripts.current.delete(event.item_id);
          setMessage(t.liveRecovery);
        }
        if (
          event.type === "response.output_audio_transcript.done" &&
          event.transcript?.trim()
        ) {
          spokenResponses += 1;
          const cap =
            currentStyle === "quick"
              ? 2
              : currentStyle === "natural"
                ? 4
                : Infinity;
          if (spokenResponses === cap && dc.readyState === "open")
            dc.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  type: "realtime",
                  instructions: interviewInstructions(
                    currentStyle,
                    spokenResponses,
                  ),
                },
              }),
            );
          keep({
            id: event.item_id,
            role: "assistant",
            text: event.transcript,
            at: new Date().toISOString(),
          });
        }
        if (
          event.type === "error" &&
          ![
            "input_audio_buffer_commit_empty",
            "response_cancel_not_active",
          ].includes(event.error?.code)
        )
          setMessage(t.liveRecovery);
      };
      const opened = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("connect_timeout")),
          45000,
        );
        dc.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      // Handle a timeout even when the HTTP negotiation fails first.
      void opened.catch(() => {});
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const result = await fetch(`/api/experiences/${id}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
        signal: AbortSignal.timeout(45000),
      });
      if (!result.ok) throw Error("unavailable");
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await result.text(),
      });
      await opened;
      dc.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              "Say only: What would you like to remember? Use the contributor's language, then listen.",
          },
        }),
      );
      setPhase("live");
    } catch {
      stopping.current = true;
      await closeConnection().catch(() => setMessage(t.liveRecovery));
      setMessage(t.liveRecovery);
      setPhase("idle");
      stopping.current = false;
    }
  }
  return (
    <section className="rounded-2xl border bg-muted/30 p-4 space-y-3">
      <p className="text-sm text-muted-foreground">{t.liveHint}</p>
      {phase === "live" && (
        <p className="text-xs text-muted-foreground">
          {
            t[
              (
                {
                  quick: "modeQuick",
                  natural: "modeNatural",
                  story: "modeStory",
                  monologue: "modeMonologue",
                } as const
              )[style]
            ]
          }
        </p>
      )}
      <Button
        className="w-full min-h-12"
        variant={phase === "live" ? "destructive" : "outline"}
        disabled={
          !loaded ||
          (phase === "idle" && disabled) ||
          phase === "connecting" ||
          phase === "finishing"
        }
        onClick={() => (phase === "live" ? void finish(true) : void start())}
      >
        {phase === "live" ? (
          <Square className="mr-2 h-4 w-4" />
        ) : (
          <Mic className="mr-2 h-4 w-4" />
        )}
        {phase === "connecting"
          ? t.liveConnecting
          : phase === "finishing"
            ? t.saving
            : phase === "live"
              ? t.liveFinish
              : t.liveStart}
      </Button>
      <audio ref={audio} autoPlay className="hidden" />
      {message === t.livePlay && (
        <Button variant="outline" onClick={() => void audio.current?.play()}>
          {t.livePlay}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {turns.length > 0 && (
        <details>
          <summary className="min-h-11 py-3 text-sm cursor-pointer">
            {t.liveTranscript}
          </summary>
          <div className="max-h-64 overflow-y-auto space-y-3 text-sm">
            {turns.map((turn) => (
              <p key={turn.id}>
                <strong>
                  {turn.role === "user" ? t.liveYou : t.liveAssistant}:{" "}
                </strong>
                {turn.text}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
