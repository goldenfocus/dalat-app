"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

type InputProps = React.ComponentProps<typeof Input>;

/**
 * Normalize a URL by lowercasing and adding https:// if no protocol is present
 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  // Already has a protocol
  if (/^https?:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Add https://
  return `https://${trimmed}`;
}

/**
 * URL input that auto-lowercases and adds https:// on blur.
 * Works with both controlled (value/onChange) and uncontrolled (defaultValue) inputs.
 */
const UrlInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ onBlur, onChange, value, defaultValue, ...props }, ref) => {
    // Use internal state for uncontrolled inputs
    const [internalValue, setInternalValue] = React.useState(
      (defaultValue as string) ?? ""
    );

    const isControlled = value !== undefined;
    const currentValue = isControlled ? (value as string) : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const normalized = normalizeUrl(e.target.value);
      e.target.value = normalized;

      if (!isControlled) {
        setInternalValue(normalized);
      }

      onBlur?.(e);
    };

    return (
      <Input
        ref={ref}
        type="text"
        value={currentValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);
UrlInput.displayName = "UrlInput";

export { UrlInput, normalizeUrl };
