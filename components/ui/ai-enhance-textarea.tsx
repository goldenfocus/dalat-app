"use client";

import * as React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EnhancePopover } from "@/components/ui/enhance-popover";
import { cn } from "@/lib/utils";

interface AIEnhanceTextareaProps
  extends Omit<React.ComponentProps<"textarea">, "value" | "onChange"> {
  /** Context hint for the AI (e.g., "an event description", "a bio") */
  context?: string;
  /** Controlled mode - current value */
  value?: string;
  /** Controlled mode - change handler */
  onChange?: (value: string) => void;
  /** Uncontrolled mode - initial value */
  defaultValue?: string;
  /** Hide the AI enhance button */
  hideEnhance?: boolean;
}

const AIEnhanceTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AIEnhanceTextareaProps
>(
  (
    {
      className,
      context,
      value: controlledValue,
      onChange: controlledOnChange,
      defaultValue,
      hideEnhance = false,
      ...props
    },
    ref
  ) => {
    const [isEnhancing, setIsEnhancing] = React.useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [internalValue, setInternalValue] = React.useState(
      defaultValue ?? ""
    );
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    // Support both controlled and uncontrolled modes
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (isControlled) {
        controlledOnChange?.(newValue);
      } else {
        setInternalValue(newValue);
      }
    };

    const handleEnhance = async (direction?: string) => {
      if (!value.trim() || isEnhancing) return;

      setIsEnhancing(true);
      try {
        const response = await fetch("/api/enhance-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value, context, direction }),
        });

        if (!response.ok) {
          throw new Error("Enhancement failed");
        }

        const data = await response.json();
        if (data.enhanced) {
          if (isControlled) {
            controlledOnChange?.(data.enhanced);
          } else {
            setInternalValue(data.enhanced);
          }
        }
      } catch (error) {
        console.error("Failed to enhance text:", error);
      } finally {
        setIsEnhancing(false);
      }
    };

    const showButton = !hideEnhance && value.trim().length > 0;

    return (
      <div className="relative">
        <Textarea
          ref={ref}
          className={cn("pr-10", className)}
          value={value}
          onChange={handleChange}
          {...props}
        />
        {showButton && (
          <>
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              disabled={isEnhancing}
              className={cn(
                "absolute bottom-2 right-2 p-1.5 rounded-md transition-all",
                "text-muted-foreground hover:text-foreground hover:bg-muted",
                "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                isPopoverOpen && "text-foreground bg-accent",
                isEnhancing && "animate-pulse"
              )}
              title="Enhance with AI"
            >
              {isEnhancing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </button>
            <EnhancePopover
              isOpen={isPopoverOpen}
              onClose={() => setIsPopoverOpen(false)}
              onEnhance={handleEnhance}
              isEnhancing={isEnhancing}
              triggerRef={buttonRef}
            />
          </>
        )}
      </div>
    );
  }
);
AIEnhanceTextarea.displayName = "AIEnhanceTextarea";

export { AIEnhanceTextarea };
