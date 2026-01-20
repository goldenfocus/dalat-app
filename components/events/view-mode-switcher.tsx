"use client";

import { List, LayoutGrid, Map, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hapticButtonPress } from "@/lib/utils/haptics";
import type { EventFilters } from "@/lib/types";

interface ViewModeSwitcherProps {
    currentView: EventFilters['viewMode'];
    onViewChange: (view: EventFilters['viewMode']) => void;
    className?: string;
}

const VIEW_MODES = [
    { id: 'list' as const, label: 'List', icon: List },
    { id: 'grid' as const, label: 'Grid', icon: LayoutGrid },
    { id: 'map' as const, label: 'Map', icon: Map },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
];

export function ViewModeSwitcher({ currentView, onViewChange, className = "" }: ViewModeSwitcherProps) {
    const handleViewChange = (view: EventFilters['viewMode']) => {
        hapticButtonPress();
        onViewChange(view);
    };

    return (
        <div role="toolbar" aria-label="View mode selector" className={className}>
            {/* Desktop: Horizontal toolbar */}
            <div className="hidden sm:flex items-center gap-2">
                {VIEW_MODES.map(({ id, label, icon: Icon }) => (
                    <Button
                        key={id}
                        onClick={() => handleViewChange(id)}
                        variant={currentView === id ? "default" : "outline"}
                        size="sm"
                        className={`
                            px-3 py-2 transition-all
                            ${currentView === id
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "border-gray-300 hover:bg-gray-50 text-gray-700"
                            }
                        `}
                        aria-pressed={currentView === id}
                        aria-label={`Switch to ${label} view`}
                    >
                        <Icon className="w-4 h-4 mr-2" aria-hidden="true" />
                        {label}
                    </Button>
                ))}
            </div>

            {/* Mobile: Icon-only buttons */}
            <div className="flex sm:hidden items-center gap-1">
                {VIEW_MODES.map(({ id, label, icon: Icon }) => (
                    <Button
                        key={id}
                        onClick={() => handleViewChange(id)}
                        variant={currentView === id ? "default" : "outline"}
                        size="sm"
                        className={`
                            p-2 transition-all
                            ${currentView === id
                                ? "bg-green-600 hover:bg-green-700 text-white active:scale-95"
                                : "border-gray-300 hover:bg-gray-50 text-gray-700 active:scale-95"
                            }
                        `}
                        aria-label={`Switch to ${label} view`}
                        aria-pressed={currentView === id}
                        title={label}
                    >
                        <Icon className="w-5 h-5" aria-hidden="true" />
                    </Button>
                ))}
            </div>
        </div>
    );
}
