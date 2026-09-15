"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/routing";

const sections = [
  { key: "events", href: "/events/upcoming", prefix: "/events" },
  { key: "experiences", href: "/experiences", prefix: "/experiences" },
  { key: "moments", href: "/moments", prefix: "/moments" },
] as const;

export function ContentNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <div className="border-t border-border/40">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-2 min-[360px]:px-4">
        {sections.map(({ key, href, prefix }) => {
          const active = pathname.startsWith(prefix);
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center border-b-2 px-2 text-sm font-medium transition-colors sm:flex-none sm:px-5 ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
            >
              {t(key)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
