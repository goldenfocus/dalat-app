"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, Maximize2 } from "lucide-react";
import { PhotoViewer, type ViewerPhoto } from "@/components/ui/photo-viewer";
import { CommentsButton } from "@/components/comments";
import { createClient } from "@/lib/supabase/client";

type Photo = { id: string; alt: string; caption?: string | null };

function LikeButton({ mediaId, userId, count, liked, onChange }: {
  mediaId: string; userId?: string; count: number; liked: boolean;
  onChange: (liked: boolean, count: number) => void;
}) {
  const t = useTranslations("photoViewer");
  const toggle = async () => {
    if (!userId) { window.location.href = `/auth/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
    const db = createClient();
    const next = !liked;
    onChange(next, count + (next ? 1 : -1));
    const { error } = next
      ? await db.from("experience_media_likes").insert({ media_id: mediaId, user_id: userId })
      : await db.from("experience_media_likes").delete().eq("media_id", mediaId).eq("user_id", userId);
    if (error) onChange(liked, count);
  };
  return (
    <button
      onClick={toggle}
      aria-pressed={liked}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 active:scale-95 transition"
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
      {count > 0 ? count : t("like")}
    </button>
  );
}

export function ExperiencePhotoGallery({ experienceId, title, authorId, userId, photos }: {
  experienceId: string; title: string; authorId: string; userId?: string; photos: Photo[];
}) {
  const t = useTranslations("photoViewer");
  const [index, setIndex] = useState<number | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});

  useEffect(() => {
    const ids = photos.map((p) => p.id);
    if (!ids.length) return;
    createClient()
      .from("experience_media_likes")
      .select("media_id,user_id")
      .in("media_id", ids)
      .then(({ data }: { data: { media_id: string; user_id: string }[] | null }) => {
        const next: Record<string, { count: number; liked: boolean }> = {};
        for (const id of ids) next[id] = { count: 0, liked: false };
        for (const row of data || []) {
          next[row.media_id].count++;
          if (row.user_id === userId) next[row.media_id].liked = true;
        }
        setLikes(next);
      });
  }, [photos, userId]);

  useEffect(() => {
    const m = window.location.hash.match(/^#photo-(.+)$/);
    const i = m ? photos.findIndex((p) => p.id === m[1]) : -1;
    if (i >= 0) setIndex(i);
  }, [photos]);

  const viewerPhotos: ViewerPhoto[] = photos.map((p) => ({
    id: p.id,
    src: `/experience-media/${experienceId}/${p.id}`,
    alt: p.alt,
    caption: p.caption,
  }));

  return (
    <>
      {photos.map((p, i) => (
        <figure key={p.id} id={`photo-${p.id}`} className="scroll-mt-20">
          <button
            type="button"
            onClick={() => setIndex(i)}
            className="group relative block w-full overflow-hidden rounded-2xl"
            aria-label={t("open", { alt: p.alt })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/experience-media/${experienceId}/${p.id}`}
              alt={p.alt}
              fetchPriority={i === 0 ? "high" : undefined}
              loading={i === 0 ? "eager" : "lazy"}
              className="w-full transition-transform duration-300 group-hover:scale-[1.01]"
            />
            <span className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white opacity-80">
              <Maximize2 className="h-4 w-4" />
            </span>
            {(likes[p.id]?.count || 0) > 0 && (
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                <Heart className="h-3 w-3 fill-white" /> {likes[p.id].count}
              </span>
            )}
          </button>
          {p.caption && <figcaption className="mt-2 text-sm text-muted-foreground">{p.caption}</figcaption>}
        </figure>
      ))}
      <PhotoViewer
        photos={viewerPhotos}
        index={index}
        onIndexChange={setIndex}
        shareTitle={title}
        actions={(photo) => (
          <>
            <LikeButton
              mediaId={photo.id}
              userId={userId}
              count={likes[photo.id]?.count || 0}
              liked={!!likes[photo.id]?.liked}
              onChange={(liked, count) => setLikes((s) => ({ ...s, [photo.id]: { liked, count } }))}
            />
            <CommentsButton
              targetType="experience_media"
              targetId={photo.id}
              eventSlug=""
              contentTitle={title}
              contentOwnerId={authorId}
              currentUserId={userId}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 active:scale-95 transition [&_svg]:h-4 [&_svg]:w-4 [&>span]:text-sm"
            />
          </>
        )}
      />
    </>
  );
}
