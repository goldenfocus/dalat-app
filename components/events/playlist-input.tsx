"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Music,
  X,
  Plus,
  Loader2,
  GripVertical,
  Upload,
  Trash2,
  ArrowDownAZ,
  ArrowUpAZ,
  Clock,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  extractAudioMetadata,
  albumArtToBlob,
  isAudioFile,
  formatDuration,
} from "@/lib/audio-metadata";

interface PlaylistTrack {
  id: string;
  file_url: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
}

interface PlaylistInputProps {
  eventId: string;
  initialPlaylistId?: string | null;
  initialTracks?: PlaylistTrack[];
}

interface UploadingTrack {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "extracting" | "done" | "error";
  error?: string;
  metadata?: {
    title: string | null;
    artist: string | null;
    album: string | null;
    duration_seconds: number | null;
    albumArt: { data: Uint8Array; format: string } | null;
  };
}

const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function PlaylistInput({
  eventId,
  initialPlaylistId,
  initialTracks = [],
}: PlaylistInputProps) {
  const t = useTranslations("playlist");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [playlistId, setPlaylistId] = useState<string | null>(initialPlaylistId ?? null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>(initialTracks);
  const [uploading, setUploading] = useState<UploadingTrack[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  // Use ref to track playlist ID synchronously (state updates are async)
  const playlistIdRef = useRef<string | null>(initialPlaylistId ?? null);

  // Keep ref in sync with state
  useEffect(() => {
    playlistIdRef.current = playlistId;
  }, [playlistId]);

  // Ensure playlist exists before adding tracks
  const ensurePlaylist = useCallback(async (): Promise<string | null> => {
    // Check ref first (synchronous) to avoid race conditions
    if (playlistIdRef.current) return playlistIdRef.current;

    setIsCreatingPlaylist(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // First, check if playlist already exists for this event
      const { data: existing } = await supabase
        .from("event_playlists")
        .select("id")
        .eq("event_id", eventId)
        .single();

      if (existing) {
        // Playlist already exists, use it
        playlistIdRef.current = existing.id;
        setPlaylistId(existing.id);
        return existing.id;
      }

      // No playlist exists, create one
      const { data, error } = await supabase
        .from("event_playlists")
        .insert({
          event_id: eventId,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error) {
        // Handle race condition: if another request created it, fetch it
        if (error.code === "23505") {
          const { data: raceExisting } = await supabase
            .from("event_playlists")
            .select("id")
            .eq("event_id", eventId)
            .single();
          if (raceExisting) {
            playlistIdRef.current = raceExisting.id;
            setPlaylistId(raceExisting.id);
            return raceExisting.id;
          }
        }
        throw error;
      }

      playlistIdRef.current = data.id;
      setPlaylistId(data.id);
      return data.id;
    } catch (error) {
      console.error("Failed to create playlist:", error);
      return null;
    } finally {
      setIsCreatingPlaylist(false);
    }
  }, [eventId]);

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Sort files alphabetically by filename before processing
    const sortedFiles = Array.from(files).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    const newUploads: UploadingTrack[] = [];

    for (const file of sortedFiles) {
      // Validate file type
      if (!AUDIO_MIME_TYPES.includes(file.type) && !isAudioFile(file)) {
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        continue;
      }

      newUploads.push({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: "pending",
      });
    }

    if (newUploads.length === 0) return;

    setUploading((prev) => [...prev, ...newUploads]);

    // Process uploads sequentially to avoid overwhelming the browser
    for (const upload of newUploads) {
      await processUpload(upload);
    }
  }, []);

  // Process a single upload
  const processUpload = async (upload: UploadingTrack) => {
    const supabase = createClient();

    try {
      // Step 1: Extract metadata
      setUploading((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, status: "extracting" } : u))
      );

      const metadata = await extractAudioMetadata(upload.file);

      setUploading((prev) =>
        prev.map((u) =>
          u.id === upload.id
            ? {
                ...u,
                metadata: {
                  title: metadata.title,
                  artist: metadata.artist,
                  album: metadata.album,
                  duration_seconds: metadata.durationSeconds,
                  albumArt: metadata.albumArt,
                },
              }
            : u
        )
      );

      // Step 2: Ensure playlist exists
      const pId = await ensurePlaylist();
      if (!pId) throw new Error("Failed to create playlist");

      // Step 3: Upload audio file
      setUploading((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, status: "uploading", progress: 10 } : u))
      );

      const fileExt = upload.file.name.split(".").pop() || "mp3";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `playlists/${eventId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(filePath, upload.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploading((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, progress: 60 } : u))
      );

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("event-media")
        .getPublicUrl(filePath);

      const fileUrl = urlData.publicUrl;

      // Step 4: Upload album art if present
      let thumbnailUrl: string | null = null;
      if (metadata.albumArt) {
        const artBlob = albumArtToBlob(metadata.albumArt);
        if (artBlob) {
          const artFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-art.jpg`;
          const artPath = `playlists/${eventId}/${artFileName}`;

          const { error: artError } = await supabase.storage
            .from("event-media")
            .upload(artPath, artBlob, {
              cacheControl: "31536000",
              upsert: false,
            });

          if (!artError) {
            const { data: artUrlData } = supabase.storage
              .from("event-media")
              .getPublicUrl(artPath);
            thumbnailUrl = artUrlData.publicUrl;
          }
        }
      }

      setUploading((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, progress: 80 } : u))
      );

      // Step 5: Create track record
      const { data: track, error: trackError } = await supabase
        .from("playlist_tracks")
        .insert({
          playlist_id: pId,
          file_url: fileUrl,
          title: metadata.title || upload.file.name.replace(/\.[^/.]+$/, ""),
          artist: metadata.artist,
          album: metadata.album,
          thumbnail_url: thumbnailUrl,
          duration_seconds: metadata.durationSeconds,
          sort_order: tracks.length + uploading.filter((u) => u.status === "done").length,
        })
        .select("*")
        .single();

      if (trackError) throw trackError;

      // Success - add to tracks list
      setTracks((prev) => [...prev, track as PlaylistTrack]);

      setUploading((prev) =>
        prev.map((u) => (u.id === upload.id ? { ...u, status: "done", progress: 100 } : u))
      );

      // Remove from uploading list after a delay
      setTimeout(() => {
        setUploading((prev) => prev.filter((u) => u.id !== upload.id));
      }, 1000);
    } catch (error) {
      console.error("Upload failed:", error);
      setUploading((prev) =>
        prev.map((u) =>
          u.id === upload.id
            ? { ...u, status: "error", error: error instanceof Error ? error.message : "Upload failed" }
            : u
        )
      );
    }
  };

  // Delete a track
  const handleDeleteTrack = async (trackId: string) => {
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("playlist_tracks")
        .delete()
        .eq("id", trackId);

      if (error) throw error;

      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (error) {
      console.error("Failed to delete track:", error);
    }
  };

  // Drag and drop reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newTracks = [...tracks];
    const [draggedTrack] = newTracks.splice(draggedIndex, 1);
    newTracks.splice(index, 0, draggedTrack);

    setTracks(newTracks);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;

    // Update sort_order in database
    await persistTrackOrder(tracks);
    setDraggedIndex(null);
  };

  // Persist track order to database
  const persistTrackOrder = async (orderedTracks: PlaylistTrack[]) => {
    const supabase = createClient();
    const updates = orderedTracks.map((track, index) => ({
      id: track.id,
      sort_order: index,
    }));

    try {
      for (const update of updates) {
        await supabase
          .from("playlist_tracks")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
      }
    } catch (error) {
      console.error("Failed to update track order:", error);
    }
  };

  // Sort tracks by different criteria
  type SortOption = "title-asc" | "title-desc" | "artist" | "duration" | "duration-desc";

  const handleSort = async (option: SortOption) => {
    const sorted = [...tracks].sort((a, b) => {
      switch (option) {
        case "title-asc":
          return (a.title || "").localeCompare(b.title || "", undefined, { numeric: true });
        case "title-desc":
          return (b.title || "").localeCompare(a.title || "", undefined, { numeric: true });
        case "artist":
          return (a.artist || "zzz").localeCompare(b.artist || "zzz");
        case "duration":
          return (a.duration_seconds || 0) - (b.duration_seconds || 0);
        case "duration-desc":
          return (b.duration_seconds || 0) - (a.duration_seconds || 0);
        default:
          return 0;
      }
    });

    setTracks(sorted);
    await persistTrackOrder(sorted);
  };

  // Cancel an upload
  const handleCancelUpload = (uploadId: string) => {
    setUploading((prev) => prev.filter((u) => u.id !== uploadId));
  };

  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
          "hover:border-primary/50 hover:bg-accent/50"
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("border-primary", "bg-accent");
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove("border-primary", "bg-accent");
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-primary", "bg-accent");
          handleFileSelect(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">{t("uploadAudio") || "Upload audio files"}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("uploadAudioHint") || "MP3, M4A, WAV (max 100MB each)"}
        </p>
      </div>

      {/* Uploading tracks */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                {upload.status === "done" ? (
                  <Music className="w-5 h-5 text-primary" />
                ) : (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {upload.metadata?.title || upload.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {upload.status === "extracting" && (t("extractingMetadata") || "Extracting metadata...")}
                  {upload.status === "uploading" && `${t("uploading") || "Uploading"}... ${upload.progress}%`}
                  {upload.status === "done" && (t("uploadComplete") || "Complete")}
                  {upload.status === "error" && (
                    <span className="text-destructive">{upload.error}</span>
                  )}
                </p>
              </div>
              {upload.status !== "done" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelUpload(upload.id);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Track list */}
      {tracks.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
            <span>
              {t("tracks", { count: tracks.length })} &middot;{" "}
              {totalDuration > 0 && `${Math.round(totalDuration / 60)} min`}
            </span>
            {/* Sort buttons - show when 3+ tracks */}
            {tracks.length >= 3 && (
              <div className="flex items-center gap-1">
                <span className="text-xs mr-1">{t("sortBy")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleSort("title-asc")}
                  title={t("sortTitleAsc")}
                >
                  <ArrowDownAZ className="w-3.5 h-3.5 mr-1" />
                  {t("sortTitle")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleSort("artist")}
                  title={t("sortArtist")}
                >
                  <User className="w-3.5 h-3.5 mr-1" />
                  {t("sortArtistLabel")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleSort("duration")}
                  title={t("sortDuration")}
                >
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  {t("sortDurationLabel")}
                </Button>
              </div>
            )}
          </div>
          <div className="border rounded-lg divide-y">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex items-center gap-3 p-3 bg-card transition-colors",
                  draggedIndex === index && "bg-accent"
                )}
              >
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {track.thumbnail_url ? (
                    <img
                      src={track.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {track.title || `Track ${index + 1}`}
                  </p>
                  {track.artist && (
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  )}
                </div>
                {track.duration_seconds && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatDuration(track.duration_seconds)}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteTrack(track.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {tracks.length === 0 && uploading.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("noTracksYet") || "No tracks yet. Upload audio files to create a playlist."}
        </p>
      )}
    </div>
  );
}
