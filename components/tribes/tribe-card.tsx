import Image from "next/image";
import { useTranslations } from "next-intl";
import { Users, UserCheck } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import type { DiscoverTribe } from "@/lib/tribes";

const GRADIENTS = [
  "from-orange-400 to-rose-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-purple-400 to-fuchsia-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-purple-500",
];

function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function TribeCard({ tribe }: { tribe: DiscoverTribe }) {
  const t = useTranslations("tribes");
  const isOpen = tribe.access_type === "public";

  return (
    <Link
      href={`/tribes/${tribe.slug}`}
      className="group block rounded-xl border border-border overflow-hidden hover:border-primary/50 hover:bg-muted/50 transition-colors active:scale-[0.99]"
    >
      <div className={`relative h-24 bg-gradient-to-br ${gradientFor(tribe.name)}`}>
        {tribe.cover_image_url ? (
          <Image
            src={tribe.cover_image_url}
            alt={tribe.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-white/80">
            {tribe.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
          {tribe.name}
        </h3>
        {tribe.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {tribe.description}
          </p>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {isOpen ? <Users className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          {isOpen ? t("accessOpen") : t("accessRequest")}
        </span>
      </div>
    </Link>
  );
}
