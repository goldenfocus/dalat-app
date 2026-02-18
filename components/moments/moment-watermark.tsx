import { cn } from "@/lib/utils";

interface MomentWatermarkProps {
  displayName?: string | null;
  className?: string;
}

/**
 * Subtle watermark overlay for moment images.
 * Shows uploader's display name (bottom-left) and dalat.app branding (bottom-right).
 * Low opacity + drop shadow ensures readability on any photo without being distracting.
 *
 * Must be placed inside a `relative` container that wraps the image.
 */
export function MomentWatermark({ displayName, className }: MomentWatermarkProps) {
  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 py-2 pointer-events-none select-none z-10",
        className
      )}
    >
      {displayName ? (
        <span className="text-white/30 text-[11px] font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {displayName}
        </span>
      ) : (
        <span />
      )}
      <span className="text-white/30 text-[11px] font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        dalat.app
      </span>
    </div>
  );
}
