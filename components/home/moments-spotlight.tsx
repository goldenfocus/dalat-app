"use client";

import { useMemo } from "react";
import { Link } from "@/lib/i18n/routing";
import { MomentCard } from "@/components/moments";
import { useMomentCommentCounts } from "@/lib/hooks/use-comment-counts";
import type { MomentWithEvent } from "@/lib/types";

interface MomentsSpotlightProps {
  title: string;
  viewAllLabel: string;
  moments: MomentWithEvent[];
}

export function MomentsSpotlight({ title, viewAllLabel, moments }: MomentsSpotlightProps) {
  // Fetch comment counts for all spotlight moments
  const momentIds = useMemo(() => moments.map(m => m.id), [moments]);
  const { counts: commentCounts } = useMomentCommentCounts(momentIds);

  if (moments.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link href="/moments" className="text-sm text-muted-foreground hover:text-foreground">
          {viewAllLabel} →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {moments.map((moment) => (
          <div key={moment.id} className="w-44 flex-shrink-0">
            <MomentCard moment={moment} commentCount={commentCounts.get(moment.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}
