import Link from "next/link";
import { Home, Mountain, Coffee, Flower2 } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="flex min-h-svh flex-col bg-background">
      {/* Simple header with logo */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link href="/" className="font-bold text-lg">
            dalat.app
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center space-y-8">
          {/* Decorative icons representing Dalat */}
          <div className="flex items-center justify-center gap-3 text-muted-foreground/50">
            <Mountain className="w-6 h-6" />
            <Coffee className="w-5 h-5" />
            <Flower2 className="w-6 h-6" />
          </div>

          {/* 404 with warm gradient */}
          <h1 className="text-8xl font-bold tracking-tighter bg-gradient-to-br from-orange-400 via-rose-400 to-purple-500 bg-clip-text text-transparent">
            404
          </h1>

          {/* Friendly message */}
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">
              Lost in the mist?
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Like wandering into an undiscovered corner of Da Lat, this page
              doesn&apos;t exist. But the journey home is just a click away.
            </p>
          </div>

          {/* CTA Button */}
          <div className="pt-4">
            <Link href="/">
              <Button
                size="lg"
                className="gap-2 active:scale-95 transition-all"
              >
                <Home className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
          </div>

          {/* Subtle decorative footer text */}
          <p className="text-xs text-muted-foreground/40 pt-8">
            Events · People · Moments · Love · Đà Lạt 🇻🇳
          </p>
        </div>
      </main>
    </div>
    </ThemeProvider>
  );
}
