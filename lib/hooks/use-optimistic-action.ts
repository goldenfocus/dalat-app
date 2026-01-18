"use client";

import { useState, useCallback, useRef } from "react";
import { triggerHaptic, type HapticStyle } from "@/lib/haptics";

interface UseOptimisticActionOptions<T> {
  initialValue: T;
  onSuccess?: (result: T) => void;
  onError?: (error: Error, revertValue: T) => void;
  successHaptic?: HapticStyle;
  errorHaptic?: HapticStyle;
}

/**
 * Hook for optimistic UI updates with automatic rollback on error.
 *
 * @example
 * const { value, isPending, execute } = useOptimisticAction({
 *   initialValue: { liked: false, count: 0 },
 *   successHaptic: "success",
 * });
 *
 * const handleLike = () => {
 *   execute(
 *     { liked: true, count: value.count + 1 }, // Optimistic value
 *     async () => {
 *       return await api.like(postId); // Actual API call
 *     }
 *   );
 * };
 */
export function useOptimisticAction<T>({
  initialValue,
  onSuccess,
  onError,
  successHaptic = "success",
  errorHaptic = "error",
}: UseOptimisticActionOptions<T>) {
  const [value, setValue] = useState<T>(initialValue);
  const [isPending, setIsPending] = useState(false);
  const revertValueRef = useRef<T>(initialValue);

  const execute = useCallback(
    async (optimisticValue: T, action: () => Promise<T>) => {
      // Save current value for potential rollback
      revertValueRef.current = value;

      // Apply optimistic update immediately
      setValue(optimisticValue);
      setIsPending(true);
      triggerHaptic("selection");

      try {
        const result = await action();
        setValue(result);
        triggerHaptic(successHaptic);
        onSuccess?.(result);
      } catch (error) {
        // Rollback on error
        setValue(revertValueRef.current);
        triggerHaptic(errorHaptic);
        onError?.(error as Error, revertValueRef.current);
      } finally {
        setIsPending(false);
      }
    },
    [value, onSuccess, onError, successHaptic, errorHaptic]
  );

  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);

  return {
    value,
    setValue,
    isPending,
    execute,
    reset,
  };
}

/**
 * Simpler version for toggle actions (like/unlike, follow/unfollow)
 */
export function useOptimisticToggle(
  initialState: boolean,
  onToggle: (newState: boolean) => Promise<boolean>
) {
  const [isActive, setIsActive] = useState(initialState);
  const [isPending, setIsPending] = useState(false);

  const toggle = useCallback(async () => {
    const prevState = isActive;
    const newState = !isActive;

    // Optimistic update
    setIsActive(newState);
    setIsPending(true);
    triggerHaptic("selection");

    try {
      const result = await onToggle(newState);
      setIsActive(result);
      triggerHaptic(result ? "success" : "light");
    } catch {
      // Rollback
      setIsActive(prevState);
      triggerHaptic("error");
    } finally {
      setIsPending(false);
    }
  }, [isActive, onToggle]);

  return {
    isActive,
    isPending,
    toggle,
  };
}
