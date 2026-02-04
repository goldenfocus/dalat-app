"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Repeat, ChevronDown, ChevronUp } from "lucide-react";
import {
  getRecurrencePresets,
  buildRRule,
  parseRRule,
  describeRRule,
  getDefaultRecurrenceData,
} from "@/lib/recurrence";
import type { RecurrenceFormData, RecurrencePreset } from "@/lib/types";

interface RecurrencePickerProps {
  selectedDate: Date | null;
  value: RecurrenceFormData;
  onChange: (data: RecurrenceFormData) => void;
  className?: string;
}

export function RecurrencePicker({
  selectedDate,
  value,
  onChange,
  className,
}: RecurrencePickerProps) {
  const t = useTranslations("recurrence");
  const [showCustom, setShowCustom] = useState(false);
  const [presets, setPresets] = useState<RecurrencePreset[]>([]);

  const END_TYPE_OPTIONS = [
    { value: "never", label: t("never") },
    { value: "count", label: t("after") },
    { value: "date", label: t("onDate") },
  ];

  // Generate presets based on selected date
  useEffect(() => {
    if (selectedDate) {
      setPresets(getRecurrencePresets(selectedDate));
    }
  }, [selectedDate]);

  // Handle preset selection
  const handlePresetSelect = (presetId: string) => {
    if (presetId === "custom") {
      setShowCustom(true);
      return;
    }

    if (presetId === "none") {
      onChange(getDefaultRecurrenceData());
      setShowCustom(false);
      return;
    }

    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      const parsed = parseRRule(preset.rrule);
      onChange(parsed);
      setShowCustom(false);
    }
  };

  // Get current preset ID based on value
  const getCurrentPresetId = (): string => {
    if (!value.isRecurring) return "none";

    const _currentRRule = buildRRule(value);
    const matchingPreset = presets.find((p) => {
      const presetData = parseRRule(p.rrule);
      return (
        presetData.frequency === value.frequency &&
        presetData.interval === value.interval &&
        JSON.stringify(presetData.weekDays.sort()) ===
          JSON.stringify(value.weekDays.sort()) &&
        presetData.monthDay === value.monthDay &&
        JSON.stringify(presetData.monthWeekDay) ===
          JSON.stringify(value.monthWeekDay)
      );
    });

    return matchingPreset?.id || "custom";
  };

  // Handle individual field changes
  const updateField = <K extends keyof RecurrenceFormData>(
    field: K,
    fieldValue: RecurrenceFormData[K]
  ) => {
    onChange({
      ...value,
      isRecurring: true,
      [field]: fieldValue,
    });
  };

  if (!selectedDate) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toggle / Preset Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Repeat className="w-4 h-4" />
          {t("repeat")}
        </Label>

        <Select value={getCurrentPresetId()} onValueChange={handlePresetSelect}>
          <SelectTrigger>
            <SelectValue placeholder={t("doesNotRepeat")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("doesNotRepeat")}</SelectItem>
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">{t("custom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom Configuration (expanded) */}
      {value.isRecurring && (showCustom || getCurrentPresetId() === "custom") && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          {/* Frequency and Interval */}
          <div className="flex items-center gap-2">
            <span className="text-sm">{t("every")}</span>
            <Input
              type="number"
              min="1"
              max="99"
              value={value.interval}
              onChange={(e) =>
                updateField("interval", parseInt(e.target.value, 10) || 1)
              }
              className="w-16"
            />
            <Select
              value={value.frequency}
              onValueChange={(v) =>
                updateField("frequency", v as RecurrenceFormData["frequency"])
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">
                  {value.interval === 1 ? t("frequency.day") : t("frequency.days")}
                </SelectItem>
                <SelectItem value="WEEKLY">
                  {value.interval === 1 ? t("frequency.week") : t("frequency.weeks")}
                </SelectItem>
                <SelectItem value="MONTHLY">
                  {value.interval === 1 ? t("frequency.month") : t("frequency.months")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Day Selection for Weekly */}
          {value.frequency === "WEEKLY" && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t("on")}</Label>
              <div className="flex flex-wrap gap-1">
                {["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((day) => {
                  const isSelected = value.weekDays.includes(day);
                  const dayLabels: Record<string, string> = {
                    SU: "S",
                    MO: "M",
                    TU: "T",
                    WE: "W",
                    TH: "T",
                    FR: "F",
                    SA: "S",
                  };
                  return (
                    <Button
                      key={day}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => {
                        const newDays = isSelected
                          ? value.weekDays.filter((d) => d !== day)
                          : [...value.weekDays, day];
                        updateField("weekDays", newDays);
                      }}
                    >
                      {dayLabels[day]}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* End Condition */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("ends")}</Label>
            <div className="flex items-center gap-2">
              <Select
                value={value.endType}
                onValueChange={(v) =>
                  updateField("endType", v as RecurrenceFormData["endType"])
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {END_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {value.endType === "count" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="999"
                    value={value.endCount || ""}
                    onChange={(e) =>
                      updateField("endCount", parseInt(e.target.value, 10) || undefined)
                    }
                    className="w-20"
                    placeholder="10"
                  />
                  <span className="text-sm text-muted-foreground">{t("occurrences")}</span>
                </div>
              )}

              {value.endType === "date" && (
                <Input
                  type="date"
                  value={value.endDate || ""}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  className="w-40"
                />
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              {describeRRule(buildRRule(value))}
              {value.endType === "count" && value.endCount && `, ${value.endCount} times`}
              {value.endType === "date" && value.endDate && `, until ${value.endDate}`}
            </p>
          </div>

          {/* Collapse custom */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowCustom(false)}
            className="w-full"
          >
            <ChevronUp className="w-4 h-4 mr-2" />
            {t("hideOptions")}
          </Button>
        </div>
      )}

      {/* Show summary when not expanded but recurring */}
      {value.isRecurring && !showCustom && getCurrentPresetId() !== "custom" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowCustom(true)}
          className="text-muted-foreground"
        >
          <ChevronDown className="w-4 h-4 mr-2" />
          {t("customizeRecurrence")}
        </Button>
      )}
    </div>
  );
}
