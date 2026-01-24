import { Calendar, MapPin, Film } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { AuthButtonClient } from "@/components/auth-button-client";
import { LocalePicker } from "@/components/locale-picker";
import { CreateEventLink } from "@/components/auth/create-event-link";

interface SiteHeaderProps {
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

/**
 * Static site header that preserves ISR caching.
 * Auth-dependent elements (CreateEventLink, AuthButton) are handled client-side.
 */
export function SiteHeader({ actions }: SiteHeaderProps) {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-bold text-lg">
            ĐàLạt.app
          </Link>
          <LocalePicker />
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/map"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label="Map"
          >
            <MapPin className="w-5 h-5" />
          </Link>
          <Link
            href="/calendar"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label="Calendar"
          >
            <Calendar className="w-5 h-5" />
          </Link>
          <Link
            href="/moments"
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label="Moments"
          >
            <Film className="w-5 h-5" />
          </Link>
          <CreateEventLink />
          {actions}
          <AuthButtonClient />
        </div>
      </div>
    </nav>
  );
}
