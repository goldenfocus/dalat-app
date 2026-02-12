"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { RotateCcw, Camera, Grid3X3, Share2, Check, MapPin, Calendar } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cloudflareLoader } from "@/lib/image-cdn";
import { useShare } from "@/lib/hooks/use-share";
import type { CinemaEventMeta } from "../moments-view-container";

interface Contributor {
  id: string;
  avatar: string | null;
  name: string;
}

interface CinemaEndCardProps {
  eventMeta?: CinemaEventMeta;
  eventSlug: string;
  totalMoments: number;
  contributors: Contributor[];
  onReplay: () => void;
  onAddMoment: () => void;
  onBrowseAll?: () => void;
}

function formatEventDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function CinemaEndCard({
  eventMeta,
  eventSlug,
  totalMoments,
  contributors,
  onReplay,
  onAddMoment,
  onBrowseAll,
}: CinemaEndCardProps) {
  const { share: nativeShare, copied: shared } = useShare();
  const [animateIn, setAnimateIn] = useState(false);

  // Stagger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setAnimateIn(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/events/${eventSlug}/moments?view=cinema`;
  }, [eventSlug]);

  const shareText = eventMeta
    ? `${eventMeta.title} — ${totalMoments} moments captured`
    : `${totalMoments} moments captured`;

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    nativeShare({
      title: eventMeta?.title ?? "Moments",
      text: shareText,
      url: shareUrl,
    });
  };

  const handleAction = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const eventDate = eventMeta?.date ? formatEventDate(eventMeta.date) : null;

  return (
    <div className="fixed inset-0 z-30 bg-black overflow-hidden">
      {/* Background: blurred event image or gradient */}
      {eventMeta?.imageUrl ? (
        <div className="absolute inset-0">
          <Image
            loader={cloudflareLoader}
            src={eventMeta.imageUrl}
            alt=""
            fill
            className="object-cover scale-110 blur-2xl opacity-20"
            aria-hidden="true"
            priority={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-t from-black via-zinc-950 to-zinc-900" />
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        <div
          className={`max-w-sm w-full text-center transition-all duration-700 ${
            animateIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {/* Film-style horizontal rules */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/20" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/20" />
          </div>

          {/* Event title */}
          {eventMeta?.title && (
            <h2 className="text-3xl font-bold text-white mb-3 tracking-tight leading-tight">
              {eventMeta.title}
            </h2>
          )}

          {/* Event details */}
          {(eventDate || eventMeta?.locationName) && (
            <div className="flex items-center justify-center gap-4 text-white/50 text-sm mb-6">
              {eventDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {eventDate}
                </span>
              )}
              {eventMeta?.locationName && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {eventMeta.locationName}
                </span>
              )}
            </div>
          )}

          {/* Stats line */}
          <p className="text-white/40 text-sm mb-6">
            {totalMoments} moments
            {contributors.length > 0 && ` by ${contributors.length} contributor${contributors.length > 1 ? "s" : ""}`}
          </p>

          {/* Contributors */}
          {contributors.length > 0 && (
            <div className="flex justify-center -space-x-2 mb-8">
              {contributors.map((c) => (
                <UserAvatar
                  key={c.id}
                  src={c.avatar}
                  alt={c.name}
                  size="sm"
                  className="ring-2 ring-black"
                />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3 mb-8">
            {/* Primary: Share */}
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-black font-medium hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              {shared ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  Link copied
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Share this album
                </>
              )}
            </button>

            {/* Secondary row */}
            <div className="flex gap-3">
              <button
                onClick={handleAction(onReplay)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 active:scale-[0.98] transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Replay
              </button>
              <button
                onClick={handleAction(onAddMoment)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 active:scale-[0.98] transition-all"
              >
                <Camera className="w-4 h-4" />
                Add yours
              </button>
            </div>

            {onBrowseAll && (
              <button
                onClick={handleAction(onBrowseAll)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-white/50 text-sm hover:text-white/70 transition-colors"
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                Browse all moments
              </button>
            )}
          </div>

          {/* Branding */}
          <div className="flex items-center justify-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-1.5 text-white/25 text-xs tracking-wide">
              <span>made with</span>
              <span className="font-semibold text-white/40">dalat.app</span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
