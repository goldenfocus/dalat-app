"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { OperatingHours } from "@/lib/types";

interface VenueHoursBadgeProps {
  operatingHours: OperatingHours | null;
  showTime?: boolean;
  className?: string;
}

// Get current day in Da Lat timezone (UTC+7)
function getDaLatDay(): keyof OperatingHours {
  const now = new Date();
  // Shift to UTC+7
  const daLatTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const days: (keyof OperatingHours)[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[daLatTime.getUTCDay()];
}

// Get current time in Da Lat as HH:MM
function getDaLatTime(): string {
  const now = new Date();
  const daLatTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hours = daLatTime.getUTCHours().toString().padStart(2, "0");
  const minutes = daLatTime.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Parse time string (HH:MM) to minutes from midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isVenueOpenNow(operatingHours: OperatingHours | null): {
  isOpen: boolean;
  closesAt?: string;
  opensAt?: string;
} {
  if (!operatingHours) {
    return { isOpen: false };
  }

  const today = getDaLatDay();
  const todayHours = operatingHours[today];

  if (!todayHours || todayHours === "closed") {
    // Find next opening day
    const days: (keyof OperatingHours)[] = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const todayIndex = days.indexOf(today);

    for (let i = 1; i <= 7; i++) {
      const nextDay = days[(todayIndex + i) % 7];
      const nextHours = operatingHours[nextDay];
      if (nextHours && nextHours !== "closed") {
        return {
          isOpen: false,
          opensAt: `${nextDay.charAt(0).toUpperCase() + nextDay.slice(1)} ${nextHours.open}`,
        };
      }
    }

    return { isOpen: false };
  }

  const currentMinutes = timeToMinutes(getDaLatTime());
  const openMinutes = timeToMinutes(todayHours.open);
  const closeMinutes = timeToMinutes(todayHours.close);

  // Handle cases where close time is past midnight
  const isOvernight = closeMinutes < openMinutes;

  if (isOvernight) {
    // Open if after opening OR before closing
    const isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    return {
      isOpen,
      closesAt: isOpen ? todayHours.close : undefined,
      opensAt: !isOpen ? todayHours.open : undefined,
    };
  }

  const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

  return {
    isOpen,
    closesAt: isOpen ? todayHours.close : undefined,
    opensAt: !isOpen && currentMinutes < openMinutes ? todayHours.open : undefined,
  };
}

export function VenueHoursBadge({
  operatingHours,
  showTime = true,
  className,
}: VenueHoursBadgeProps) {
  const t = useTranslations("venues");
  const status = isVenueOpenNow(operatingHours);

  if (!operatingHours) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        className
      )}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          status.isOpen ? "bg-green-500" : "bg-red-500"
        )}
      />
      <span className={status.isOpen ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
        {status.isOpen ? t("status.open") : t("status.closed")}
      </span>
      {showTime && status.isOpen && status.closesAt && (
        <span className="text-muted-foreground">· {t("status.until")} {status.closesAt}</span>
      )}
      {showTime && !status.isOpen && status.opensAt && (
        <span className="text-muted-foreground">· {t("status.opens")} {status.opensAt}</span>
      )}
    </span>
  );
}
