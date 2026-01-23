"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { INSPIRING_FOOTERS } from "@/lib/notifications/inspiring-footers";

interface RotatingPhraseProps {
  interval?: number; // milliseconds, default 6000
  className?: string;
}

function getRandomPhrase(excludeIndex?: number): { phrase: string; index: number } {
  let index: number;
  do {
    index = Math.floor(Math.random() * INSPIRING_FOOTERS.length);
  } while (index === excludeIndex && INSPIRING_FOOTERS.length > 1);
  return { phrase: INSPIRING_FOOTERS[index], index };
}

export function RotatingPhrase({ interval = 6000, className }: RotatingPhraseProps) {
  const [currentPhrase, setCurrentPhrase] = useState(() => getRandomPhrase());
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      // Fade out
      setIsVisible(false);

      // After fade out, change phrase and fade in
      setTimeout(() => {
        setCurrentPhrase((prev) => getRandomPhrase(prev.index));
        setIsVisible(true);
      }, 300); // Match the CSS transition duration
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return (
    <p
      className={cn(
        "transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0",
        className
      )}
    >
      {currentPhrase.phrase}
    </p>
  );
}
