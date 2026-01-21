"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
    value: string;
    label: string;
    icon?: string;
}

interface MultiSelectProps {
    options: MultiSelectOption[];
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    maxSelections?: number;
    className?: string;
    disabled?: boolean;
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    maxSelections,
    className,
    disabled = false,
}: MultiSelectProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Close on click outside
    React.useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen]);

    const handleToggle = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((v) => v !== value));
        } else if (!maxSelections || selected.length < maxSelections) {
            onChange([...selected, value]);
        }
    };

    const handleRemove = (value: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selected.filter((v) => v !== value));
    };

    const selectedOptions = options.filter((opt) => selected.includes(opt.value));
    const isMaxSelected = maxSelections ? selected.length >= maxSelections : false;

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "flex min-h-[44px] w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm transition-all",
                    "hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                    isOpen && "border-green-500 ring-2 ring-green-500 ring-offset-2",
                    disabled && "cursor-not-allowed opacity-50",
                    !disabled && "cursor-pointer"
                )}
            >
                <div className="flex flex-1 flex-wrap gap-1.5 pr-2">
                    {selectedOptions.length > 0 ? (
                        selectedOptions.map((opt) => (
                            <span
                                key={opt.value}
                                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800"
                            >
                                {opt.icon && <span>{opt.icon}</span>}
                                <span className="truncate max-w-[100px]">{opt.label}</span>
                                <button
                                    type="button"
                                    onClick={(e) => handleRemove(opt.value, e)}
                                    className="ml-0.5 rounded-full p-0.5 hover:bg-green-200 active:scale-95 transition-all"
                                    disabled={disabled}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                </div>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-2 w-full rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
                    {maxSelections && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
                            {selected.length}/{maxSelections} selected
                        </div>
                    )}
                    <div className="max-h-[240px] overflow-y-auto">
                        {options.map((option) => {
                            const isSelected = selected.includes(option.value);
                            const isDisabled = !isSelected && isMaxSelected;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => !isDisabled && handleToggle(option.value)}
                                    disabled={isDisabled}
                                    className={cn(
                                        "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors",
                                        "hover:bg-accent active:scale-[0.98]",
                                        isSelected && "bg-green-50",
                                        isDisabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                                            isSelected
                                                ? "border-green-600 bg-green-600 text-white"
                                                : "border-gray-300"
                                        )}
                                    >
                                        {isSelected && <Check className="h-3.5 w-3.5" />}
                                    </div>
                                    {option.icon && (
                                        <span className="text-base">{option.icon}</span>
                                    )}
                                    <span className={cn("font-medium", isSelected && "text-green-800")}>
                                        {option.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
