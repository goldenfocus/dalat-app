import Link from "next/link";
import { useTranslations } from "next-intl";
import { Home, Mountain, Coffee, Flower2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
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
            {t("title")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("description")}
          </p>
        </div>

        {/* CTA Button */}
        <div className="pt-4">
          <Link href="/">
            <Button size="lg" className="gap-2 active:scale-95 transition-all">
              <Home className="w-4 h-4" />
              {t("backHome")}
            </Button>
          </Link>
        </div>

        {/* Subtle decorative footer text */}
        <p className="text-xs text-muted-foreground/40 pt-8">
          {t("tagline")}
        </p>
      </div>
    </main>
  );
}
