/**
 * Toast notification utilities with haptic feedback
 * Uses Sonner for beautiful, accessible toast notifications
 */

import { toast as sonnerToast } from 'sonner';
import { hapticSuccess, hapticError, hapticFeedback } from './haptics';

/**
 * Show success toast with haptic feedback
 */
export function toastSuccess(message: string, description?: string) {
  hapticSuccess();
  return sonnerToast.success(message, {
    description,
    duration: 3000,
  });
}

/**
 * Show error toast with haptic feedback
 */
export function toastError(message: string, description?: string) {
  hapticError();
  return sonnerToast.error(message, {
    description,
    duration: 4000,
  });
}

/**
 * Show info toast
 */
export function toastInfo(message: string, description?: string) {
  hapticFeedback('light');
  return sonnerToast.info(message, {
    description,
    duration: 3000,
  });
}

/**
 * Show loading toast (returns dismiss function)
 */
export function toastLoading(message: string) {
  return sonnerToast.loading(message);
}

/**
 * Show promise toast (handles async operations)
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  }
) {
  return sonnerToast.promise(promise, {
    loading: messages.loading,
    success: (data) => {
      hapticSuccess();
      return typeof messages.success === 'function'
        ? messages.success(data)
        : messages.success;
    },
    error: (error) => {
      hapticError();
      return typeof messages.error === 'function'
        ? messages.error(error)
        : messages.error;
    },
  });
}

/**
 * Copy text to clipboard with toast notification
 */
export async function copyToClipboard(text: string, successMessage = 'Copied to clipboard!') {
  try {
    await navigator.clipboard.writeText(text);
    toastSuccess(successMessage);
    return true;
  } catch (error) {
    toastError('Failed to copy', 'Please try again');
    return false;
  }
}
