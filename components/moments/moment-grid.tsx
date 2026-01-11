"use client";

import { useTranslations } from "next-intl";
import { MomentCard } from "./moment-card";
import { Camera } from "lucide-react";
import type { MomentWithProfile } from "@/lib/types";

interface MomentGridProps {
  moments: MomentWithProfile[];
  emptyState?: boolean;
}

export function MomentGrid({ moments, emptyState = true }: MomentGridProps) {
  const t = useTranslations("moments");

  if (moments.length === 0 && emptyState) {
    return (
      <div className="text-center py-12">
        <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg mb-2">{t("noMoments")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("beFirst")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {moments.map((moment) => (
        <MomentCard key={moment.id} moment={moment} />
      ))}
    </div>
  );
}
