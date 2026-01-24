"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  label: string;
}

interface VenueSectionNavProps {
  sections: Section[];
}

export function VenueSectionNav({ sections }: VenueSectionNavProps) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id || "");
  const [isSticky, setIsSticky] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Handle scroll to section
  const handleClick = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      // Get nav height for offset
      const navHeight = navRef.current?.offsetHeight || 60;
      const headerHeight = 56; // Main header height
      const offset = navHeight + headerHeight + 16; // Extra padding

      const y = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, []);

  // Intersection Observer to detect active section
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: "-20% 0px -70% 0px", // Section is active when it's in the upper third
      threshold: 0,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, options);

    // Observe all sections
    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [sections]);

  // Detect when nav becomes sticky
  useEffect(() => {
    const checkSticky = () => {
      if (navRef.current) {
        const rect = navRef.current.getBoundingClientRect();
        // Nav is sticky when it's at the top (accounting for header)
        setIsSticky(rect.top <= 56);
      }
    };

    window.addEventListener("scroll", checkSticky, { passive: true });
    return () => window.removeEventListener("scroll", checkSticky);
  }, []);

  if (sections.length === 0) return null;

  return (
    <div
      ref={navRef}
      className={cn(
        "sticky top-14 z-40 -mx-4 px-4 py-2 transition-all duration-200",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        isSticky && "border-b border-border/40 shadow-sm"
      )}
    >
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => handleClick(section.id)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "active:scale-95 min-h-[44px] flex items-center",
              activeSection === section.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
