"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type DatePreset = "week" | "month" | "custom";

interface DatePresetsProps {
    onPresetChange?: (preset: DatePreset) => void;
    className?: string;
}

export function DatePresets({ onPresetChange, className }: DatePresetsProps) {
    const [selected, setSelected] = useState<DatePreset>("week");

    const presets: { value: DatePreset; label: string }[] = [
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
        { value: "custom", label: "Custom" },
    ];

    const handleSelect = (preset: DatePreset) => {
        setSelected(preset);
        onPresetChange?.(preset);
    };

    return (
        <div className={cn("flex gap-2", className)}>
            {presets.map((preset) => (
                <button
                    key={preset.value}
                    onClick={() => handleSelect(preset.value)}
                    className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        selected === preset.value
                            ? "bg-green-600 text-white shadow-sm"
                            : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
                    )}
                >
                    {preset.label}
                </button>
            ))}
        </div>
    );
}
