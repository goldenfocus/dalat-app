import { Link } from "@/lib/i18n/routing";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BlogPostForm } from "@/components/admin/blog-post-form";
import type { BlogCategory } from "@/lib/types/blog";

interface AdminBlogPostDetail {
  id: string;
  slug: string;
  title: string;
  story_content: string;
  technical_content: string;
  cover_image_url: string | null;
  source: string;
  status: string;
  version: string | null;
  summary_date: string | null;
  areas_changed: string[] | null;
  meta_description: string | null;
  seo_keywords: string[] | null;
  suggested_cta_url: string | null;
  suggested_cta_text: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
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

async function getBlogPost(id: string): Promise<AdminBlogPostDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_blog_post", {
    p_post_id: id,
  });

  if (error || !data || data.length === 0) {
    console.error("Error fetching blog post:", error);
    return null;
  }

  return data[0] as AdminBlogPostDetail;
}

async function getCategories(): Promise<BlogCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  return (data ?? []) as BlogCategory[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBlogPostPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("admin");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getProfile(user.id);

  // Check blog permission: admin/superadmin role OR can_blog flag
  const canBlog =
    profile?.role === "admin" ||
    profile?.role === "superadmin" ||
    profile?.can_blog === true;

  if (!profile || !canBlog) {
    redirect("/");
  }

  const [post, categories] = await Promise.all([
    getBlogPost(id),
    getCategories(),
  ]);

  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/admin/blog"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold">Edit Post</h1>
        </div>
        <p className="text-muted-foreground">
          Editing: {post.title}
        </p>
      </div>

      {/* Form */}
      <BlogPostForm post={post} categories={categories} />
    </div>
  );
}
