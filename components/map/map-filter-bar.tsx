"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  SlidersHorizontal,
  Calendar,
  CalendarRange,
  ChevronDown,
  X,
  Check,
  Music,
  UtensilsCrossed,
  Coffee,
  Flower2,
  Palette,
  Wrench,
  Users,
  PartyPopper,
  Mountain,
  Heart,
  Tent,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO, isAfter } from "date-fns";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { EventTag } from "@/lib/constants/event-tags";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

// Date range presets
export type DatePreset = "7days" | "14days" | "30days" | "all" | "custom";

const DATE_PRESETS: { value: DatePreset; labelKey: string; days: number | null }[] = [
  { value: "7days", labelKey: "presets.next7days", days: 7 },
  { value: "14days", labelKey: "presets.next2weeks", days: 14 },
  { value: "30days", labelKey: "presets.nextMonth", days: 30 },
  { value: "all", labelKey: "presets.allUpcoming", days: null },
];

// Featured tags with their icons
const FEATURED_TAGS: { tag: EventTag; icon: LucideIcon }[] = [
  { tag: "music", icon: Music },
  { tag: "food", icon: UtensilsCrossed },
  { tag: "coffee", icon: Coffee },
  { tag: "yoga", icon: Flower2 },
  { tag: "art", icon: Palette },
  { tag: "workshop", icon: Wrench },
  { tag: "meetup", icon: Users },
  { tag: "party", icon: PartyPopper },
  { tag: "hiking", icon: Mountain },
  { tag: "wellness", icon: Heart },
  { tag: "festival", icon: Tent },
];

interface MapFilterBarProps {
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartDateChange: (date: string) => void;
  onCustomEndDateChange: (date: string) => void;
  selectedTags: EventTag[];
  onTagsChange: (tags: EventTag[]) => void;
  categoryCounts: Record<EventTag, number>;
  eventCount: number;
}

