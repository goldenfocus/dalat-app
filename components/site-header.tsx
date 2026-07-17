import { Building2, Calendar, MapPin, Film } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { AuthButtonClient } from "@/components/auth-button-client";
import { CreateEventLink } from "@/components/auth/create-event-link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DeferredHeaderSearch,
  DeferredLocalePicker,
} from "@/components/site-header-deferred";

interface SiteHeaderProps {
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

/**
 * Static site header that preserves ISR caching.
 * Auth-dependent elements (CreateEventLink, AuthButton) are handled client-side.
 * Search + locale picker are deferred client chunks (see site-header-deferred).
 */
export function SiteHeader({ actions }: SiteHeaderProps) {
  const t = useTranslations("nav");
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 max-w-6xl items-center justify-between mx-auto px-4">
        <div className="flex items-center gap-1.5">
          <Link href="/" className="font-bold text-lg">
            ĐàLạt.app
          </Link>
          <div className="flex items-center gap-1">
            <DeferredLocalePicker />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/map"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label={t("map")}
          >
            <MapPin className="w-5 h-5" aria-hidden="true" />
          </Link>
          <Link
            href="/calendar"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label={t("calendar")}
          >
            <Calendar className="w-5 h-5" aria-hidden="true" />
          </Link>
          <Link
            href="/venues"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label={t("venues")}
          >
            <Building2 className="w-5 h-5" aria-hidden="true" />
          </Link>
          <Link
            href="/moments"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label={t("moments")}
          >
            <Film className="w-5 h-5" aria-hidden="true" />
          </Link>
          <DeferredHeaderSearch />
          <CreateEventLink />
          {actions}
          <AuthButtonClient />
        </div>
      </div>
    </nav>
  );
}
