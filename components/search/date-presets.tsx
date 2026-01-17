"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DatePickerModal } from "@/components/ui/date-picker-modal";

type DatePreset = "week" | "month" | "custom";

interface DatePresetsProps {
    onPresetChange?: (preset: DatePreset) => void;
    onDateSelect?: (range: { start: Date; end: Date }) => void;
    className?: string;
}

export function DatePresets({ onPresetChange, onDateSelect, className }: DatePresetsProps) {
    const [selected, setSelected] = useState<DatePreset>("week");
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

    const presets: { value: DatePreset; label: string }[] = [
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
        { value: "custom", label: "Custom" },
    ];

    const handleSelect = (preset: DatePreset) => {
        setSelected(preset);
        onPresetChange?.(preset);

        const today = new Date();
        const start = new Date(today);
        let end = new Date(today);

        if (preset === "week") {
            // End of week (next 7 days)
            end.setDate(today.getDate() + 7);
            onDateSelect?.({ start, end });
        } else if (preset === "month") {
            // End of current month
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            onDateSelect?.({ start, end });
        } else if (preset === "custom") {
            setIsDatePickerOpen(true);
        }
    };

    const handleCustomDateApply = (start: Date, end: Date) => {
        setIsDatePickerOpen(false);
        onDateSelect?.({ start, end });
    };

    return (
        <>
            <div className={cn("flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0", className)}>
                {presets.map((preset) => (
                    <button
                        key={preset.value}
                        onClick={() => handleSelect(preset.value)}
                        className={cn(
                            "px-4 py-2 rounded-full text-sm font-medium transition-all",
                            selected === preset.value
                                ? "bg-[#16a34a] text-white shadow-sm"
                                : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
                        )}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <DatePickerModal
                isOpen={isDatePickerOpen}
                onClose={() => {
                    setIsDatePickerOpen(false);
                    // Revert to week if cancelled? Or keep custom selected but no range?
                    // Let's keep it simple for now.
                }}
                onApply={handleCustomDateApply}
            />
        </>
    );
}
