import type { ReactNode } from "react";
import "./event-page.css";

/** Event tasks use one page scroll; persistent app chrome must not cover them. */
export default function EventLayout({ children }: { children: ReactNode }) {
  return <div data-event-page>{children}</div>;
}
