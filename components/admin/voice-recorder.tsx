"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Extend Window for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

type TranscriptionMode = "checking" | "server" | "browser" | "unavailable";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onTranscript, onError, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>("checking");
  const [interimTranscript, setInterimTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>("");

  // Check transcription availability on mount
  useEffect(() => {
    const checkTranscriptionService = async () => {
      try {
        const res = await fetch("/api/blog/transcribe");
        const data = await res.json();
        if (data.resolved_key_exists) {
          setTranscriptionMode("server");
          return;
        }
      } catch {
        // Server check failed, continue to browser check
      }

      // Check for browser Speech Recognition API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setTranscriptionMode("browser");
      } else {
        setTranscriptionMode("unavailable");
      }
    };

    checkTranscriptionService();
  }, []);

  const drawWaveform = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = "hsl(var(--muted))";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw bars
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Use primary color with varying opacity
        const hue = 270; // Purple hue
        const lightness = 50 + (dataArray[i] / 255) * 20;
        ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;

        ctx.fillRect(
          x,
          (canvas.height - barHeight) / 2,
          barWidth - 1,
          barHeight
        );

        x += barWidth;
      }
    };

    draw();
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && analyserRef.current) {
      drawWaveform();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, drawWaveform]);

  // Browser-based speech recognition (Web Speech API)
  const startBrowserRecognition = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError("Speech recognition not supported in this browser");
      return;
    }

    try {
      // Request microphone access for visualization
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      // Set up audio visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Store stream to stop later
      mediaRecorderRef.current = { stream } as unknown as MediaRecorder;

      // Set up speech recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US"; // Could be made configurable

      finalTranscriptRef.current = "";
      setInterimTranscript("");

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (final) {
          finalTranscriptRef.current += final;
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: Event & { error: string }) => {
        if (event.error !== "aborted") {
          onError(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        // Recognition ended - finalize transcript
        if (finalTranscriptRef.current.trim()) {
          onTranscript(finalTranscriptRef.current.trim());
        }
        setInterimTranscript("");

        // Clean up
        stream.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };

      speechRecognitionRef.current = recognition;
      recognition.start();

      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      onError("Microphone access denied. Please allow microphone access to record.");
    }
  };

  // Server-based recording (Whisper via OpenAI)
  const startServerRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      // Set up audio visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start recording
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      onError("Microphone access denied. Please allow microphone access to record.");
    }
  };

  const startRecording = async () => {
    if (transcriptionMode === "browser") {
      await startBrowserRecognition();
    } else if (transcriptionMode === "server") {
      await startServerRecording();
    } else {
      onError("Transcription service not available");
    }
  };

  const stopRecording = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Stop browser speech recognition if active
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }

    // Stop media recorder if it's a real MediaRecorder (server mode)
    if (mediaRecorderRef.current && typeof mediaRecorderRef.current.stop === "function") {
      mediaRecorderRef.current.stop();
    } else if (mediaRecorderRef.current) {
      // Browser mode - just stop the stream for visualization
      const recorder = mediaRecorderRef.current as unknown as { stream?: MediaStream };
      recorder.stream?.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    }

    setIsRecording(false);
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // Upload to Supabase Storage
      const supabase = createClient();
      const fileName = `voice-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from("blog-audio")
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      // Get signed URL (bucket is private, so we need a temporary signed URL)
      const { data: signedData, error: signedError } = await supabase.storage
        .from("blog-audio")
        .createSignedUrl(fileName, 300); // 5 minutes expiry

      if (signedError || !signedData?.signedUrl) {
        throw new Error("Failed to create signed URL for audio");
      }

      // Call transcription API
      const res = await fetch("/api/blog/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: signedData.signedUrl }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onTranscript(data.transcript);

      // Clean up uploaded file (optional - could keep for debugging)
      await supabase.storage.from("blog-audio").remove([fileName]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isDisabled = disabled || transcriptionMode === "checking" || transcriptionMode === "unavailable";

  const getStatusText = () => {
    if (transcriptionMode === "checking") return "Checking transcription service...";
    if (transcriptionMode === "unavailable") return "Voice transcription unavailable - please type instead";
    if (isProcessing) return "Transcribing...";
    if (isRecording) {
      if (transcriptionMode === "browser" && interimTranscript) {
        return interimTranscript;
      }
      return `Recording ${formatDuration(recordingDuration)} - tap to stop`;
    }
    return "Tap to record";
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        width={300}
        height={60}
        className="w-full max-w-sm h-16 rounded-lg bg-muted"
      />

      {/* Interim transcript display (browser mode) */}
      {isRecording && transcriptionMode === "browser" && finalTranscriptRef.current && (
        <div className="w-full max-w-sm p-3 rounded-lg bg-muted/50 text-sm">
          <span className="text-foreground">{finalTranscriptRef.current}</span>
          {interimTranscript && (
            <span className="text-muted-foreground italic">{interimTranscript}</span>
          )}
        </div>
      )}

      {/* Recording Button */}
      <div className="flex flex-col items-center gap-2">
        {isProcessing ? (
          <button
            disabled
            className="rounded-full w-16 h-16 bg-primary/50 text-primary-foreground flex items-center justify-center"
          >
            <Loader2 className="w-6 h-6 animate-spin" />
          </button>
        ) : isRecording ? (
          <button
            onClick={stopRecording}
            className="rounded-full w-16 h-16 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center justify-center animate-pulse"
          >
            <Square className="w-6 h-6" />
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={isDisabled}
            className="rounded-full w-16 h-16 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {transcriptionMode === "checking" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>
        )}

        {/* Status Text */}
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          {getStatusText()}
        </p>
      </div>
    </div>
  );
}
