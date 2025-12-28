import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { AuthButton } from "@/components/auth-button";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-2xl items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <h1 className="font-semibold">Settings</h1>
            </div>
          </div>
          <AuthButton />
        </div>
      </nav>

      <div className="container max-w-2xl mx-auto px-4 py-8">{children}</div>
    </main>
  );
}
