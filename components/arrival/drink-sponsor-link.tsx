import type { ReactNode } from "react";

export function DrinkSponsorLink({ children }: { children: ReactNode }) {
  return (
    <a
      href="https://ezviet.org"
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-current/50 underline-offset-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      {children}
    </a>
  );
}
