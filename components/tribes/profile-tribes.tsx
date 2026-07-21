import Image from "next/image";
import { Users, Crown, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";

interface PublicTribe {
  id: string;
  slug: string;
  name: string;
  cover_image_url: string | null;
  member_count: number;
  role: "leader" | "admin" | "member";
}

interface ProfileTribesProps {
  userId: string;
}

export async function ProfileTribes({ userId }: ProfileTribesProps) {
  const supabase = await createClient();

  // SECURITY DEFINER RPC: tribe_members RLS hides other users' memberships
  // entirely, so a direct query here returns nothing. The RPC exposes only
  // discoverable (public/request + listed) tribes the user hasn't hidden.
  const { data, error } = await supabase.rpc("get_user_public_tribes", {
    p_user_id: userId,
  });

  if (error) {
    console.error("get_user_public_tribes failed:", error);
    return null;
  }

  const tribes = (data ?? []) as PublicTribe[];
  if (tribes.length === 0) return null;

  const t = await getTranslations("tribes");

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-4">{t("title")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tribes.map((tribe) => (
          <Link
            key={tribe.id}
            href={`/tribes/${tribe.slug}`}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted active:scale-[0.99] transition-all"
          >
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
              {tribe.cover_image_url ? (
                <Image
                  src={tribe.cover_image_url}
                  alt={tribe.name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <span className="text-lg font-bold text-primary">
                  {tribe.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate flex items-center gap-1.5">
                {tribe.name}
                {tribe.role === "leader" && <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                {tribe.role === "admin" && <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {tribe.member_count} {t("members").toLowerCase()}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
