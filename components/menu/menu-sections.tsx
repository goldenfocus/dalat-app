import { OriginalText } from "@/components/ui/original-text";
import { getTranslations } from "next-intl/server";
import { formatVnd } from "@/lib/menu/format";
import type { MenuSection } from "@/lib/menu/types";

const TAG_ORDER = ["favourite", "vegetarian", "hot", "iced"] as const;

/**
 * Server-rendered so every dish + price is in the HTML crawlers and AI
 * answer engines read. `headingLevel` lets the page own its H1/H2 outline.
 */
export async function MenuSections({
  sections,
  locale,
  showNav = true,
}: {
  sections: MenuSection[];
  locale: string;
  showNav?: boolean;
}) {
  const t = await getTranslations("venueMenu");

  return (
    <div className="space-y-10">
      {showNav && sections.length > 1 && (
        <nav
          aria-label={t("menuTitle")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#menu-${s.slug}`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors hover:bg-muted active:scale-95"
            >
              {s.title}
            </a>
          ))}
        </nav>
      )}

      {sections.map((section) => (
        <section
          key={section.id}
          id={`menu-${section.slug}`}
          className="scroll-mt-24"
        >
          <h2 className="text-xl font-semibold">{section.title}</h2>
          {section.originalTitle &&
            (section.title !== section.originalTitle ||
              section.note !== section.originalNote) && (
              <OriginalText
                text={[section.originalTitle, section.originalNote]
                  .filter(Boolean)
                  .join("\n")}
              />
            )}
          {section.note && (
            <p className="mt-1 text-sm text-muted-foreground">{section.note}</p>
          )}
          <ul className="mt-4 divide-y rounded-xl border">
            {section.items.map((item) => {
              const tags = TAG_ORDER.filter((tag) => item.tags.includes(tag));
              return (
                <li key={item.id} className="flex gap-3 p-4">
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      loading="lazy"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3
                        className={`font-medium ${item.is_sold_out ? "text-muted-foreground line-through" : ""}`}
                      >
                        {item.name}
                      </h3>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatVnd(item.price_vnd, locale)}
                      </span>
                    </div>
                    {item.originalName &&
                      (item.name !== item.originalName ||
                        item.description !== item.originalDescription) && (
                        <OriginalText
                          text={[item.originalName, item.originalDescription]
                            .filter(Boolean)
                            .join("\n")}
                        />
                      )}
                    {item.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    {(tags.length > 0 || item.is_sold_out) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.is_sold_out && (
                          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                            {t("soldOut")}
                          </span>
                        )}
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {tag === "favourite"
                              ? `★ ${t("favourite")}`
                              : t(tag)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">{t("allPricesVnd")}</p>
    </div>
  );
}
