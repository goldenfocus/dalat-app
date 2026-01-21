import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { AuthButton } from "@/components/auth-button";
import { LocalePicker } from "@/components/locale-picker";
import { TopNavBar } from "@/components/navigation/bottom-nav";
import { Button } from "@/components/ui/button";

interface SiteHeaderProps {
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

export async function SiteHeader({ actions }: SiteHeaderProps) {
  const tNav = await getTranslations("nav");

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 max-w-5xl items-center justify-between mx-auto px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-lg">
            dalat.app
          </Link>
          <TopNavBar />
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <LocalePicker />
          <Link href="/events/new" prefetch={false} className="hidden lg:block">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              {tNav("events")}
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
