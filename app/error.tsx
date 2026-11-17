"use client";

import { RootErrorScreen } from "@/components/errors/root-error-screen";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}

/**
 * Catches what the locale layout's own boundary cannot: errors in the layout
 * itself, e.g. a background refresh whose response was cut off mid-stream.
 */
export default function RootError({ error, reset, unstable_retry }: Props) {
  return <RootErrorScreen error={error} retry={unstable_retry ?? reset} />;
}
