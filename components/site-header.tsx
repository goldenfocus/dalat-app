import { Suspense } from "react";
import { Link } from "@/lib/i18n/routing";
import { AuthButton } from "@/components/auth-button";
import { LocalePicker } from "@/components/locale-picker";
import { TopNavBar } from "@/components/navigation/bottom-nav";

interface SiteHeaderProps {
  /** Optional content to render on the right side before AuthButton */
  actions?: React.ReactNode;
}

export async function SiteHeader({ actions }: SiteHeaderProps) {
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
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
