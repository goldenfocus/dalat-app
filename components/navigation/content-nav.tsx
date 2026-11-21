"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/routing";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cityLinks, isSectionActive } from "./secondary-links";

const itemClass = "min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 text-sm font-medium transition-colors xl:px-3";
const currentClass = "border-primary text-foreground";
const defaultClass = "border-transparent text-muted-foreground hover:border-border hover:text-foreground";

export function ContentNav({ rentalsLabel, datingLabel }: { rentalsLabel: string; datingLabel: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const sections = [
    { label: t("events"), href: "/events/upcoming", prefix: "/events" },
    { label: t("experiences"), href: "/experiences", prefix: "/experiences" },
    { label: t("moments"), href: "/moments", prefix: "/moments" },
    { label: datingLabel, href: "/dating", prefix: "/dating" },
    { label: rentalsLabel, href: "/rentals", prefix: "/rentals" },
  ] as const;
  return (
    <nav aria-label={t("primary")}
      className="col-span-2 row-start-2 min-w-0 border-t border-border/40 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:border-0">
      <div data-fog-sections className="flex items-center overflow-x-auto overscroll-x-contain px-2 lg:w-fit lg:max-w-full lg:px-0">
        {sections.map(({ label, href, prefix }) => {
          const active = isSectionActive(pathname, prefix);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={`${itemClass} ${prefix === "/rentals" ? "hidden lg:flex" : "flex flex-1 lg:flex-none"} ${active ? currentClass : defaultClass}`}
            >
              {label}
            </Link>
          );
        })}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger className={`${itemClass} hidden lg:flex ${cityLinks.some(({ href }) => isSectionActive(pathname, href)) ? currentClass : defaultClass}`}>
            {t("more")}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {cityLinks.map(({ key, href, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} prefetch={false} className="min-h-10"
                  aria-current={isSectionActive(pathname, href) ? "page" : undefined}>
                  <Icon aria-hidden="true" />
                  {t(key)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
