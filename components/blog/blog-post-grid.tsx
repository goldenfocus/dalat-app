"use client";

import { BlogStoryCard } from "./blog-story-card";
import type { BlogPostWithCategory } from "@/lib/types/blog";

interface BlogPostGridProps {
  posts: BlogPostWithCategory[];
}

export function BlogPostGrid({ posts }: BlogPostGridProps) {
  return (
    <div className="grid gap-6">
      {posts.map((post) => (
        <BlogStoryCard key={post.id} post={post} />
      ))}
    </div>
  );
}
