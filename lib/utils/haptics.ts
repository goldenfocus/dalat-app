/**
 * Haptic feedback utilities for mobile devices
 * Provides tactile feedback for user interactions
 */

/**
 * Triggers haptic feedback if available
 * Works on iOS Safari and Android Chrome
 */
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' | 'selection' = 'light') {
  // Check if the Vibration API is available
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  // Map haptic types to vibration patterns (in milliseconds)
  const patterns = {
    light: [10],
    medium: [20],
    heavy: [30],
    selection: [5],
  };

  try {
    navigator.vibrate(patterns[type]);
  } catch (error) {
    // Silently fail if vibration is not supported or blocked
    console.debug('Haptic feedback not available:', error);
  }
}

/**
 * Trigger haptic feedback for button press
 */
export function hapticButtonPress() {
  hapticFeedback('light');
}

/**
 * Trigger haptic feedback for toggle/checkbox
 */
export function hapticToggle() {
  hapticFeedback('selection');
}

/**
 * Trigger haptic feedback for success action
 */
export function hapticSuccess() {
  hapticFeedback('medium');
}

/**
 * Trigger haptic feedback for error/warning
 */
export function hapticError() {
  hapticFeedback('heavy');
}
