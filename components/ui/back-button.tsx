"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n/routing";

interface BackButtonProps {
  fallbackHref?: string;
  children: React.ReactNode;
  className?: string;
}

export function BackButton({
  fallbackHref = "/",
  children,
  className,
}: BackButtonProps) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Check if we have meaningful history to go back to
    // history.length > 1 means there's at least one page before this one
    setCanGoBack(window.history.length > 1);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (canGoBack) {
      e.preventDefault();
      router.back();
    }
    // If no history, let the Link navigate to fallbackHref
  };

  return (
    <Link href={fallbackHref} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}
