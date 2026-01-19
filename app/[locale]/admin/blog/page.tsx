import { Link } from "@/lib/i18n/routing";
import Image from "next/image";
import { ArrowLeft, Plus, FileText, Calendar, Pencil, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import type { BlogPostSource, BlogPostStatus } from "@/lib/types/blog";
import { DeletePostButton } from "@/components/admin/delete-post-button";
import { BlogPostFilters } from "@/components/admin/blog-post-filters";

interface AdminBlogPost {
  id: string;
  slug: string;
  title: string;
  story_content: string;
  technical_content: string;
  cover_image_url: string | null;
  source: BlogPostSource;
  status: BlogPostStatus;
  version: string | null;
  summary_date: string | null;
  areas_changed: string[] | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category_slug: string | null;
  category_name: string | null;
  like_count: number;
}

async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

async function getBlogPosts(
  status: BlogPostStatus | null,
  source: BlogPostSource | null
): Promise<AdminBlogPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_blog_posts", {
    p_status: status,
    p_source: source,
    p_limit: 100,
    p_offset: 0,
  });

  if (error) {
    console.error("Error fetching blog posts:", error);
    return [];
  }

  return (data ?? []) as AdminBlogPost[];
}

interface PageProps {
  searchParams: Promise<{ status?: string; source?: string }>;
}

export default async function AdminBlogPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const t = await getTranslations("admin");
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getProfile(user.id);

  // Only admins/superadmins can access blog admin
  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect("/");
  }

  // Parse filters from URL
  const statusFilter = params.status as BlogPostStatus | undefined;
  const sourceFilter = params.source as BlogPostSource | undefined;

  const posts = await getBlogPosts(statusFilter || null, sourceFilter || null);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/admin"
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold">{t("blog")}</h1>
          </div>
          <p className="text-muted-foreground">
            {t("blogDescription")}
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="h-4 w-4" />
          {t("newPost")}
        </Link>
      </div>

      {/* Filters */}
      <Suspense fallback={<div className="h-10" />}>
        <BlogPostFilters
          currentStatus={statusFilter || null}
          currentSource={sourceFilter || null}
        />
      </Suspense>

      {/* Post List */}
      {posts.length > 0 ? (
        <div className="grid gap-4">
          {posts.map((post) => (
            <BlogPostRow key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border rounded-lg bg-card">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-xl font-semibold mb-2">{t("noPosts")}</h3>
          <p className="text-muted-foreground mb-6">
            {t("createFirstPost")}
          </p>
          <Link
            href="/admin/blog/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <Plus className="h-5 w-5" />
            {t("newPost")}
          </Link>
        </div>
      )}
    </div>
  );
}

function BlogPostRow({ post }: { post: AdminBlogPost }) {
  const createdDate = new Date(post.created_at).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Status badge styles
  const statusStyles: Record<BlogPostStatus, string> = {
    draft: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    experimental: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    published: "bg-green-500/10 text-green-600 dark:text-green-400",
    deprecated: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    archived: "bg-muted text-muted-foreground",
  };

  // Source badge styles
  const sourceStyles: Record<BlogPostSource, string> = {
    manual: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    github_release: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    daily_summary: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  };

  const sourceLabels: Record<BlogPostSource, string> = {
    manual: "Manual",
    github_release: "GitHub",
    daily_summary: "Daily",
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
      {/* Cover Image */}
      <div className="relative h-20 w-32 flex-shrink-0 rounded-lg overflow-hidden">
        {post.cover_image_url ? (
          <Image
            src={post.cover_image_url}
            alt={post.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <FileText className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="font-semibold truncate">{post.title}</h3>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyles[post.status]}`}>
            {post.status}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${sourceStyles[post.source]}`}>
            {sourceLabels[post.source]}
          </span>
          {post.version && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
              v{post.version}
            </span>
          )}
        </div>
        {post.category_name && (
          <p className="text-sm text-muted-foreground truncate mb-2">
            {post.category_name}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{createdDate}</span>
          </div>
          {post.areas_changed && post.areas_changed.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {post.areas_changed.slice(0, 3).map((area) => (
                <span key={area} className="px-1.5 py-0.5 rounded bg-muted text-xs">
                  {area}
                </span>
              ))}
              {post.areas_changed.length > 3 && (
                <span className="text-xs">+{post.areas_changed.length - 3}</span>
              )}
            </div>
          )}
          <span>{post.like_count} likes</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/blog/${post.id}/edit`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Link>
        {post.status === "published" && (
          <Link
            href={`/blog/${post.category_slug || "changelog"}/${post.slug}`}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
          >
            <Eye className="h-3 w-3" />
            View
          </Link>
        )}
        <DeletePostButton postId={post.id} postTitle={post.title} />
      </div>
    </div>
  );
}
