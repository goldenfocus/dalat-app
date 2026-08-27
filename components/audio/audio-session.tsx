"use client";

import { useEffect } from "react";

import {
  isSameOriginLinkActivation,
  primeAudioForLaterPlayback,
} from "@/lib/audio/user-gesture-unlock";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";

/**
 * Owns the one persistent HTMLAudioElement used across client-side routes and
 * primes it on the first same-site link activation. The visual player remains
 * deferred; this small session component loads eagerly so early navigation
 * gestures are not missed while that UI bundle is downloading.
 */
export function AudioSession() {
  const audioElement = useAudioPlayerStore((state) => state.audioElement);
  const setAudioElement = useAudioPlayerStore((state) => state.setAudioElement);

  useEffect(() => {
    if (audioElement) return;

    const audio = new Audio();
    audio.preload = "metadata";

    audio.addEventListener("loadedmetadata", () => {
      const duration = audio.duration;
      if (duration && Number.isFinite(duration) && duration > 0) {
        useAudioPlayerStore.getState().setDuration(duration);
      }
    });

    audio.addEventListener("durationchange", () => {
      const duration = audio.duration;
      if (duration && Number.isFinite(duration) && duration > 0) {
        useAudioPlayerStore.getState().setDuration(duration);
      }
    });

    audio.addEventListener("timeupdate", () => {
      useAudioPlayerStore.getState().setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      const player = useAudioPlayerStore.getState();

      if (player.repeatMode === "one") {
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        player.next();
      }
    });

    audio.addEventListener("play", () => {
      useAudioPlayerStore.getState().setIsPlaying(true);
    });

    audio.addEventListener("pause", () => {
      useAudioPlayerStore.getState().setIsPlaying(false);
    });

    audio.addEventListener("error", (event) => {
      console.error("Audio error:", event);
      useAudioPlayerStore.getState().setIsPlaying(false);
      useAudioPlayerStore.getState().setIsLoading(false);
    });

    setAudioElement(audio);
  }, [audioElement, setAudioElement]);

  useEffect(() => {
    if (!audioElement) return;

    let isPrimed = false;

    const removeUnlockListener = () => {
      document.removeEventListener("click", handleLinkActivation, true);
    };

    const handleLinkActivation = (event: MouseEvent) => {
      if (
        isPrimed ||
        !event.isTrusted ||
        !isSameOriginLinkActivation(event.target, window.location.origin)
      ) {
        return;
      }

      const player = useAudioPlayerStore.getState();

      // A direct visit to Moments may already have a blocked real track.
      if (player.autoplayBlocked && player.tracks.length > 0) {
        void player.play().then(() => {
          if (useAudioPlayerStore.getState().isPlaying) {
            isPrimed = true;
            removeUnlockListener();
          }
        });
        return;
      }

      // Do not restart a real track that the listener did not block. This
      // preserves explicit pause, close, and mute choices.
      if (player.tracks.length > 0 || player.isPlaying) return;

      void primeAudioForLaterPlayback(audioElement).then((didPrime) => {
        if (didPrime) {
          isPrimed = true;
          removeUnlockListener();
        }
      });
    };

    document.addEventListener("click", handleLinkActivation, true);
    return removeUnlockListener;
  }, [audioElement]);

  return null;
}
