import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createStaticClient } from "@/lib/supabase/server";
import { MomentsDiscovery } from "@/components/moments/moments-discovery";
import { generateMomentsDiscoveryMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateMomentsDiscoverySchema } from "@/lib/structured-data";
import { DISCOVERY_EVENTS_PER_PAGE, getDiscoveryGalleries } from "@/lib/moments/discovery-galleries";
import type { Locale } from "@/lib/i18n/routing";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

async function getGalleries(locale: Locale) {
  const supabase = createStaticClient();
  if (!supabase) {
    console.error("[moments] Public database client unavailable");
    return { groups: [], failed: true };
  }

  try {
    return { groups: await getDiscoveryGalleries(supabase, locale), failed: false };
  } catch (error) {
    console.error("[moments] Failed to fetch event galleries:", error);
    return { groups: [], failed: true };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "moments" });
  return generateMomentsDiscoveryMetadata(
    locale,
    t("moments"),
    t("discoveryDescription")
  );
}

export default async function MomentsDiscoveryPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [{ groups, failed }, t] = await Promise.all([
    getGalleries(locale),
    getTranslations({ locale, namespace: "moments" }),
  ]);

  const discoverySchema = generateMomentsDiscoverySchema(groups.flatMap((group) => group.moments), locale);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("moments"), url: "/moments" },
    ],
    locale
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:py-8">
      <JsonLd data={[discoverySchema, breadcrumbSchema]} />
      <MomentsDiscovery
        initialGroups={groups}
        initialHasMore={failed || groups.length >= DISCOVERY_EVENTS_PER_PAGE}
      />
    </div>
  );
}
