"use client";

import { useState } from "react";
import { RootErrorScreen } from "@/components/errors/root-error-screen";
import "./globals.css";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}

/** Replaces the root layout when it fails, so it renders its own document. */
export default function GlobalError({ error, reset, unstable_retry }: Props) {
  // Read before React replaces <html>: the root layout's bootstrap script set it.
  const [lang] = useState(() =>
    typeof document === "undefined" ? "en" : document.documentElement.lang || "en"
  );

  return (
    <html lang={lang}>
      <body className="antialiased">
        <RootErrorScreen error={error} retry={unstable_retry ?? reset} />
      </body>
    </html>
  );
}
