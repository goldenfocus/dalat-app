import { Link } from "@/lib/i18n/routing";
import { AuthButtonClient } from "@/components/auth-button-client";
import { CreateEventLink } from "@/components/auth/create-event-link";
import { ContentNav } from "@/components/navigation/content-nav";
import {
  DeferredHeaderSearch,
  DeferredLocalePicker,
} from "@/components/site-header-deferred";

interface SiteHeaderProps {
  rentalsLabel: string;
  datingLabel: string;
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

/**
 * Static site header that preserves ISR caching.
 * Auth-dependent elements (CreateEventLink, AuthButton) are handled client-side.
 * Search + locale picker are deferred client chunks (see site-header-deferred).
 */
export function SiteHeader({ actions, rentalsLabel, datingLabel }: SiteHeaderProps) {
  return (
    <header data-floating-chrome="site-header" className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4 lg:px-4">
        <div className="col-start-1 row-start-1 flex h-14 items-center gap-0.5 pl-2 min-[360px]:gap-1.5 min-[360px]:pl-4 lg:pl-0">
          <Link
            href="/"
            // On every page: prefetching the homepage replays its hero image
            // preload here, a wasted high-priority download per page view.
            prefetch={false}
            data-fog-wordmark
            className="font-bold text-base min-[360px]:text-lg"
          >
            ĐàLạt.app
          </Link>
          <div className="flex items-center gap-0 min-[360px]:gap-1">
            {/* Theme choice lives in Settings */}
            <DeferredLocalePicker />
          </div>
        </div>
        <ContentNav rentalsLabel={rentalsLabel} datingLabel={datingLabel} />
        <div className="col-start-2 row-start-1 flex items-center pr-2 min-[360px]:gap-1 min-[360px]:pr-4 lg:col-start-3 lg:pr-0">
          <DeferredHeaderSearch />
          <CreateEventLink />
          {actions}
          <AuthButtonClient />
        </div>
      </div>
    </header>
  );
}
