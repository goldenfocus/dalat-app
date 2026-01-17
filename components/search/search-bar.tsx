"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
    onFilterClick?: () => void;
    className?: string;
}

export function SearchBar({ onFilterClick, className }: SearchBarProps) {
    return (
        <div className={cn("relative", className)}>
            <div className="relative flex items-center">
                <Search className="absolute left-3 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search events, places..."
                    className="w-full h-12 pl-10 pr-12 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                />
                <button
                    onClick={onFilterClick}
                    className="absolute right-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Open filters"
                >
                    <SlidersHorizontal className="w-5 h-5 text-gray-600" />
                </button>
            </div>
        </div>
    );
}
