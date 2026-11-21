import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { OriginalText } from "@/components/ui/original-text";
import { isRentalAmenityExtra, rentalDetails, rentalDetailTranslations, roomKeys, ruleKeys, utilityKeys } from "@/lib/rentals/details";

const pilotLabels = new Map([
  ["Yoga mat", "yogaMat"], ["Sandals", "sandals"], ["Water filter", "waterFilter"],
  ["Waterfalls and hiking", "trails"], ["Cafe", "cafeNearby"], ["No drugs", "noDrugs"],
]);

export async function RentalListingFacts({ data, translation, locale, sourceLocale, pilot }: {
  data: unknown; translation?: string; locale: string; sourceLocale: string; pilot: boolean;
}) {
  const [t, p, format] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsDetails" }),
    getTranslations({ locale, namespace: "rentalsPilot" }),
    getFormatter({ locale }),
  ]);
  const details = rentalDetails(data);
  const translated = rentalDetailTranslations(translation, details.custom.length);
  type Fact = { label: string; note?: string };
  const custom = (groups: string[]) => details.custom.flatMap((item, index) => {
    if (item.group === "rooms" || !groups.includes(item.group)) return [];
    const { label, pricing } = item;
    const existing = pilot ? pilotLabels.get(label) : undefined;
    const note = typeof pricing === "number" ? new Intl.NumberFormat("vi-VN").format(pricing) + " " + t("amount") : pricing ? t(pricing) : undefined;
    return [{ label: translated[index] ?? (existing ? p(existing) : label), note, pricing }];
  });
  const customAmenities = custom(["amenities"]);
  const amenities: Fact[] = [
    ...details.amenities.map(key => ({ label: key === "wifi" ? p(key) : t(key) })),
    ...utilityKeys.flatMap(key => details.utilities[key] === "included" ? [{ label: t(key) }] : []),
    ...customAmenities.filter(item => !isRentalAmenityExtra(item.pricing)).map(({ label }) => ({ label })),
  ];
  const extras: Fact[] = [
    ...utilityKeys.flatMap(key => details.utilities[key] === "notIncluded" ? [{ label: t(key) }] : []),
    ...customAmenities.filter(item => isRentalAmenityExtra(item.pricing))
      .map(({ label, note, pricing }) => ({ label, note: typeof pricing === "number" ? note : undefined })),
  ];
  const area: Fact[] = [
    ...details.area.map(key => ({ label: key === "quiet" ? p(key) : t(key) })),
    ...custom(["area", "nearby"]),
  ];
  const rules: Fact[] = [
    ...ruleKeys.flatMap(key => details.rules[key] ? [{ label: t(key), note: t(details.rules[key]) }] : []),
    ...(details.minimumChildAge ? [{ label: details.minimumChildAge === 18 ? t("adultsOnly") : t("ageRule", { age: details.minimumChildAge }) }] : []),
    ...custom(["rules"]),
  ];
  const rooms = [
    ...roomKeys.flatMap(key => {
      const count = details.rooms[key];
      return count === undefined ? [] : [{ label: t(key), count }];
    }),
    ...details.custom.flatMap((item, index) => item.group === "rooms"
      ? [{ label: translated[index] ?? item.label, count: item.count }]
      : []),
  ];
  const groups = [["amenities", amenities], ["area", area]] as const;
  const disclosures = [[t("notIncluded"), extras], [p("rules"), rules]] as const;
  const list = (facts: Fact[]) => <ul className="list-disc space-y-1.5 ps-5">
    {facts.map(({ label, note }, index) => <li className="break-words" key={index}>
      {label}{note && <span className="text-muted-foreground"> · {note}</span>}
    </li>)}
  </ul>;
  return <>
    {rooms.length > 0 && <section className="min-w-0 space-y-2 border-t pt-4">
      <h3 className="text-base font-semibold">{t("rooms")}</h3>
      <dl className="grid grid-cols-2 gap-2">
        {rooms.map(({ label, count }, index) => <div key={index}
          className="flex min-w-0 items-start justify-between gap-2 rounded-xl bg-muted p-3 text-sm">
          <dt className="[overflow-wrap:anywhere]">{label}</dt>
          <dd className="shrink-0 font-semibold tabular-nums text-primary">{format.number(count)}</dd>
        </div>)}
      </dl>
    </section>}
    {groups.map(([key, facts]) => facts.length > 0 && <section key={key} className="min-w-0 space-y-2 border-t pt-4">
      <h3 className="text-base font-semibold">{p(key)}</h3>
      {list(facts)}
    </section>)}
    {disclosures.map(([label, facts]) => facts.length > 0 && <details key={label} className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-2">{list(facts)}</div>
    </details>)}
    {translated.some((label, index) => label !== details.custom[index].label) &&
      <OriginalText text={details.custom.map(item => item.label).join("\n")} sourceLocale={sourceLocale} />}
  </>;
}
