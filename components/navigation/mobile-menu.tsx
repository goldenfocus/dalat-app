"use client";

import { useState } from "react";
import { Menu, X, MapPin, Calendar, BookOpen, Info } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { triggerHaptic } from "@/lib/haptics";

interface MobileMenuProps {
  /** Use light variant for overlay on dark backgrounds */
  variant?: "default" | "overlay";
}

export function MobileMenu({ variant = "default" }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("nav");

  const toggleMenu = () => {
    triggerHaptic("selection");
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const menuItems = [
    { href: "/map", icon: MapPin, label: t("map") },
    { href: "/calendar", icon: Calendar, label: t("calendar") },
    { href: "/blog", icon: BookOpen, label: t("blog") },
    { href: "/about", icon: Info, label: t("about") },
  ];

  const buttonClass = variant === "overlay"
    ? "p-2 text-white/90 hover:text-white active:scale-95 transition-all rounded-lg"
    : "p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-lg";

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={toggleMenu}
        className={buttonClass}
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Slide-out menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[100] animate-in fade-in duration-200"
            onClick={closeMenu}
          />

          {/* Menu panel */}
          <div className="fixed top-0 right-0 h-full w-64 bg-background z-[101] animate-in slide-in-from-right duration-200 shadow-xl">
            {/* Close button */}
            <div className="flex justify-end p-4">
              <button
                onClick={closeMenu}
                className="p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-lg"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu items */}
            <nav className="px-4">
              <ul className="space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        className="flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted rounded-lg transition-colors active:scale-[0.98]"
                      >
                        <Icon className="w-5 h-5 text-muted-foreground" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
