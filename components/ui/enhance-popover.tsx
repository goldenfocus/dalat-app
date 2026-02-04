"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCustomEnhanceChips } from "@/lib/hooks/use-custom-enhance-chips";

// Animation phrases that cycle during enhancement
const ANIMATION_PHRASES = [
  "Polishing your words",
  "Refining the prose",
  "Adding some sparkle",
  "Making it shine",
  "Crafting the perfect tone",
];

// Default enhancement directions with SPECIFIC, ACTIONABLE prompts
const DEFAULT_CHIPS = [
  {
    id: "fun",
    label: "More fun",
    direction:
      "Rewrite to be playful and conversational. Use shorter sentences, casual language, and inject personality. Add warmth and a touch of humor where it fits naturally.",
  },
  {
    id: "formal",
    label: "Formal",
    direction:
      "Rewrite in a polished, professional tone. Use precise vocabulary, complete sentences, and maintain a respectful, business-appropriate style. Remove casual expressions.",
  },
  {
    id: "shorter",
    label: "Shorter",
    direction:
      "Cut this to roughly half the length. Remove filler words, combine redundant points, and tighten every sentence. Keep only the essential message.",
  },
  {
    id: "detailed",
    label: "Detailed",
    direction:
      "Expand with vivid details and descriptive language. Add depth, context, and richness. Roughly double the length while keeping the core message clear.",
  },
];

