"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface EventCategory {
    id: string;
    name_en: string;
    name_vi?: string;
    icon?: string;
    color?: string;
}

// Fallback categories if database fetch fails
const FALLBACK_CATEGORIES: EventCategory[] = [
    { id: "music", name_en: "Music", icon: "🎵", color: "#8B5CF6" },
    { id: "yoga", name_en: "Yoga & Wellness", icon: "🧘", color: "#10B981" },
    { id: "food", name_en: "Food & Dining", icon: "🍜", color: "#F59E0B" },
    { id: "art", name_en: "Art & Culture", icon: "🎨", color: "#EC4899" },
    { id: "meditation", name_en: "Meditation", icon: "🧘‍♀️", color: "#6366F1" },
    { id: "festival", name_en: "Festivals", icon: "🎉", color: "#EF4444" },
    { id: "nature", name_en: "Nature & Outdoors", icon: "🌿", color: "#059669" },
    { id: "community", name_en: "Community", icon: "👥", color: "#3B82F6" },
    { id: "education", name_en: "Education", icon: "📚", color: "#0EA5E9" },
    { id: "sports", name_en: "Sports & Fitness", icon: "⚽", color: "#F97316" },
    { id: "nightlife", name_en: "Nightlife", icon: "🌙", color: "#A855F7" },
    { id: "coffee", name_en: "Coffee & Tea", icon: "☕", color: "#92400E" },
];

interface CategorySelectorProps {
    selectedCategories: string[];
    onChange: (categories: string[]) => void;
    label?: string;
    maxSelections?: number;
}

export function CategorySelector({
    selectedCategories,
    onChange,
    label = "Event Categories",
    maxSelections = 3,
}: CategorySelectorProps) {
    const [categories, setCategories] = useState<EventCategory[]>(FALLBACK_CATEGORIES);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCategories() {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("event_categories")
                .select("id, name_en, name_vi, icon, color")
                .eq("is_active", true)
                .order("sort_order");

            if (!error && data && data.length > 0) {
                setCategories(data);
            }
            setLoading(false);
        }

        fetchCategories();
    }, []);

    const handleToggle = (categoryId: string) => {
        if (selectedCategories.includes(categoryId)) {
            onChange(selectedCategories.filter((id) => id !== categoryId));
        } else if (selectedCategories.length < maxSelections) {
            onChange([...selectedCategories, categoryId]);
        }
    };

    const isMaxSelected = selectedCategories.length >= maxSelections;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{label}</Label>
                <span className="text-xs text-muted-foreground">
                    {selectedCategories.length}/{maxSelections} selected
                </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.map((category) => {
                    const isSelected = selectedCategories.includes(category.id);
                    const isDisabled = !isSelected && isMaxSelected;

                    return (
                        <label
                            key={category.id}
                            className={cn(
                                "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all",
                                isSelected
                                    ? "border-green-500 bg-green-50"
                                    : "border-gray-200 hover:border-gray-300",
                                isDisabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <Checkbox
                                id={`category-${category.id}`}
                                checked={isSelected}
                                disabled={isDisabled}
                                onCheckedChange={() => handleToggle(category.id)}
                                className="border-gray-300 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                            />
                            <span className="text-base">{category.icon}</span>
                            <span className="text-sm font-medium truncate">
                                {category.name_en}
                            </span>
                        </label>
                    );
                })}
            </div>
            {loading && (
                <p className="text-xs text-muted-foreground">Loading categories...</p>
            )}
        </div>
    );
}

// Helper function to save category assignments
export async function saveCategoryAssignments(
    eventId: string,
    categoryIds: string[]
): Promise<{ error: string | null }> {
    if (categoryIds.length === 0) {
        return { error: null };
    }

    const supabase = createClient();

    // First, delete existing assignments
    await supabase
        .from("event_category_assignments")
        .delete()
        .eq("event_id", eventId);

    // Then insert new assignments
    const assignments = categoryIds.map((categoryId) => ({
        event_id: eventId,
        category_id: categoryId,
    }));

    const { error } = await supabase
        .from("event_category_assignments")
        .insert(assignments);

    if (error) {
        console.error("Failed to save category assignments:", error);
        return { error: error.message };
    }

    return { error: null };
}

// Helper function to fetch existing category assignments for an event
export async function fetchEventCategories(eventId: string): Promise<string[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("event_category_assignments")
        .select("category_id")
        .eq("event_id", eventId);

    if (error || !data) {
        return [];
    }

    return data.map((row) => row.category_id);
}