export function MapFilterBar({
  datePreset,
  onDatePresetChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  selectedTags,
  onTagsChange,
  categoryCounts,
  eventCount,
}: MapFilterBarProps) {
  const t = useTranslations("mapPage");
  const tCat = useTranslations("categories");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [showCategoryDrawer, setShowCategoryDrawer] = useState(false);

  // Filter to only show categories with events
  const availableCategories = useMemo(() => {
    return FEATURED_TAGS.filter(({ tag }) => (categoryCounts[tag] || 0) > 0);
  }, [categoryCounts]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (datePreset !== "7days") count++;
    if (selectedTags.length > 0) count += selectedTags.length;
    return count;
  }, [datePreset, selectedTags]);

  // Get current date preset label
  const currentDateLabel = useMemo(() => {
    if (datePreset === "custom" && customStartDate && customEndDate) {
      const start = parseISO(customStartDate);
      const end = parseISO(customEndDate);
      return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
    }
    const preset = DATE_PRESETS.find((p) => p.value === datePreset);
    return preset ? t(preset.labelKey) : t("presets.allUpcoming");
  }, [datePreset, customStartDate, customEndDate, t]);

  // Handle custom date selection
  const handleApplyCustomDates = useCallback(() => {
    if (customStartDate && customEndDate) {
      const start = parseISO(customStartDate);
      const end = parseISO(customEndDate);
      if (isAfter(end, start) || format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
        onDatePresetChange("custom");
        setShowCustomDatePicker(false);
        triggerHaptic("selection");
      }
    }
  }, [customStartDate, customEndDate, onDatePresetChange]);

  // Toggle tag in multi-select array
  const handleTagToggle = useCallback(
    (tag: EventTag) => {
      triggerHaptic("selection");
      if (selectedTags.includes(tag)) {
        onTagsChange(selectedTags.filter((t) => t !== tag));
      } else {
        onTagsChange([...selectedTags, tag]);
      }
    },
    [selectedTags, onTagsChange]
  );

  const handleClearFilters = useCallback(() => {
    triggerHaptic("selection");
    onDatePresetChange("7days");
    onTagsChange([]);
  }, [onDatePresetChange, onTagsChange]);

  const handleClearCategories = useCallback(() => {
    triggerHaptic("selection");
    onTagsChange([]);
  }, [onTagsChange]);

  return (
    <div className="bg-background border-b">
      {/* Mobile: Compact filter bar */}
      <div className="sm:hidden">
        <div className="px-3 py-2.5 flex items-center gap-2">
          {/* Filter button */}
          <button
            onClick={() => {
              triggerHaptic("selection");
              setShowMobileFilters(true);
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-full border transition-all active:scale-95",
              activeFilterCount > 0
                ? "bg-primary/10 border-primary text-primary"
                : "border-border text-muted-foreground"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-sm font-medium">{t("filters")}</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Quick filter chips */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span className="truncate max-w-[100px]">{currentDateLabel}</span>
          </div>

          {/* Event count */}
          <div className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {t("eventsCount", { count: eventCount })}
          </div>
        </div>

        {/* Mobile Filter Bottom Sheet */}
        <MobileFilterSheet
          open={showMobileFilters}
          onOpenChange={setShowMobileFilters}
          datePreset={datePreset}
          onDatePresetChange={onDatePresetChange}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onCustomStartDateChange={onCustomStartDateChange}
          onCustomEndDateChange={onCustomEndDateChange}
          onApplyCustomDates={handleApplyCustomDates}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
          onClearFilters={handleClearFilters}
          availableCategories={availableCategories}
          categoryCounts={categoryCounts}
          activeFilterCount={activeFilterCount}
        />
      </div>

      {/* Desktop: Dropdown filters */}
      <div className="hidden sm:block px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Date dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all hover:border-foreground/30",
                  datePreset !== "7days"
                    ? "bg-primary/5 border-primary/30 text-foreground"
                    : "border-border text-muted-foreground"
                )}
              >
                <Calendar className="w-4 h-4" />
                <span>{currentDateLabel}</span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="space-y-1">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      triggerHaptic("selection");
                      onDatePresetChange(preset.value);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                      datePreset === preset.value
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <span>{t(preset.labelKey)}</span>
                    {datePreset === preset.value && <Check className="w-4 h-4" />}
                  </button>
                ))}
                <div className="border-t my-1" />
                <Popover open={showCustomDatePicker} onOpenChange={setShowCustomDatePicker}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                        datePreset === "custom"
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      )}
                    >
                      <CalendarRange className="w-4 h-4" />
                      <span>{t("presets.custom")}</span>
                      {datePreset === "custom" && <Check className="w-4 h-4 ml-auto" />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" side="right" align="start">
                    <CustomDatePicker
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomStartDateChange={onCustomStartDateChange}
                      onCustomEndDateChange={onCustomEndDateChange}
                      onApply={handleApplyCustomDates}
                      onCancel={() => setShowCustomDatePicker(false)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </PopoverContent>
          </Popover>

          {/* Category drawer trigger */}
          <button
            onClick={() => {
              triggerHaptic("selection");
              setShowCategoryDrawer(true);
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all hover:border-foreground/30",
              selectedTags.length > 0
                ? "bg-primary/5 border-primary/30 text-foreground"
                : "border-border text-muted-foreground"
            )}
          >
            <Tent className="w-4 h-4" />
            <span>
              {selectedTags.length > 0
                ? `${t("category")} (${selectedTags.length})`
                : tCat("all")}
            </span>
            <ChevronDown className="w-4 h-4 opacity-50" />
          </button>

          {/* Desktop Category Drawer */}
          <CategoryDrawer
            open={showCategoryDrawer}
            onOpenChange={setShowCategoryDrawer}
            selectedTags={selectedTags}
            onTagToggle={handleTagToggle}
            onClearCategories={handleClearCategories}
            availableCategories={availableCategories}
            categoryCounts={categoryCounts}
          />

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{tCat("clear")}</span>
            </button>
          )}

          {/* Event count */}
          <div className="ml-auto text-sm text-muted-foreground">
            {t("eventsCount", { count: eventCount })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mobile Filter Bottom Sheet
interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartDateChange: (date: string) => void;
  onCustomEndDateChange: (date: string) => void;
  onApplyCustomDates: () => void;
  selectedTags: EventTag[];
  onTagToggle: (tag: EventTag) => void;
  onClearFilters: () => void;
  availableCategories: { tag: EventTag; icon: LucideIcon }[];
  categoryCounts: Record<EventTag, number>;
  activeFilterCount: number;
}

