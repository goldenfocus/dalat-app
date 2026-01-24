"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

type InputProps = React.ComponentProps<typeof Input>;

/**
 * Email input that auto-lowercases on blur.
 * Works with both controlled (value/onChange) and uncontrolled (defaultValue) inputs.
 */
const EmailInput = React.forwardRef<HTMLInputElement, InputProps>(
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
      const lowercased = e.target.value.trim().toLowerCase();
      e.target.value = lowercased;

      if (!isControlled) {
        setInternalValue(lowercased);
      }

      onBlur?.(e);
    };

    return (
      <Input
        ref={ref}
        type="email"
        value={currentValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);
EmailInput.displayName = "EmailInput";

export { EmailInput };
