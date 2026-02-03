"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Laptop, Check, TreePine, Sparkles, Flower2, Sunset, Coffee, CloudFog, Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Theme definitions with visual preview colors
const themes = [
  {
    value: "light",
    labelKey: "themeMorningMist",
    descKey: "themeMorningMistDesc",
    icon: Sun,
    preview: {
      bg: "hsl(40 25% 98%)",
      card: "hsl(40 20% 97%)",
      accent: "hsl(158 35% 32%)",
    },
  },
  {
    value: "dark",
    labelKey: "themeEveningCafe",
    descKey: "themeEveningCafeDesc",
    icon: Moon,
    preview: {
      bg: "hsl(30 20% 7%)",
      card: "hsl(30 18% 11%)",
      accent: "hsl(158 40% 45%)",
    },
  },
  {
    value: "midnight",
    labelKey: "themeMidnight",
    descKey: "themeMidnightDesc",
    icon: Sparkles,
    preview: {
      bg: "hsl(0 0% 0%)",
      card: "hsl(0 0% 5%)",
      accent: "hsl(158 40% 50%)",
    },
  },
  {
    value: "forest",
    labelKey: "themeForest",
    descKey: "themeForestDesc",
    icon: TreePine,
    preview: {
      bg: "hsl(160 25% 6%)",
      card: "hsl(160 22% 10%)",
      accent: "hsl(158 45% 48%)",
    },
  },
  {
    value: "hydrangea",
    labelKey: "themeHydrangea",
    descKey: "themeHydrangeaDesc",
    icon: Flower2,
    preview: {
      bg: "hsl(270 20% 7%)",
      card: "hsl(270 18% 11%)",
      accent: "hsl(270 45% 55%)",
    },
  },
  {
    value: "golden",
    labelKey: "themeGolden",
    descKey: "themeGoldenDesc",
    icon: Sunset,
    preview: {
      bg: "hsl(30 30% 6%)",
      card: "hsl(30 25% 10%)",
      accent: "hsl(38 80% 50%)",
    },
  },
  {
    value: "coffee",
    labelKey: "themeCoffee",
    descKey: "themeCoffeeDesc",
    icon: Coffee,
    preview: {
      bg: "hsl(25 25% 6%)",
      card: "hsl(25 22% 10%)",
      accent: "hsl(25 60% 45%)",
    },
  },
  {
    value: "misty",
    labelKey: "themeMisty",
    descKey: "themeMistyDesc",
    icon: CloudFog,
    preview: {
      bg: "hsl(210 15% 8%)",
      card: "hsl(210 14% 12%)",
      accent: "hsl(200 50% 50%)",
    },
  },
  {
    value: "rose",
    labelKey: "themeRose",
    descKey: "themeRoseDesc",
    icon: Heart,
    preview: {
      bg: "hsl(350 15% 7%)",
      card: "hsl(350 14% 11%)",
      accent: "hsl(350 55% 55%)",
    },
  },
  {
    value: "system",
    labelKey: "themeSystem",
    descKey: "themeSystemDesc",
    icon: Laptop,
    preview: {
      bgLeft: "hsl(40 25% 98%)",
      bgRight: "hsl(30 20% 7%)",
      accent: "hsl(158 40% 45%)",
    },
  },
] as const;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("userMenu");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {themes.slice(0, 9).map((themeItem) => (
          <div
            key={themeItem.value}
            className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-muted/30 animate-pulse"
          >
            <div className="aspect-[4/3] rounded-lg bg-muted" />
            <div className="w-16 h-4 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {themes.map((themeItem) => {
        const Icon = themeItem.icon;
        const isSelected = theme === themeItem.value;
        const isSystemTheme = themeItem.value === "system";

        return (
          <button
            key={themeItem.value}
            onClick={() => setTheme(themeItem.value)}
            className={cn(
              "flex flex-col gap-2 p-3 rounded-xl border-2 transition-all duration-200 text-left",
              "active:scale-[0.98]",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            {/* Visual preview */}
            <div
              className="relative aspect-[4/3] rounded-lg overflow-hidden border border-border/50"
              style={{
                background: isSystemTheme
                  ? `linear-gradient(135deg, ${themeItem.preview.bgLeft} 50%, ${themeItem.preview.bgRight} 50%)`
                  : themeItem.preview.bg,
              }}
            >
              {/* Mini card preview */}
              <div
                className="absolute bottom-2 left-2 right-2 h-6 rounded"
                style={{
                  background: isSystemTheme
                    ? `linear-gradient(135deg, ${themeItem.preview.bgLeft} 50%, hsl(30 18% 11%) 50%)`
                    : themeItem.preview.card,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
              {/* Accent dot */}
              <div
                className="absolute top-2 right-2 w-3 h-3 rounded-full"
                style={{ background: themeItem.preview.accent }}
              />
              {/* Selected checkmark */}
              {isSelected && (
                <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </div>

            {/* Label and description */}
            <div className="flex items-start gap-2">
              <Icon
                className={cn(
                  "w-4 h-4 mt-0.5 flex-shrink-0",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )}
              />
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium truncate",
                    isSelected ? "text-primary" : "text-foreground"
                  )}
                >
                  {t(themeItem.labelKey)}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {t(themeItem.descKey)}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
