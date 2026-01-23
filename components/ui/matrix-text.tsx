"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// Matrix-style characters for scrambling
const MATRIX_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789@#$%&*";

interface MatrixTextProps {
  text: string;
  isDecoding: boolean;
  className?: string;
  onDecodeComplete?: () => void;
  decodeDuration?: number; // ms, default 500
}

export function MatrixText({
  text,
  isDecoding,
  className,
  onDecodeComplete,
  decodeDuration = 500,
}: MatrixTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isComplete, setIsComplete] = useState(!isDecoding);

  const getRandomChar = useCallback(() => {
    return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
  }, []);

  useEffect(() => {
    if (!isDecoding) {
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    setIsComplete(false);
    const textLength = text.length;
    const intervalTime = decodeDuration / textLength;
    let currentIndex = 0;

    // Start with all scrambled
    setDisplayText(
      Array(textLength)
        .fill(0)
        .map(() => getRandomChar())
        .join("")
    );

    // Scramble effect - randomize non-revealed characters
    const scrambleInterval = setInterval(() => {
      setDisplayText((prev) => {
        const chars = prev.split("");
        for (let i = currentIndex; i < textLength; i++) {
          chars[i] = getRandomChar();
        }
        return chars.join("");
      });
    }, 50);

    // Reveal characters one by one
    const revealInterval = setInterval(() => {
      if (currentIndex >= textLength) {
        clearInterval(revealInterval);
        clearInterval(scrambleInterval);
        setDisplayText(text);
        setIsComplete(true);
        onDecodeComplete?.();
        return;
      }

      setDisplayText((prev) => {
        const chars = prev.split("");
        chars[currentIndex] = text[currentIndex];
        return chars.join("");
      });
      currentIndex++;
    }, intervalTime);

    return () => {
      clearInterval(scrambleInterval);
      clearInterval(revealInterval);
    };
  }, [isDecoding, text, decodeDuration, getRandomChar, onDecodeComplete]);

  return (
    <span
      className={cn(
        "font-mono transition-colors duration-300",
        isDecoding && !isComplete ? "text-[#00ff41]" : "",
        className
      )}
    >
      {displayText}
    </span>
  );
}
