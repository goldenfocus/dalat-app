import { Suspense } from "react";
import { Film, Plus } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { AuthButton } from "@/components/auth-button";
import { LocalePicker } from "@/components/locale-picker";

interface SiteHeaderProps {
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

export async function SiteHeader({ actions }: SiteHeaderProps) {
  const tNav = await getTranslations("nav");

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-bold text-lg">
            ĐàLạt.app
          </Link>
          <LocalePicker />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/moments"
            className="hidden sm:flex text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md"
          >
            {tNav("moments")}
          </Link>
          {actions}
          <Link href="/events/new" prefetch={false} className="hidden lg:block">
            <Button size="sm" variant="outline" className="px-3">
              <Plus className="w-4 h-4 mr-1" />
              <span>{tNav("events")}</span>
            </Button>
          </Link>
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
