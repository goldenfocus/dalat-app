"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/lib/i18n/routing";
import { Home, Plus } from "lucide-react";

interface MomentsHeaderProps {
  authButton: ReactNode;
  isAuthenticated: boolean;
}

export function MomentsHeader({ authButton, isAuthenticated }: MomentsHeaderProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY;
      const scrolledPastThreshold = currentScrollY > 60;

      if (scrollingDown && scrolledPastThreshold) {
        setIsVisible(false);
      } else if (!scrollingDown) {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-transform duration-300 lg:hidden ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex h-14 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-white/90 hover:text-white active:scale-95 transition-all px-2 py-2 -ml-2 rounded-lg"
            aria-label="Home"
          >
            <Home className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-1">
            {isAuthenticated && (
              <Link
                href="/events/new"
                prefetch={false}
                className="flex p-2 text-white/90 hover:text-white active:scale-95 transition-all rounded-md"
                aria-label="Create event"
              >
                <Plus className="w-5 h-5" />
              </Link>
            )}
            <div className="[&_button]:text-white/90 [&_button:hover]:text-white [&_a]:text-white/90 [&_a:hover]:text-white">
              {authButton}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
