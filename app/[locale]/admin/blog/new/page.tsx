import { Link } from "@/lib/i18n/routing";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BlogChatInterface } from "@/components/admin/blog-chat-interface";
import type { BlogCategory } from "@/lib/types/blog";

async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

async function getCategories(): Promise<BlogCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  return (data ?? []) as BlogCategory[];
}

export default async function NewBlogPostPage() {
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

  const categories = await getCategories();

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
          <h1 className="text-2xl font-bold">{t("newPost")}</h1>
        </div>
        <p className="text-muted-foreground">
          Create a new blog post with voice or text
        </p>
      </div>

      {/* Chat Interface */}
      <BlogChatInterface categories={categories} />
    </div>
  );
}
