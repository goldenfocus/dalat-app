"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Linkify } from "@/lib/linkify";

interface ExpandableTextProps {
  text: string;
  maxLines?: number;
  className?: string;
}

export function ExpandableText({
  text,
  maxLines = 4,
  className = "",
}: ExpandableTextProps) {
  const t = useTranslations("events");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  // Check if text is actually truncated (needs "Read more" button)
  useEffect(() => {
    const element = textRef.current;
    if (element) {
      // Check if content overflows when clamped
      const isOverflowing = element.scrollHeight > element.clientHeight;
      setIsTruncated(isOverflowing);
    }
  }, [text, maxLines]);

  return (
    <div className={className}>
      <div
        ref={textRef}
        className="whitespace-pre-wrap text-muted-foreground"
        style={
          !isExpanded
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        <Linkify text={text} />
      </div>
      {isTruncated && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="-ml-3 mt-1 min-h-11 rounded-lg px-3 py-2 text-sm text-primary hover:underline active:scale-95 transition-all"
        >
          {isExpanded ? t("showLess") : t("readMore")}
        </button>
      )}
    </div>
  );
}
