"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { BlogPostWithCategory } from "@/lib/types/blog";

interface BlogStoryCardProps {
  post: BlogPostWithCategory;
}

export function BlogStoryCard({ post }: BlogStoryCardProps) {
  const postUrl = `/blog/${post.category_slug || "changelog"}/${post.slug}`;
  const publishedDate = post.published_at
    ? new Date(post.published_at)
    : new Date();

  // Extract first paragraph from story content for preview
  const preview = post.story_content
    .split("\n\n")[0]
    .replace(/[#*_`]/g, "")
    .slice(0, 200);

  return (
    <Link
      href={postUrl}
      className={cn(
        "group block rounded-xl border bg-card overflow-hidden",
        "transition-all hover:border-foreground/20",
        "active:scale-[0.99] active:opacity-90"
      )}
    >
      {/* Cover Image */}
      {post.cover_image_url && (
        <div className="relative aspect-[2/1] overflow-hidden bg-muted">
          <Image
            src={post.cover_image_url}
            alt={post.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {/* Meta row */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
          {post.version && (
            <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
              v{post.version}
            </span>
          )}
          {post.category_name && (
            <span className="text-xs uppercase tracking-wide font-medium">
              {post.category_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDistanceToNow(publishedDate, { addSuffix: true })}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
          {post.title}
        </h2>

        {/* Preview */}
        <p className="text-muted-foreground line-clamp-2 mb-4">
          {preview}
          {preview.length >= 200 && "..."}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Heart className="w-4 h-4" />
            {post.like_count || 0}
          </span>
          <span className="text-primary font-medium">Read more →</span>
        </div>
      </div>
    </Link>
  );
}
