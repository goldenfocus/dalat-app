"use client";

import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src: string | null | undefined;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  fallbackClassName?: string;
  /** When true, clicking the avatar opens a full-size lightbox */
  expandable?: boolean;
}

const sizeClasses = {
  xs: "h-5 w-5",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-24 w-24",
};

/**
 * User avatar component with automatic fallback handling.
 * Uses Radix Avatar which handles image load errors automatically.
 */
export function UserAvatar({
  src,
  alt = "",
  size = "md",
  className,
  fallbackClassName,
  expandable = false,
}: UserAvatarProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const avatar = (
    <Avatar className={cn(sizeClasses[size], className)}>
      {src && <AvatarImage src={src} alt={alt} />}
      <AvatarFallback className={cn("bg-primary/20", fallbackClassName)} />
    </Avatar>
  );

  // If not expandable or no image, just return the avatar
  if (!expandable || !src) {
    return avatar;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="cursor-pointer rounded-full transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label={`View ${alt || "profile picture"} full size`}
      >
        {avatar}
      </button>
      <ImageLightbox
        src={src}
        alt={alt || "Profile picture"}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
