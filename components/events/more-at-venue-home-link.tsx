import { Link } from "@/lib/i18n/routing";

export interface MoreAtVenueHomeLinkData {
  href: string;
  label: string;
}

/**
 * Small homepage pointer to the rest of a venue's events.
 * Rendered beside the card link, never inside it.
 */
export function MoreAtVenueHomeLink({ href, label }: MoreAtVenueHomeLinkData) {
  return (
    <Link
      href={href}
      className="mt-1.5 inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {label}
    </Link>
  );
}
