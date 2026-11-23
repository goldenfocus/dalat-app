import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";

type Crumb = { label: string; href: string };

export async function Breadcrumbs({ parents, current, className }: {
  parents: Crumb[];
  current: string;
  className?: string;
}) {
  const t = await getTranslations("nav");

  return (
    <nav aria-label={t("breadcrumbs")} className={className}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        {parents.map(({ href, label }) => (
          <li key={href} className="flex min-w-0 items-center gap-1.5">
            <Link href={href} prefetch={false} className="truncate py-2 underline-offset-4 hover:text-foreground hover:underline">
              {label}
            </Link>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
          </li>
        ))}
        <li aria-current="page" className="truncate font-medium text-foreground">{current}</li>
      </ol>
    </nav>
  );
}
