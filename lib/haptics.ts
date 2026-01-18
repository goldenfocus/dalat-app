/**
 * Enhanced haptic feedback system for mobile devices.
 * Provides iOS-style haptic patterns with graceful fallbacks.
 */

export type HapticStyle =
  | "light" // Subtle tap
  | "medium" // Standard button press
  | "heavy" // Strong confirmation
  | "selection" // Quick selection change
  | "success" // Successful action
  | "warning" // Warning or attention needed
  | "error"; // Error or failure

// Vibration patterns (in ms) for different feedback types
const VIBRATION_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 3,
  medium: 10,
  heavy: 20,
  selection: 5,
  success: [10, 50, 10], // Double tap pattern
  warning: [15, 30, 15, 30, 15], // Triple warning
  error: [50, 100, 50], // Strong double error
};

/**
 * Trigger haptic feedback on supported devices.
 * Falls back gracefully on unsupported platforms.
 */
export function triggerHaptic(style: HapticStyle = "selection") {
  // Check if we're in a browser environment
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return;
  }

  // Try Vibration API (Android, some browsers)
  if ("vibrate" in navigator) {
    const pattern = VIBRATION_PATTERNS[style];
    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibration failed, ignore silently
    }
  }
}

/**
 * Cancel any ongoing vibration
 */
export function cancelHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Hook-friendly haptic trigger that returns a callback
 */
export function createHapticHandler(style: HapticStyle = "selection") {
  return () => triggerHaptic(style);
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}