interface EnhancePopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onEnhance: (direction?: string) => Promise<void>;
  isEnhancing: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function EnhancePopover({
  isOpen,
  onClose,
  onEnhance,
  isEnhancing,
  triggerRef,
}: EnhancePopoverProps) {
  const [selectedChipId, setSelectedChipId] = React.useState<string | null>(null);
  const [editablePrompt, setEditablePrompt] = React.useState("");
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const [showBelow, setShowBelow] = React.useState(false);
  const [animationPhrase, setAnimationPhrase] = React.useState(ANIMATION_PHRASES[0]);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { chips: customChips, addOrUpdateChip, removeChip } = useCustomEnhanceChips();

  // Cycle animation phrases while enhancing
  React.useEffect(() => {
    if (!isEnhancing) return;
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % ANIMATION_PHRASES.length;
      setAnimationPhrase(ANIMATION_PHRASES[index]);
    }, 1500);
    return () => clearInterval(interval);
  }, [isEnhancing]);

  // Calculate position relative to trigger
  React.useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 320;
      const popoverHeight = 400; // Approximate max height of popover
      const padding = 8;

      let left = rect.right - popoverWidth;

      if (left < padding) left = padding;
      if (left + popoverWidth > window.innerWidth - padding) {
        left = window.innerWidth - popoverWidth - padding;
      }

      // Check if there's enough space above the trigger
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;

      // If not enough space above (need ~400px), show below instead
      if (spaceAbove < popoverHeight && spaceBelow > spaceAbove) {
        // Position below the trigger
        setShowBelow(true);
        setPosition({ top: rect.bottom + padding, left });
      } else {
        // Position above the trigger (default)
        setShowBelow(false);
        setPosition({ top: rect.top - padding, left });
      }
    }
  }, [isOpen, triggerRef]);

  // Close on click outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, triggerRef]);

  // Reset state when closing
  React.useEffect(() => {
    if (!isOpen) {
      setSelectedChipId(null);
      setEditablePrompt("");
      setShowBelow(false);
    }
  }, [isOpen]);

  // When a chip is selected, populate the editable prompt
  const handleChipClick = (chipId: string, direction: string) => {
    if (selectedChipId === chipId) {
      // Deselect
      setSelectedChipId(null);
      setEditablePrompt("");
    } else {
      setSelectedChipId(chipId);
      setEditablePrompt(direction);
      // Focus the textarea after a brief delay for the UI to update
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleQuickEnhance = async () => {
    await onEnhance();
    onClose();
  };

  const handleDirectedEnhance = async () => {
    const prompt = editablePrompt.trim();
    if (!prompt) return;

    // Save custom prompts (if it's not a default chip's exact text)
    const isDefaultPrompt = DEFAULT_CHIPS.some((c) => c.direction === prompt);
    if (!isDefaultPrompt) {
      addOrUpdateChip(prompt);
    }

    await onEnhance(prompt);
    onClose();
  };

  const canApply = editablePrompt.trim().length > 0;

  if (!isOpen) return null;

  const content = (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        transform: showBelow ? "none" : "translateY(-100%)",
        maxHeight: showBelow ? `calc(100vh - ${position.top + 16}px)` : `${position.top - 16}px`,
        overflowY: "auto",
      }}
      className={cn(
        "z-50 w-[320px] rounded-xl p-3",
        "bg-popover backdrop-blur-sm",
        "border border-border",
        "shadow-lg",
        showBelow
          ? "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
          : "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
      )}
    >
      {/* Quick Enhance Option */}
      <button
        type="button"
        onClick={handleQuickEnhance}
        disabled={isEnhancing}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
          "text-left transition-colors",
          "hover:bg-accent active:bg-accent/80",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary">
          <Sparkles className="w-4 h-4 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Enhance</div>
          <div className="text-xs text-muted-foreground">Auto-improve your text</div>
        </div>
      </button>

      {/* Divider */}
      <div className="my-2 h-px bg-border" />

      {/* Directed Enhancement */}
      <div className="px-1">
        <div className="flex items-center gap-2 px-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Or guide the enhancement
          </span>
        </div>

        {/* Chips Grid */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {DEFAULT_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleChipClick(chip.id, chip.direction)}
              disabled={isEnhancing}
              className={cn(
                "px-2.5 py-1.5 text-xs rounded-full transition-colors",
                "border",
                selectedChipId === chip.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-secondary border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Custom chips from user */}
        {customChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {customChips.map((chip) => (
              <div key={chip.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleChipClick(chip.id, chip.direction)}
                  disabled={isEnhancing}
                  className={cn(
                    "px-2.5 py-1.5 text-xs rounded-full transition-colors",
                    "border pr-6",
                    selectedChipId === chip.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted/50 border-border/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {chip.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(chip.id);
                    if (selectedChipId === chip.id) {
                      setSelectedChipId(null);
                      setEditablePrompt("");
                    }
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-background/20 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Editable Prompt Preview */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={editablePrompt}
            onChange={(e) => {
              setEditablePrompt(e.target.value);
              // Clear chip selection when manually editing
              if (selectedChipId) {
                const selectedChip =
                  DEFAULT_CHIPS.find((c) => c.id === selectedChipId) ||
                  customChips.find((c) => c.id === selectedChipId);
                if (selectedChip && e.target.value !== selectedChip.direction) {
                  setSelectedChipId(null);
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey && canApply && !isEnhancing) {
                e.preventDefault();
                handleDirectedEnhance();
              }
            }}
            placeholder="Click a chip or describe what you want..."
            disabled={isEnhancing}
            rows={3}
            className={cn(
              "w-full px-3 py-2 text-sm rounded-lg resize-none",
              "bg-secondary/50 border border-border",
              "placeholder:text-muted-foreground/50",
              "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring",
              "disabled:opacity-50"
            )}
          />
          <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50">
            ⌘ Enter
          </div>
        </div>

        {/* Apply Button */}
        <button
          type="button"
          onClick={handleDirectedEnhance}
          disabled={!canApply || isEnhancing}
          className={cn(
            "w-full mt-2 px-3 py-2.5 text-sm font-medium rounded-lg",
            "transition-colors",
            canApply
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isEnhancing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="animate-pulse">{animationPhrase}...</span>
            </span>
          ) : (
            "Apply"
          )}
        </button>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(content, document.body);
}
