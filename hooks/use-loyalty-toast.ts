"use client";
import { useState, useCallback } from "react";

export function useLoyaltyToast() {
  const [toastData, setToastData] = useState<{
    points: number;
    activity: string;
  } | null>(null);

  const showPointsEarned = useCallback(
    (points: number, activity: string) => {
      setToastData({ points, activity });
      setTimeout(() => setToastData(null), 3000);
    },
    [],
  );

  return { toastData, showPointsEarned };
}
