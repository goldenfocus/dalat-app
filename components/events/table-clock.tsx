"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

interface Level {
  sb: number;
  bb: number;
  ante: number;
  minutes: number;
}

interface TableClockProps {
  eventSlug: string;
  eventTitle: string;
}

const BLIND_LADDER: Array<[number, number, number]> = [
  [25, 50, 0],
  [50, 100, 0],
  [75, 150, 0],
  [100, 200, 0],
  [150, 300, 25],
  [200, 400, 50],
  [300, 600, 75],
  [400, 800, 100],
  [600, 1200, 150],
  [800, 1600, 200],
  [1000, 2000, 300],
  [1500, 3000, 400],
  [2000, 4000, 500],
  [3000, 6000, 1000],
  [5000, 10000, 1000],
];

function makeLevels(minutes: number): Level[] {
  return BLIND_LADDER.map(([sb, bb, ante]) => ({ sb, bb, ante, minutes }));
}

type Phase = "idle" | "running" | "paused";

interface PersistedState {
  levels: Level[];
  levelIdx: number;
  phase: Phase;
  endsAt: number | null;
  remainingMs: number | null;
  muted: boolean;
}

export function TableClock({ eventSlug, eventTitle }: TableClockProps) {
  const t = useTranslations("pokerTable");
  const locale = useLocale();

  const [levels, setLevels] = useState<Level[]>(() => makeLevels(10));
  const [levelIdx, setLevelIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [displayMs, setDisplayMs] = useState(10 * 60_000);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const warnedRef = useRef(false);
  const storageKey = `poker-table:${eventSlug}`;

  // --- persistence ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as PersistedState;
        if (Array.isArray(s.levels) && s.levels.length > 0) {
          setLevels(s.levels);
          setLevelIdx(Math.min(s.levelIdx, s.levels.length - 1));
          setMuted(!!s.muted);
          if (s.phase === "running" && s.endsAt && s.endsAt > Date.now()) {
            setPhase("running");
            setEndsAt(s.endsAt);
          } else if (s.phase === "paused" && s.remainingMs) {
            setPhase("paused");
            setRemainingMs(s.remainingMs);
          }
        }
      }
    } catch {
      // corrupted state — start fresh
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const s: PersistedState = { levels, levelIdx, phase, endsAt, remainingMs, muted };
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      // storage full/unavailable — clock still works in memory
    }
  }, [levels, levelIdx, phase, endsAt, remainingMs, muted, hydrated, storageKey]);

  // --- audio ---
  const chime = useCallback(
    (soft = false) => {
      if (muted) return;
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      const tones = soft ? [660] : [880, 1320];
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.18;
        gain.gain.setValueAtTime(soft ? 0.15 : 0.4, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + (soft ? 0.5 : 1.4));
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + (soft ? 0.6 : 1.5));
      });
    },
    [muted]
  );

  const speak = useCallback(
    (text: string) => {
      if (muted || typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale;
      const voice = speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith(locale.toLowerCase()));
      if (voice) u.voice = voice;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    },
    [muted, locale]
  );

  const announceLevel = useCallback(
    (lvl: Level) => {
      chime();
      const line = lvl.ante > 0
        ? t("voiceBlindsUpAnte", { sb: lvl.sb, bb: lvl.bb, ante: lvl.ante })
        : t("voiceBlindsUp", { sb: lvl.sb, bb: lvl.bb });
      setTimeout(() => speak(line), 700);
    },
    [chime, speak, t]
  );

  // --- wake lock ---
  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // wake lock denied (low battery etc.) — clock still runs
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && phase === "running") {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, acquireWakeLock]);

  // --- level transitions ---
  const startLevel = useCallback(
    (idx: number, announce: boolean) => {
      const clamped = Math.min(Math.max(idx, 0), levels.length - 1);
      setLevelIdx(clamped);
      setEndsAt(Date.now() + levels[clamped].minutes * 60_000);
      setRemainingMs(null);
      setPhase("running");
      warnedRef.current = false;
      if (announce) announceLevel(levels[clamped]);
    },
    [levels, announceLevel]
  );

  // --- tick ---
  useEffect(() => {
    if (phase !== "running" || endsAt === null) return;
    const tick = () => {
      const remaining = endsAt - Date.now();
      setDisplayMs(Math.max(0, remaining));
      if (remaining <= 60_000 && remaining > 0 && !warnedRef.current) {
        warnedRef.current = true;
        chime(true);
        setTimeout(() => speak(t("voiceOneMinute")), 400);
      }
      if (remaining <= 0) {
        startLevel(Math.min(levelIdx + 1, levels.length - 1), true);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase, endsAt, levelIdx, levels.length, chime, speak, startLevel, t]);

  useEffect(() => {
    if (phase === "paused" && remainingMs !== null) setDisplayMs(remainingMs);
    if (phase === "idle") setDisplayMs(levels[levelIdx].minutes * 60_000);
  }, [phase, remainingMs, levels, levelIdx]);

  // --- controls ---
  const handleStart = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    audioCtxRef.current.resume();
    if (typeof speechSynthesis !== "undefined") {
      // unlock speech on iOS with a silent utterance
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    acquireWakeLock();
    chime();
    setTimeout(() => speak(t("shuffleUp")), 700);
    setLevelIdx(0);
    setEndsAt(Date.now() + levels[0].minutes * 60_000);
    setPhase("running");
    warnedRef.current = false;
  };

  const handlePause = () => {
    if (phase === "running" && endsAt !== null) {
      setRemainingMs(Math.max(0, endsAt - Date.now()));
      setEndsAt(null);
      setPhase("paused");
    } else if (phase === "paused" && remainingMs !== null) {
      setEndsAt(Date.now() + remainingMs);
      setRemainingMs(null);
      setPhase("running");
      acquireWakeLock();
    }
  };

  const handleAddMinute = () => {
    if (phase === "running" && endsAt !== null) setEndsAt(endsAt + 60_000);
    else if (phase === "paused" && remainingMs !== null) setRemainingMs(remainingMs + 60_000);
  };

  const handleReset = () => {
    wakeLockRef.current?.release().catch(() => {});
    setPhase("idle");
    setLevelIdx(0);
    setEndsAt(null);
    setRemainingMs(null);
    warnedRef.current = false;
    setEditing(false);
  };

  const updateLevel = (i: number, patch: Partial<Level>) => {
    setLevels((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeLevel = (i: number) => {
    setLevels((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
    setLevelIdx((prev) => Math.min(prev, levels.length - 2 < 0 ? 0 : levels.length - 2));
  };

  const addLevel = () => {
    setLevels((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante * 2, minutes: last.minutes }];
    });
  };

  const applyPreset = (minutes: number) => {
    setLevels(makeLevels(minutes));
    setLevelIdx(0);
    if (phase !== "idle") {
      setPhase("idle");
      setEndsAt(null);
      setRemainingMs(null);
    }
  };

  const fmt = (n: number) => n.toLocaleString(locale);
  const mins = Math.floor(displayMs / 60_000);
  const secs = Math.floor((displayMs % 60_000) / 1000);
  const current = levels[levelIdx];
  const nextLvl = levelIdx < levels.length - 1 ? levels[levelIdx + 1] : null;
  const levelTotal = current.minutes * 60_000;
  const progress = levelTotal > 0 ? 1 - displayMs / levelTotal : 0;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 text-white flex flex-col select-none">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <span className="text-sm text-zinc-400 truncate">{eventTitle}</span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-semibold text-amber-400 mr-2">dalat.app</span>
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? t("soundOff") : t("soundOn")}
            className="p-2 rounded-lg text-zinc-400 hover:text-white active:scale-95 transition-all"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setEditing(true)}
            aria-label={t("editLevels")}
            className="p-2 rounded-lg text-zinc-400 hover:text-white active:scale-95 transition-all"
          >
            <Pencil className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* main display */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-0">
        <button
          onClick={() => setEditing(true)}
          className="text-lg sm:text-xl uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300 mb-2 px-3 py-2 rounded-lg active:scale-95 transition-all"
        >
          {t("levelOf", { n: levelIdx + 1, total: levels.length })}
        </button>
        <div className="font-bold tabular-nums leading-none text-[26vw] sm:text-[18vw] md:text-[14vw]">
          {mins}:{secs.toString().padStart(2, "0")}
        </div>
        <div className="w-full max-w-xl h-1.5 bg-zinc-800 rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
        <div className="font-bold tabular-nums text-[11vw] sm:text-[8vw] md:text-[6vw] mt-6 text-amber-400">
          {fmt(current.sb)} / {fmt(current.bb)}
        </div>
        {current.ante > 0 && (
          <div className="text-xl sm:text-2xl text-zinc-400 mt-1">
            {t("ante")} {fmt(current.ante)}
          </div>
        )}
        {nextLvl && (
          <div className="text-sm sm:text-base text-zinc-500 mt-6">
            {t("next")}: {fmt(nextLvl.sb)} / {fmt(nextLvl.bb)}
            {nextLvl.ante > 0 && ` · ${t("ante")} ${fmt(nextLvl.ante)}`}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="pb-8 pt-2 px-4">
        {phase === "idle" ? (
          <button
            onClick={handleStart}
            className="mx-auto block bg-amber-400 text-zinc-950 font-bold text-xl px-10 py-4 rounded-full active:scale-95 transition-all"
          >
            {t("tapToStart")}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => startLevel(levelIdx - 1, false)}
              aria-label={t("prevLevel")}
              className="p-4 rounded-full bg-zinc-900 text-zinc-300 active:scale-95 transition-all"
            >
              <SkipBack className="w-6 h-6" />
            </button>
            <button
              onClick={handlePause}
              aria-label={phase === "running" ? t("pause") : t("resume")}
              className="p-5 rounded-full bg-amber-400 text-zinc-950 active:scale-95 transition-all"
            >
              {phase === "running" ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
            </button>
            <button
              onClick={() => startLevel(levelIdx + 1, true)}
              aria-label={t("nextLevel")}
              className="p-4 rounded-full bg-zinc-900 text-zinc-300 active:scale-95 transition-all"
            >
              <SkipForward className="w-6 h-6" />
            </button>
            <button
              onClick={handleAddMinute}
              className="p-4 rounded-full bg-zinc-900 text-zinc-300 text-sm font-semibold active:scale-95 transition-all"
            >
              {t("addMinute")}
            </button>
          </div>
        )}
      </div>

      {/* edit panel */}
      {editing && (
        <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">{t("editLevels")}</h2>
              <button
                onClick={() => setEditing(false)}
                aria-label={t("done")}
                className="p-2 rounded-lg text-zinc-400 hover:text-white active:scale-95 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-zinc-500 mb-2">{t("presets")}</div>
            <div className="flex gap-2 mb-6 flex-wrap">
              <button
                onClick={() => applyPreset(6)}
                className="px-4 py-2 rounded-full bg-zinc-900 text-sm active:scale-95 transition-all"
              >
                {t("presetHyper")}
              </button>
              <button
                onClick={() => applyPreset(10)}
                className="px-4 py-2 rounded-full bg-zinc-900 text-sm active:scale-95 transition-all"
              >
                {t("presetTurbo")}
              </button>
              <button
                onClick={() => applyPreset(15)}
                className="px-4 py-2 rounded-full bg-zinc-900 text-sm active:scale-95 transition-all"
              >
                {t("presetStandard")}
              </button>
            </div>

            <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_2rem] gap-2 items-center text-xs text-zinc-500 mb-1 px-1">
              <span>#</span>
              <span>{t("smallBlind")}</span>
              <span>{t("bigBlind")}</span>
              <span>{t("ante")}</span>
              <span>{t("minutesShort")}</span>
              <span />
            </div>
            <div className="space-y-2">
              {levels.map((lvl, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[2rem_1fr_1fr_1fr_1fr_2rem] gap-2 items-center rounded-lg ${i === levelIdx ? "text-amber-400 bg-amber-400/10 -mx-1 px-1" : ""}`}
                >
                  <span className="text-sm tabular-nums">{i === levelIdx ? "▶" : i + 1}</span>
                  {(["sb", "bb", "ante", "minutes"] as const).map((field) => (
                    <input
                      key={field}
                      type="text"
                      inputMode="numeric"
                      value={lvl[field]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        updateLevel(i, { [field]: Number.isNaN(v) ? 0 : v });
                      }}
                      className="w-full text-base bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-white tabular-nums"
                    />
                  ))}
                  <button
                    onClick={() => removeLevel(i)}
                    aria-label={t("removeLevel")}
                    className="p-2 text-zinc-600 hover:text-red-400 active:scale-95 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6">
              <button
                onClick={addLevel}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 text-sm active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" /> {t("addLevel")}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 text-sm text-red-400 active:scale-95 transition-all"
              >
                <RotateCcw className="w-4 h-4" /> {t("resetClock")}
              </button>
            </div>

            <button
              onClick={() => setEditing(false)}
              className="w-full mt-6 bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full active:scale-95 transition-all"
            >
              {t("done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
