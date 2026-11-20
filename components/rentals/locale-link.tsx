import Link from "next/link";
import type { ComponentProps } from "react";
import { getPathname, type Locale } from "@/lib/i18n/routing";

type Props = Omit<ComponentProps<typeof Link>, "href" | "locale"> & { href: string; locale: Locale };

export function RentalLocaleLink({ locale, href, ...props }: Props) {
  return <Link {...props} href={getPathname({ locale, href })} />;
}
