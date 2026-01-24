"use client";

import { useState, useEffect, useRef } from "react";
import { ResponsiveContainer } from "recharts";

interface SafeResponsiveContainerProps {
  children: React.ReactNode;
}

/**
 * Wrapper around Recharts ResponsiveContainer that prevents the
 * "width(-1) and height(-1)" console warnings by only rendering
 * when the container has valid positive dimensions.
 */
export function SafeResponsiveContainer({ children }: SafeResponsiveContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if dimensions are valid
    const checkDimensions = () => {
      const { width, height } = container.getBoundingClientRect();
      setIsReady(width > 0 && height > 0);
    };

    // Initial check
    checkDimensions();

    // Use ResizeObserver to detect when container becomes visible
    const observer = new ResizeObserver(checkDimensions);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      {isReady ? (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
