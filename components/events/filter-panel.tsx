"use client";

import { useState } from "react";
import { X, Search, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface FilterPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyFilters: (filters: EventFilters) => void;
}

export interface EventFilters {
    categories: string[];
    dateRange?: { start: Date; end: Date };
    priceFilter: "all" | "free" | "paid";
    searchQuery: string;
}

const CATEGORIES = [
    { id: "music", label: "Music", icon: "🎵" },
    { id: "yoga", label: "Yoga & Wellness", icon: "🧘" },
    { id: "food", label: "Food & Dining", icon: "🍜" },
    { id: "art", label: "Art & Culture", icon: "🎨" },
    { id: "meditation", label: "Meditation", icon: "🧘‍♀️" },
    { id: "festival", label: "Festivals", icon: "🎉" },
    { id: "nature", label: "Nature & Outdoors", icon: "🌿" },
    { id: "community", label: "Community", icon: "👥" },
    { id: "education", label: "Education", icon: "📚" },
    { id: "sports", label: "Sports & Fitness", icon: "⚽" },
];

export function FilterPanel({ isOpen, onClose, onApplyFilters }: FilterPanelProps) {
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const handleCategoryToggle = (categoryId: string) => {
        setSelectedCategories((prev) =>
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    const handleApply = () => {
        const filters: EventFilters = {
            categories: selectedCategories,
            priceFilter,
            searchQuery,
            dateRange:
                startDate && endDate
                    ? { start: new Date(startDate), end: new Date(endDate) }
                    : undefined,
        };
        onApplyFilters(filters);
        onClose();
    };

    const handleClear = () => {
        setSelectedCategories([]);
        setPriceFilter("all");
        setSearchQuery("");
        setStartDate("");
        setEndDate("");
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-[1000]"
                onClick={onClose}
            />

            {/* Filter Panel */}
            <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-background shadow-2xl z-[1001] overflow-y-auto border-l border-border">
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold">Filters</h2>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onClose}
                            className="hover:bg-gray-100"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Search */}
                    <div className="mb-6">
                        <Label htmlFor="search" className="text-sm font-semibold mb-2 block">
                            Search Events
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                id="search"
                                type="text"
                                placeholder="Search by name, location..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 border-gray-300 focus:border-green-500 focus:ring-green-500"
                            />
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="mb-6">
                        <Label className="text-sm font-semibold mb-3 block">Categories</Label>
                        <div className="space-y-3">
                            {CATEGORIES.map((category) => (
                                <div key={category.id} className="flex items-center space-x-3">
                                    <Checkbox
                                        id={category.id}
                                        checked={selectedCategories.includes(category.id)}
                                        onCheckedChange={() => handleCategoryToggle(category.id)}
                                        className="border-gray-300 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                    />
                                    <label
                                        htmlFor={category.id}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                                    >
                                        <span>{category.icon}</span>
                                        <span>{category.label}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Date Range */}
                    <div className="mb-6">
                        <Label className="text-sm font-semibold mb-3 block flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Date Range
                        </Label>
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="start-date" className="text-xs text-gray-600 mb-1 block">
                                    From
                                </Label>
                                <Input
                                    id="start-date"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="border-gray-300 focus:border-green-500 focus:ring-green-500"
                                />
                            </div>
                            <div>
                                <Label htmlFor="end-date" className="text-xs text-gray-600 mb-1 block">
                                    To
                                </Label>
                                <Input
                                    id="end-date"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="border-gray-300 focus:border-green-500 focus:ring-green-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Price Filter */}
                    <div className="mb-8">
                        <Label className="text-sm font-semibold mb-3 block flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Price
                        </Label>
                        <RadioGroup value={priceFilter} onValueChange={(value: any) => setPriceFilter(value)}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="all" id="all" className="border-gray-300 text-green-600" />
                                <Label htmlFor="all" className="text-sm font-medium cursor-pointer">
                                    All Events
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="free" id="free" className="border-gray-300 text-green-600" />
                                <Label htmlFor="free" className="text-sm font-medium cursor-pointer">
                                    Free Only
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="paid" id="paid" className="border-gray-300 text-green-600" />
                                <Label htmlFor="paid" className="text-sm font-medium cursor-pointer">
                                    Paid Only
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3">
                        <Button
                            onClick={handleApply}
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                            Apply Filters
                        </Button>
                        <Button
                            onClick={handleClear}
                            variant="outline"
                            className="w-full border-gray-300 hover:bg-gray-50"
                        >
                            Clear All
                        </Button>
                    </div>

                    {/* Active Filters Summary */}
                    {(selectedCategories.length > 0 || priceFilter !== "all" || searchQuery || startDate || endDate) && (
                        <div className="mt-6 p-4 bg-muted rounded-lg border border-border">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Active Filters:</p>
                            <div className="space-y-1 text-xs text-muted-foreground">
                                {selectedCategories.length > 0 && (
                                    <p>• {selectedCategories.length} categories selected</p>
                                )}
                                {priceFilter !== "all" && (
                                    <p>• {priceFilter === "free" ? "Free events only" : "Paid events only"}</p>
                                )}
                                {searchQuery && <p>• Search: "{searchQuery}"</p>}
                                {startDate && endDate && (
                                    <p>• Date: {startDate} to {endDate}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
