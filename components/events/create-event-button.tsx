import { Plus } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

export function CreateEventButton({ label }: { label: string }) {
  return (
    <Link
      href="/events/new"
      prefetch={false}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-primary/80"
    >
      <Plus className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
