"use client";

import { useState, useCallback, useRef, forwardRef, type MouseEvent, type TouchEvent } from "react";
import { cn } from "@/lib/utils";
import { triggerHaptic, type HapticStyle } from "@/lib/haptics";

interface RippleData {
  x: number;
  y: number;
  id: number;
}

interface TouchableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  haptic?: HapticStyle;
  ripple?: boolean;
  rippleColor?: string;
  disabled?: boolean;
  asChild?: boolean;
}

/**
 * Touchable wrapper that provides mobile-friendly press feedback:
 * - Haptic vibration
 * - Ripple effect animation
 * - Scale + opacity feedback via CSS
 *
 * Use this to wrap any interactive element that needs better mobile UX.
 */
export const Touchable = forwardRef<HTMLDivElement, TouchableProps>(
  (
    {
      children,
      className,
      haptic = "selection",
      ripple = true,
      rippleColor = "currentColor",
      disabled = false,
      onClick,
      ...props
    },
    ref
  ) => {
    const [ripples, setRipples] = useState<RippleData[]>([]);
    const [isPressed, setIsPressed] = useState(false);
    const rippleIdRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const createRipple = useCallback(
      (clientX: number, clientY: number) => {
        if (!ripple || disabled) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const id = rippleIdRef.current++;

        setRipples((prev) => [...prev, { x, y, id }]);

        // Remove ripple after animation
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id));
        }, 600);
      },
      [ripple, disabled]
    );

    const handlePressStart = useCallback(
      (clientX: number, clientY: number) => {
        if (disabled) return;
        setIsPressed(true);
        triggerHaptic(haptic);
        createRipple(clientX, clientY);
      },
      [haptic, disabled, createRipple]
    );

    const handlePressEnd = useCallback(() => {
      setIsPressed(false);
    }, []);

    const handleMouseDown = useCallback(
      (e: MouseEvent<HTMLDivElement>) => {
        handlePressStart(e.clientX, e.clientY);
      },
      [handlePressStart]
    );

    const handleTouchStart = useCallback(
      (e: TouchEvent<HTMLDivElement>) => {
        const touch = e.touches[0];
        if (touch) {
          handlePressStart(touch.clientX, touch.clientY);
        }
      },
      [handlePressStart]
    );

    const handleClick = useCallback(
      (e: MouseEvent<HTMLDivElement>) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      },
      [disabled, onClick]
    );

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={cn(
          "relative overflow-hidden touch-manipulation select-none",
          "transition-transform duration-150 ease-out",
          isPressed && "scale-[0.97] opacity-90",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        onMouseDown={handleMouseDown}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressEnd}
        onClick={handleClick}
        {...props}
      >
        {children}
        {/* Ripple effects */}
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute rounded-full pointer-events-none animate-ripple"
            style={{
              left: ripple.x,
              top: ripple.y,
              transform: "translate(-50%, -50%)",
              backgroundColor: rippleColor,
              opacity: 0.3,
            }}
          />
        ))}
      </div>
    );
  }
);

Touchable.displayName = "Touchable";
