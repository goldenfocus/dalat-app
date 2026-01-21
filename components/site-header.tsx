import { Suspense } from "react";
import { Calendar, MapPin, Plus } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { AuthButton } from "@/components/auth-button";
import { LocalePicker } from "@/components/locale-picker";
import { GoLiveModal } from "@/components/streaming/GoLiveModal";

interface SiteHeaderProps {
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

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
            href="/events/new"
            prefetch={false}
            className="hidden sm:flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
            aria-label="Create event"
          >
            <Plus className="w-5 h-5" />
          </Link>
          <div className="hidden sm:block">
            <GoLiveModal />
          </div>
          {actions}
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
