"use client";

import { useState, useEffect } from "react";
import { X, Search, Calendar, DollarSign, MapPin, Loader2, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useGeolocation } from "@/lib/hooks/use-geolocation";
import { copyToClipboard, toastSuccess, toastError } from "@/lib/utils/toast";
import { hapticToggle, hapticButtonPress } from "@/lib/utils/haptics";
import type { EventFilters } from "@/lib/types";

interface FilterPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyFilters: (filters: Partial<EventFilters>) => void;
    initialFilters?: Partial<EventFilters>;
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
    { id: "nightlife", label: "Nightlife", icon: "🌙" },
    { id: "coffee", label: "Coffee & Tea", icon: "☕" },
];

export function FilterPanel({ isOpen, onClose, onApplyFilters, initialFilters }: FilterPanelProps) {
    const [selectedCategories, setSelectedCategories] = useState<string[]>(initialFilters?.categories || []);
    const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">(initialFilters?.priceFilter || "all");
    const [searchQuery, setSearchQuery] = useState(initialFilters?.searchQuery || "");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [radiusKm, setRadiusKm] = useState<string>(initialFilters?.radiusKm?.toString() || "all");
    const [copied, setCopied] = useState(false);

    const { location, loading, error, requestLocation, hasLocation, permissionState } = useGeolocation();

    // Show toast notifications for geolocation state changes
    const handleRequestLocation = async () => {
        hapticButtonPress();
        requestLocation();

        // Wait a bit to check if permission was granted
        setTimeout(() => {
            if (permissionState === 'granted' && hasLocation) {
                toastSuccess("Location enabled", "Now showing events near you");
            } else if (permissionState === 'denied') {
                toastError("Location permission denied", "Please enable location in your browser settings");
            } else if (error) {
                toastError("Location error", error);
            }
        }, 1000);
    };

    const handleCategoryToggle = (categoryId: string) => {
        hapticToggle();
        setSelectedCategories((prev) =>
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    const handleApply = () => {
        const filters: Partial<EventFilters> = {
            categories: selectedCategories,
            priceFilter,
            searchQuery,
            dateRange:
                startDate && endDate
                    ? { start: new Date(startDate), end: new Date(endDate) }
                    : undefined,
            userLocation: location ? { lat: location.lat, lng: location.lng } : undefined,
            radiusKm: radiusKm !== "all" ? parseFloat(radiusKm) : undefined,
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
        setRadiusKm("all");
    };

    const handleShare = async () => {
        hapticButtonPress();
        const success = await copyToClipboard(window.location.href, "Link copied! Share it with friends.");
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Handle Escape key to close panel
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Focus management for accessibility
    useEffect(() => {
        if (isOpen) {
            // Focus the close button when panel opens
            const closeButton = document.querySelector('[aria-label="Close filters"]') as HTMLElement;
            closeButton?.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-[1000]"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Filter Panel */}
            <div
                className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-[1001] overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="filter-panel-title"
            >
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 id="filter-panel-title" className="text-xl font-bold">Filters</h2>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onClose}
                            className="hover:bg-gray-100"
                            aria-label="Close filters"
                        >
                            <X className="w-5 h-5" aria-hidden="true" />
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
                    <div className="mb-6">
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

                    {/* Distance Filter */}
                    <div className="mb-8">
                        <Label className="text-sm font-semibold mb-3 block flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Distance
                        </Label>

                        {!hasLocation && (
                            <div className="mb-3">
                                <Button
                                    type="button"
                                    onClick={handleRequestLocation}
                                    disabled={loading}
                                    variant="outline"
                                    className="w-full border-green-600 text-green-600 hover:bg-green-50 px-3 py-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Getting location...
                                        </>
                                    ) : (
                                        <>
                                            <MapPin className="w-4 h-4 mr-2" />
                                            Enable Location
                                        </>
                                    )}
                                </Button>
                                {error && (
                                    <p className="text-xs text-red-600 mt-2">{error}</p>
                                )}
                                {permissionState === 'denied' && (
                                    <p className="text-xs text-gray-600 mt-2">
                                        Location permission denied. Enable in browser settings to use distance filter.
                                    </p>
                                )}
                            </div>
                        )}

                        {hasLocation && (
                            <div className="space-y-2">
                                <RadioGroup value={radiusKm} onValueChange={setRadiusKm}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="1" id="radius-1" className="border-gray-300 text-green-600" />
                                        <Label htmlFor="radius-1" className="text-sm font-medium cursor-pointer">
                                            Within 1 km
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="5" id="radius-5" className="border-gray-300 text-green-600" />
                                        <Label htmlFor="radius-5" className="text-sm font-medium cursor-pointer">
                                            Within 5 km
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="10" id="radius-10" className="border-gray-300 text-green-600" />
                                        <Label htmlFor="radius-10" className="text-sm font-medium cursor-pointer">
                                            Within 10 km
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="25" id="radius-25" className="border-gray-300 text-green-600" />
                                        <Label htmlFor="radius-25" className="text-sm font-medium cursor-pointer">
                                            Within 25 km
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="all" id="radius-all" className="border-gray-300 text-green-600" />
                                        <Label htmlFor="radius-all" className="text-sm font-medium cursor-pointer">
                                            All Events
                                        </Label>
                                    </div>
                                </RadioGroup>
                                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    Location enabled ({location?.accuracy ? `±${Math.round(location.accuracy)}m` : 'Active'})
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3">
                        <Button
                            onClick={handleApply}
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                            Apply Filters
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleClear}
                                variant="outline"
                                className="flex-1 border-gray-300 hover:bg-gray-50"
                            >
                                Clear All
                            </Button>
                            <Button
                                onClick={handleShare}
                                variant="outline"
                                className="flex-1 border-green-600 text-green-600 hover:bg-green-50"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-4 h-4 mr-2" />
                                        Share
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Active Filters Summary */}
                    {(selectedCategories.length > 0 || priceFilter !== "all" || searchQuery || startDate || endDate || (hasLocation && radiusKm !== "all")) && (
                        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs font-semibold text-gray-600 mb-2">Active Filters:</p>
                            <div className="space-y-1 text-xs text-gray-700">
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
                                {hasLocation && radiusKm !== "all" && (
                                    <p>• Within {radiusKm} km of your location</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