function MobileFilterSheet({
  open,
  onOpenChange,
  datePreset,
  onDatePresetChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onApplyCustomDates,
  selectedTags,
  onTagToggle,
  onClearFilters,
  availableCategories,
  categoryCounts,
  activeFilterCount,
}: MobileFilterSheetProps) {
  const t = useTranslations("mapPage");
  const tCat = useTranslations("categories");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Content
          className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-2xl max-h-[85vh] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300"
          aria-describedby={undefined}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 border-b">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {t("filters")}
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  onClick={onClearFilters}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  {tCat("clear")}
                </button>
              )}
              <DialogPrimitive.Close className="p-2 -m-2 rounded-full hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)]">
            {/* Date Range Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t("dateRange")}</h3>
              <div className="flex flex-wrap gap-2">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      triggerHaptic("selection");
                      onDatePresetChange(preset.value);
                    }}
                    className={cn(
                      "px-4 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95",
                      datePreset === preset.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustomPicker(!showCustomPicker)}
                  className={cn(
                    "px-4 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5",
                    datePreset === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <CalendarRange className="w-4 h-4" />
                  {t("presets.custom")}
                </button>
              </div>

              {/* Custom date picker inline */}
              {showCustomPicker && (
                <div className="pt-2">
                  <CustomDatePicker
                    customStartDate={customStartDate}
                    customEndDate={customEndDate}
                    onCustomStartDateChange={onCustomStartDateChange}
                    onCustomEndDateChange={onCustomEndDateChange}
                    onApply={() => {
                      onApplyCustomDates();
                      setShowCustomPicker(false);
                    }}
                    onCancel={() => setShowCustomPicker(false)}
                  />
                </div>
              )}
            </div>

            {/* Category Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">{t("category")}</h3>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => {
                      triggerHaptic("selection");
                      selectedTags.forEach((tag) => onTagToggle(tag));
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {tCat("clear")} ({selectedTags.length})
                  </button>
                )}
              </div>
              {availableCategories.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {availableCategories.map(({ tag, icon: Icon }) => {
                    const isSelected = selectedTags.includes(tag);
                    const count = categoryCounts[tag] || 0;
                    return (
                      <button
                        key={tag}
                        onClick={() => onTagToggle(tag)}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium truncate w-full text-center">
                          {tCat(tag)}
                        </span>
                        <span className={cn(
                          "text-[10px]",
                          isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("noCategoriesInDateRange")}
                </p>
              )}
            </div>
          </div>

          {/* Done button */}
          <div className="p-4 border-t bg-background">
            <button
              onClick={() => onOpenChange(false)}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium active:scale-[0.98] transition-transform"
            >
              Done
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// Desktop Category Drawer (slides from left)
interface CategoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTags: EventTag[];
  onTagToggle: (tag: EventTag) => void;
  onClearCategories: () => void;
  availableCategories: { tag: EventTag; icon: LucideIcon }[];
  categoryCounts: Record<EventTag, number>;
}

function CategoryDrawer({
  open,
  onOpenChange,
  selectedTags,
  onTagToggle,
  onClearCategories,
  availableCategories,
  categoryCounts,
}: CategoryDrawerProps) {
  const t = useTranslations("mapPage");
  const tCat = useTranslations("categories");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Content
          className="fixed left-0 top-0 bottom-0 z-50 w-80 bg-background shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-300"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {t("category")}
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              {selectedTags.length > 0 && (
                <button
                  onClick={onClearCategories}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  {tCat("clear")} ({selectedTags.length})
                </button>
              )}
              <DialogPrimitive.Close className="p-2 -m-2 rounded-full hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Category list */}
          <div className="p-4 overflow-y-auto max-h-[calc(100vh-140px)]">
            {availableCategories.length > 0 ? (
              <div className="space-y-2">
                {availableCategories.map(({ tag, icon: Icon }) => {
                  const isSelected = selectedTags.includes(tag);
                  const count = categoryCounts[tag] || 0;
                  return (
                    <button
                      key={tag}
                      onClick={() => onTagToggle(tag)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="flex-1 text-left font-medium">
                        {tCat(tag)}
                      </span>
                      <span className={cn(
                        "text-sm",
                        isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {count}
                      </span>
                      {isSelected && <Check className="w-5 h-5 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("noCategoriesInDateRange")}
              </p>
            )}
          </div>

          {/* Done button */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
            <button
              onClick={() => onOpenChange(false)}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium active:scale-[0.98] transition-transform"
            >
              Done
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// Custom Date Picker component
interface CustomDatePickerProps {
  customStartDate: string;
  customEndDate: string;
  onCustomStartDateChange: (date: string) => void;
  onCustomEndDateChange: (date: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

function CustomDatePicker({
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onApply,
  onCancel,
}: CustomDatePickerProps) {
  const t = useTranslations("mapPage");

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{t("customDateRange")}</div>
      <div className="flex gap-2">
        <div className="space-y-1.5 flex-1">
          <label className="text-xs text-muted-foreground">{t("start")}</label>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => onCustomStartDateChange(e.target.value)}
            min={format(new Date(), "yyyy-MM-dd")}
            className="block w-full px-3 py-2 text-sm border rounded-lg bg-background"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <label className="text-xs text-muted-foreground">{t("end")}</label>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => onCustomEndDateChange(e.target.value)}
            min={customStartDate || format(new Date(), "yyyy-MM-dd")}
            className="block w-full px-3 py-2 text-sm border rounded-lg bg-background"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
        >
          {t("cancel")}
        </button>
        <button
          onClick={onApply}
          disabled={!customStartDate || !customEndDate}
          className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {t("apply")}
        </button>
      </div>
    </div>
  );
}
