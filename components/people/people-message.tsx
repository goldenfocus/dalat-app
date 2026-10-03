import type { ReactNode } from "react";
import { UsersRound } from "lucide-react";

export function PeopleMessage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg py-14 text-center sm:py-20">
      <UsersRound className="mx-auto mb-5 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}
