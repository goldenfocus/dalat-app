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
  selectedTag: EventTag | null;
  onTagChange: (tag: EventTag | null) => void;
  eventCount: number;
}

export function MapFilterBar({
  datePreset,
  onDatePresetChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  selectedTag,
  onTagChange,
  eventCount,
}: MapFilterBarProps) {
  const t = useTranslations("mapPage");
  const tCat = useTranslations("categories");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (datePreset !== "7days") count++;
    if (selectedTag) count++;
    return count;
  }, [datePreset, selectedTag]);

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

  const handleTagSelect = useCallback(
    (tag: EventTag) => {
      triggerHaptic("selection");
      onTagChange(selectedTag === tag ? null : tag);
    },
    [selectedTag, onTagChange]
  );

  const handleClearFilters = useCallback(() => {
    triggerHaptic("selection");
    onDatePresetChange("7days");
    onTagChange(null);
  }, [onDatePresetChange, onTagChange]);

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
          selectedTag={selectedTag}
          onTagChange={handleTagSelect}
          onClearFilters={handleClearFilters}
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

          {/* Category dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all hover:border-foreground/30",
                  selectedTag
                    ? "bg-primary/5 border-primary/30 text-foreground"
                    : "border-border text-muted-foreground"
                )}
              >
                {selectedTag ? (
                  <>
                    {(() => {
                      const tagConfig = FEATURED_TAGS.find((t) => t.tag === selectedTag);
                      const Icon = tagConfig?.icon || Tent;
                      return <Icon className="w-4 h-4" />;
                    })()}
                    <span>{tCat(selectedTag)}</span>
                  </>
                ) : (
                  <>
                    <Tent className="w-4 h-4" />
                    <span>{tCat("all")}</span>
                  </>
                )}
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="grid grid-cols-2 gap-1.5">
                {/* All categories option */}
                <button
                  onClick={() => {
                    triggerHaptic("selection");
                    onTagChange(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    !selectedTag
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  <Check className={cn("w-4 h-4", !selectedTag ? "opacity-100" : "opacity-0")} />
                  <span>{tCat("all")}</span>
                </button>

                {/* Category options */}
                {FEATURED_TAGS.map(({ tag, icon: Icon }) => (
                  <button
                    key={tag}
                    onClick={() => handleTagSelect(tag)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors",
                      selectedTag === tag
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{tCat(tag)}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

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
  selectedTag: EventTag | null;
  onTagChange: (tag: EventTag) => void;
  onClearFilters: () => void;
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
  selectedTag,
  onTagChange,
  onClearFilters,
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
              <h3 className="text-sm font-medium text-muted-foreground">{t("category")}</h3>
              <div className="grid grid-cols-3 gap-2">
                {FEATURED_TAGS.map(({ tag, icon: Icon }) => (
                  <button
                    key={tag}
                    onClick={() => onTagChange(tag)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl transition-all active:scale-95",
                      selectedTag === tag
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium truncate w-full text-center">
                      {tCat(tag)}
                    </span>
                  </button>
                ))}
              </div>
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
