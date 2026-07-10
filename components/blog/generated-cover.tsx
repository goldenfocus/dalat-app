import { cn } from "@/lib/utils";
import { coverPalette } from "@/lib/blog/cover-palette";

interface GeneratedCoverProps {
  title: string;
  seed: string;
  categoryLabel?: string;
  className?: string;
}

/**
 * Designed branded cover for posts without a real cover image.
 * Deterministic per seed (post slug): same post always gets the same
 * gradient + glyph, so it reads as intentional design, not a missing image.
 */
export function GeneratedCover({
  title,
  seed,
  categoryLabel,
  className,
}: GeneratedCoverProps) {
  const palette = coverPalette(seed);

  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden flex flex-col justify-end p-5 sm:p-6",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
      }}
    >
      {/* Vignette + soft highlight overlay for depth */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 18% 0%, rgba(255,255,255,0.09), transparent 55%), radial-gradient(circle at 100% 100%, rgba(0,0,0,0.38), transparent 62%)",
        }}
      />

      {/* Large translucent glyph in the corner */}
      <span
        aria-hidden
        className="absolute -top-3 right-3 text-[4.5rem] sm:text-[5.5rem] leading-none opacity-25 select-none"
      >
        {palette.glyph}
      </span>

      <div className="relative flex flex-col items-start gap-2">
        {categoryLabel && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/90"
            style={{
              backgroundColor: "rgba(255,255,255,0.14)",
              boxShadow: `inset 0 0 0 1px ${palette.accent}`,
            }}
          >
            {categoryLabel}
          </span>
        )}
        <p
          className="text-balance text-lg sm:text-xl font-bold leading-snug text-white line-clamp-4"
          style={{ textShadow: "0 1px 12px rgba(0,0,0,0.35)" }}
        >
          {title}
        </p>
      </div>
    </div>
  );
}
