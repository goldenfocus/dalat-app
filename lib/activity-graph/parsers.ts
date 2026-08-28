import type {
  ActivityMediaCandidate,
  ExtractedActivity,
  FieldEvidence,
  SitemapItem,
  TicketTier,
} from "./types";

type JsonObject = Record<string, unknown>;

const LD_JSON_SCRIPT_RE =
  /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
const DALAT_UTC_OFFSET = "+07:00";
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-](\d{2}):?(\d{2}))?$/i;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (isObject(value) && typeof value["@value"] === "string") {
    return value["@value"].trim() || null;
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function typeValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  return [];
}

function hasType(value: JsonObject, type: string): boolean {
  return typeValues(value["@type"]).some(
    (item) => item.toLowerCase() === type.toLowerCase(),
  );
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isObject(value)) return [];
  const graph = Array.isArray(value["@graph"])
    ? flattenJsonLd(value["@graph"])
    : [];
  return [value, ...graph];
}

export function extractJsonLdObjects(html: string): JsonObject[] {
  const objects: JsonObject[] = [];
  for (const match of html.matchAll(LD_JSON_SCRIPT_RE)) {
    const body = match[1]
      .trim()
      .replace(/^<!--|-->$/g, "")
      .trim();
    if (!body || body.length > 1_000_000) continue;
    try {
      objects.push(...flattenJsonLd(JSON.parse(body)));
    } catch {
      // One malformed block must not suppress other valid structured blocks.
    }
  }
  return objects;
}

function absoluteUrl(value: unknown, pageUrl: string): string | null {
  const text = textValue(value);
  if (!text) return null;
  try {
    const url = new URL(text, pageUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mediaUrl(value: unknown, pageUrl: string): string | null {
  if (isObject(value)) {
    return (
      absoluteUrl(value.contentUrl, pageUrl) ??
      absoluteUrl(value.url, pageUrl) ??
      absoluteUrl(value["@id"], pageUrl)
    );
  }
  return absoluteUrl(value, pageUrl);
}

function metaImageUrl(html: string, pageUrl: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property =
      tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    if (
      !property ||
      !["og:image", "twitter:image"].includes(property.toLowerCase())
    ) {
      continue;
    }
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    const url = absoluteUrl(content, pageUrl);
    if (url) return url;
  }
  return null;
}

function eventMediaCandidates(
  item: JsonObject,
  html: string,
  pageUrl: string,
  sourceUrl: string,
  index: number,
): ActivityMediaCandidate[] {
  const advertised = Array.isArray(item.image) ? item.image : [item.image];
  const candidates = advertised
    .map((value) => mediaUrl(value, pageUrl))
    .filter((url): url is string => Boolean(url))
    .map((url, imageIndex) => ({
      url,
      role: "primary" as const,
      sourceUrl,
      locator: `jsonld:Event[${index}].image[${imageIndex}]`,
    }));
  if (candidates.length === 0) {
    const url = metaImageUrl(html, pageUrl);
    if (url) {
      candidates.push({
        url,
        role: "primary",
        sourceUrl,
        locator: "meta:og:image-or-twitter:image",
      });
    }
  }
  return [
    ...new Map(
      candidates.map((candidate) => [candidate.url, candidate]),
    ).values(),
  ].slice(0, 3);
}

function duoiTanGalleryCandidates(
  html: string,
  pageUrl: string,
): ActivityMediaCandidate[] {
  const allowedNames = new Set([
    "acoustic.webp",
    "dtad-07.webp",
    "dtad-05.webp",
    "cold-cut-2.webp",
  ]);
  const candidates: ActivityMediaCandidate[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const rawUrl =
      tag.match(/\bdata-full\s*=\s*["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const url = absoluteUrl(rawUrl, pageUrl);
    if (!url) continue;
    const name = new URL(url).pathname.split("/").pop()?.toLowerCase();
    if (!name || !allowedNames.has(name)) continue;
    const title = tag.match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    candidates.push({
      url,
      role: candidates.length === 0 ? "primary" : "gallery",
      sourceUrl: pageUrl,
      locator: `html:img[data-full*="${name}"]`,
      ...(title ? { title } : {}),
    });
  }
  return [
    ...new Map(
      candidates.map((candidate) => [candidate.url, candidate]),
    ).values(),
  ].slice(0, 4);
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

/**
 * Schema.org permits local ISO datetimes without an offset. Those values are
 * venue-local, so interpret them explicitly in Da Lat rather than allowing
 * the server process timezone to choose an instant.
 */
function parseSchemaDateTime(value: string): Date | null {
  const dateOnly = value.match(ISO_DATE_RE);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    if (!validCalendarDate(Number(year), Number(month), Number(day)))
      return null;
    return new Date(`${value}T00:00:00${DALAT_UTC_OFFSET}`);
  }

  const match = value.match(ISO_DATE_TIME_RE);
  if (!match) return null;
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = "00",
    fraction = "",
    offset,
  ] = match;
  if (
    !validCalendarDate(Number(year), Number(month), Number(day)) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    return null;
  }
  if (offset && !/^z$/i.test(offset)) {
    const offsetHour = Number(match[9]);
    const offsetMinute = Number(match[10]);
    if (
      offsetHour > 14 ||
      offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)
    ) {
      return null;
    }
  }

  const normalizedOffset = !offset
    ? DALAT_UTC_OFFSET
    : /^z$/i.test(offset)
      ? "Z"
      : `${offset.slice(0, 3)}:${offset.slice(-2)}`;
  const parsed = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${normalizedOffset}`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addressValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isObject(value)) return null;
  const parts = [
    textValue(value.streetAddress),
    textValue(value.addressLocality),
    textValue(value.addressRegion),
    textValue(value.addressCountry),
  ].filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)].join(", ") : null;
}

function compactEvidenceValue(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 320
    ? `${serialized.slice(0, 317)}...`
    : serialized;
}

function evidence(
  fieldPath: string,
  rawValue: unknown,
  locator: string,
  confidence = 100,
  normalizedValue?: unknown,
): FieldEvidence {
  return {
    fieldPath,
    rawValue,
    normalizedValue,
    evidenceText: compactEvidenceValue(rawValue),
    locator,
    confidence,
    explicit: true,
  };
}

function eventStatus(value: unknown): ExtractedActivity["eventStatus"] {
  const status = textValue(value)?.toLowerCase() ?? "";
  if (status.endsWith("eventcancelled")) return "cancelled";
  if (status.endsWith("eventpostponed")) return "postponed";
  if (status.endsWith("eventrescheduled")) return "rescheduled";
  if (status.endsWith("eventscheduled")) return "scheduled";
  return "unknown";
}

function classifyEvent(
  title: string,
  description: string | null,
): ExtractedActivity["kind"] {
  const text = `${title} ${description ?? ""}`.toLocaleLowerCase("vi");
  if (/workshop|lớp học|class|khóa học/.test(text)) return "workshop";
  if (/triển lãm|exhibition|gallery/.test(text)) return "exhibition";
  if (/chợ|market|bazaar/.test(text)) return "market";
  if (/run|trail|marathon|cycling|đạp xe|chạy bộ|thể thao/.test(text))
    return "sports";
  if (
    /concert|live|acoustic|show|biểu diễn|ca sĩ|music|âm nhạc|đêm nhạc/.test(
      text,
    )
  )
    return "performance";
  return "event";
}

function parseOffers(
  value: unknown,
  pageUrl: string,
): {
  priceType: ExtractedActivity["priceType"];
  ticketTiers: TicketTier[] | null;
  ticketUrl: string | null;
  evidenceRows: FieldEvidence[];
} {
  const offers = (Array.isArray(value) ? value : [value]).filter(isObject);
  const tiers: TicketTier[] = [];
  let ticketUrl: string | null = null;

  offers.forEach((offer) => {
    const price = numberValue(offer.price);
    const currency = textValue(offer.priceCurrency) ?? "VND";
    let isMayShuttle = false;
    try {
      isMayShuttle =
        new URL(pageUrl).hostname === "maylangthang.com.vn" &&
        currency.toUpperCase() === "VND" &&
        price === 25_000;
    } catch {
      // pageUrl has already passed the canonical URL parser; fail closed here.
      isMayShuttle = true;
    }
    if (price !== null && price >= 0 && !isMayShuttle) {
      tiers.push({
        name: textValue(offer.name) ?? `Official ticket ${tiers.length + 1}`,
        price,
        currency,
      });
    }
    ticketUrl ??= absoluteUrl(offer.url, pageUrl);
  });

  if (tiers.length === 0) {
    return { priceType: null, ticketTiers: null, ticketUrl, evidenceRows: [] };
  }
  const priceType = tiers.every((tier) => tier.price === 0) ? "free" : "paid";
  return {
    priceType,
    ticketTiers: tiers,
    ticketUrl,
    evidenceRows: [
      evidence("ticket_tiers", offers, "jsonld:Event.offers", 100, tiers),
    ],
  };
}

export function extractSchemaOrgEvents(
  html: string,
  pageUrl: string,
  sourceUpdatedAt: string | null = null,
): ExtractedActivity[] {
  const activities = extractJsonLdObjects(html)
    .filter((item) => hasType(item, "Event"))
    .flatMap((item, index): ExtractedActivity[] => {
      const title = textValue(item.name);
      const startRaw = textValue(item.startDate);
      if (!title || !startRaw) return [];

      const start = parseSchemaDateTime(startRaw);
      if (!start) return [];
      const endRaw = textValue(item.endDate);
      const end = endRaw ? parseSchemaDateTime(endRaw) : null;
      if (endRaw && !end) return [];
      if (end && end.getTime() <= start.getTime()) return [];
      const location = Array.isArray(item.location)
        ? item.location.find(isObject)
        : isObject(item.location)
          ? item.location
          : null;
      const organizer = Array.isArray(item.organizer)
        ? item.organizer.find(isObject)
        : isObject(item.organizer)
          ? item.organizer
          : null;
      const geo = location && isObject(location.geo) ? location.geo : null;
      const description = textValue(item.description);
      const sourceUrl = absoluteUrl(item.url, pageUrl) ?? pageUrl;
      const sourceUid = absoluteUrl(item["@id"], pageUrl) ?? sourceUrl;
      const locationName = location ? textValue(location.name) : null;
      const address = location ? addressValue(location.address) : null;
      const organizerName = organizer ? textValue(organizer.name) : null;
      const organizerUrl = organizer
        ? absoluteUrl(organizer.url, pageUrl)
        : null;
      const offers = parseOffers(item.offers, pageUrl);
      const status = eventStatus(item.eventStatus);
      const mediaCandidates = eventMediaCandidates(
        item,
        html,
        pageUrl,
        sourceUrl,
        index,
      );
      const evidenceRows: FieldEvidence[] = [
        evidence("title", item.name, `jsonld:Event[${index}].name`),
        evidence(
          "starts_at",
          item.startDate,
          `jsonld:Event[${index}].startDate`,
          100,
          start.toISOString(),
        ),
      ];
      if (endRaw && end && !Number.isNaN(end.getTime())) {
        evidenceRows.push(
          evidence(
            "ends_at",
            item.endDate,
            `jsonld:Event[${index}].endDate`,
            100,
            end.toISOString(),
          ),
        );
      }
      if (locationName) {
        evidenceRows.push(
          evidence(
            "location_name",
            locationName,
            `jsonld:Event[${index}].location.name`,
          ),
        );
      }
      if (address) {
        evidenceRows.push(
          evidence(
            "address",
            location?.address,
            `jsonld:Event[${index}].location.address`,
            100,
            address,
          ),
        );
      }
      if (organizerName) {
        evidenceRows.push(
          evidence(
            "organizer_name",
            organizerName,
            `jsonld:Event[${index}].organizer.name`,
          ),
        );
      }
      evidenceRows.push(...offers.evidenceRows);
      if (item.eventStatus) {
        evidenceRows.push(
          evidence(
            "event_status",
            item.eventStatus,
            `jsonld:Event[${index}].eventStatus`,
            100,
            status,
          ),
        );
      }
      if (mediaCandidates.length > 0) {
        evidenceRows.push(
          evidence(
            "media_candidates",
            mediaCandidates.map(({ url, role }) => ({ url, role })),
            mediaCandidates[0].locator,
            100,
          ),
        );
      }

      const timePrecision = /^\d{4}-\d{2}-\d{2}$/.test(startRaw)
        ? "date_only"
        : "exact";
      return [
        {
          sourceUid,
          sourceUrl,
          kind: classifyEvent(title, description),
          title,
          // Public projections use a small, original summary rather than copying
          // a publisher's full description. The source payload remains evidence.
          description: organizerName
            ? `Thông tin hoạt động chính thức từ ${organizerName}. Xem nguồn để biết chi tiết mới nhất.`
            : "Thông tin hoạt động từ nguồn chính thức. Xem nguồn để biết chi tiết mới nhất.",
          startsAt: start.toISOString(),
          endsAt:
            end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
          timezone: "Asia/Ho_Chi_Minh",
          timePrecision,
          rrule: null,
          startsAtTime: null,
          durationMinutes:
            end && !Number.isNaN(end.getTime())
              ? Math.max(
                  1,
                  Math.round((end.getTime() - start.getTime()) / 60_000),
                )
              : null,
          firstOccurrence: null,
          rruleUntil: null,
          locationName,
          address,
          latitude: geo ? numberValue(geo.latitude) : null,
          longitude: geo ? numberValue(geo.longitude) : null,
          organizerName,
          organizerUrl,
          priceType: offers.priceType,
          ticketTiers: offers.ticketTiers,
          ticketUrl: offers.ticketUrl ?? sourceUrl,
          reservationRequirement: offers.ticketUrl ? "required" : "unknown",
          publicAccess:
            status === "scheduled" && Boolean(offers.ticketUrl)
              ? "confirmed"
              : "unknown",
          sourcePublishedAt: null,
          sourceUpdatedAt,
          eventStatus: status,
          evidence: evidenceRows,
          // Retain the factual fields and advertised media references needed
          // for change detection and audit. Media remains non-public until the
          // source-level rights policy explicitly permits reuse.
          structuredPayload: {
            "@type": item["@type"],
            "@id": item["@id"],
            url: item.url,
            name: item.name,
            startDate: item.startDate,
            endDate: item.endDate,
            eventStatus: item.eventStatus,
            location: item.location,
            organizer: item.organizer,
            offers: item.offers,
            mediaCandidates,
          },
          attributes: {},
          mediaCandidates,
        },
      ];
    });

  const identityCounts = new Map<string, number>();
  for (const activity of activities) {
    identityCounts.set(
      activity.sourceUid,
      (identityCounts.get(activity.sourceUid) ?? 0) + 1,
    );
  }
  // A unique canonical @id/URL must survive a schedule correction so the
  // linked record is refreshed rather than forked. Only a page containing
  // multiple Event objects with the same identity needs the start instant as
  // a disambiguator. Exact duplicate keys are rejected fail-closed.
  const disambiguated = activities.map((activity) => ({
    ...activity,
    sourceUid:
      identityCounts.get(activity.sourceUid) === 1
        ? activity.sourceUid
        : `${activity.sourceUid}::${activity.startsAt}`,
  }));
  const keyCounts = new Map<string, number>();
  for (const activity of disambiguated) {
    keyCounts.set(
      activity.sourceUid,
      (keyCounts.get(activity.sourceUid) ?? 0) + 1,
    );
  }
  return disambiguated.filter(
    (activity) => keyCounts.get(activity.sourceUid) === 1,
  );
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

export function parseSitemap(
  xml: string,
  sourceBaseUrl: string,
  pathPrefix: string | null,
  limit: number,
): SitemapItem[] {
  const base = new URL(sourceBaseUrl);
  const items: SitemapItem[] = [];
  const seen = new Set<string>();
  const entryRe = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  for (const entry of xml.matchAll(entryRe)) {
    const locMatch = entry[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
    if (!locMatch) continue;
    let url: URL;
    try {
      url = new URL(decodeXml(locMatch[1].trim()));
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.origin !== base.origin) continue;
    if (pathPrefix && !url.pathname.startsWith(pathPrefix)) continue;
    url.hash = "";
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const lastmodMatch = entry[1].match(
      /<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i,
    );
    const lastModified = lastmodMatch?.[1]?.trim() || null;
    items.push({ url: canonical, lastModified });
    if (items.length >= limit) break;
  }
  return items;
}

function localDateInDalat(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function clock24(hour: number, minute: number, meridiem: string): string {
  let normalizedHour = hour % 12;
  if (meridiem.toLowerCase() === "pm") normalizedHour += 12;
  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

/**
 * First recurring-activity adapter. It accepts only explicit facts from the
 * first-party JSON-LD FAQ/LocalBusiness blocks; wording drift causes a safe
 * parse failure instead of an inferred schedule.
 */
export function extractDuoiTanAcoustic(
  html: string,
  pageUrl: string,
  now: Date = new Date(),
): ExtractedActivity[] {
  const objects = extractJsonLdObjects(html);
  const business = objects.find((item) =>
    ["Restaurant", "LocalBusiness", "FoodEstablishment"].some((type) =>
      hasType(item, type),
    ),
  );
  const faq = objects.find((item) => hasType(item, "FAQPage"));
  if (!business || !faq || !Array.isArray(faq.mainEntity)) return [];

  const questions = faq.mainEntity.filter(isObject);
  const answers = questions.flatMap((question) => {
    const accepted = isObject(question.acceptedAnswer)
      ? question.acceptedAnswer
      : null;
    const answer = accepted ? textValue(accepted.text) : null;
    return answer ? [{ question: textValue(question.name), answer }] : [];
  });
  const schedule = answers.find(
    ({ question, answer }) =>
      /live acoustic/i.test(`${question ?? ""} ${answer}`) &&
      /every (evening|night)/i.test(answer),
  );
  if (!schedule) return [];
  const time = schedule.answer.match(
    /(?:from\s*)?(\d{1,2}):(\d{2})\s*(am|pm)\s*(?:to|[-–])\s*(\d{1,2}):(\d{2})\s*(am|pm)/i,
  );
  if (!time) return [];

  const startsAtTime = clock24(Number(time[1]), Number(time[2]), time[3]);
  const endsAtTime = clock24(Number(time[4]), Number(time[5]), time[6]);
  const startMinutes =
    Number(startsAtTime.slice(0, 2)) * 60 + Number(startsAtTime.slice(3, 5));
  let endMinutes =
    Number(endsAtTime.slice(0, 2)) * 60 + Number(endsAtTime.slice(3, 5));
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;

  const businessName = textValue(business.name);
  const address = addressValue(business.address);
  if (!businessName || !address) return [];
  const noCover = /no (ticket|cover charge)/i.test(schedule.answer);
  const rainAnswers = answers.filter(({ question, answer }) =>
    /rain/i.test(`${question ?? ""} ${answer}`),
  );
  const rainAnswer =
    rainAnswers.find(({ answer }) =>
      /do not cancel|as usual|goes ahead|move into/i.test(answer),
    ) ?? rainAnswers[0];
  const reservationText = answers.find(({ answer }) =>
    /booking is advisable/i.test(answer),
  );
  const sourceUrl = absoluteUrl(business.url, pageUrl) ?? pageUrl;
  const mediaCandidates = duoiTanGalleryCandidates(html, pageUrl);
  const evidenceRows: FieldEvidence[] = [
    evidence("title", businessName, "jsonld:LocalBusiness.name"),
    evidence(
      "address",
      business.address,
      "jsonld:LocalBusiness.address",
      100,
      address,
    ),
    evidence(
      "rrule",
      schedule.answer,
      "jsonld:FAQPage.live-acoustic.acceptedAnswer",
      100,
      "FREQ=DAILY",
    ),
    evidence(
      "starts_at_time",
      schedule.answer,
      "jsonld:FAQPage.live-acoustic.acceptedAnswer",
      100,
      startsAtTime,
    ),
    evidence(
      "duration_minutes",
      schedule.answer,
      "jsonld:FAQPage.live-acoustic.acceptedAnswer",
      100,
      endMinutes - startMinutes,
    ),
    evidence(
      "public_access",
      schedule.answer,
      "jsonld:FAQPage.live-acoustic.acceptedAnswer",
      noCover ? 100 : 80,
      "confirmed",
    ),
  ];
  if (reservationText) {
    evidenceRows.push(
      evidence(
        "reservation_requirement",
        reservationText.answer,
        "jsonld:FAQPage.hours.acceptedAnswer",
        95,
        "recommended",
      ),
    );
  }
  if (
    rainAnswer &&
    /do not cancel|as usual|goes ahead/i.test(rainAnswer.answer)
  ) {
    evidenceRows.push(
      evidence(
        "attributes.rain_suitable",
        rainAnswer.answer,
        "jsonld:FAQPage.rain.acceptedAnswer",
        95,
        true,
      ),
    );
  }
  if (mediaCandidates.length > 0) {
    evidenceRows.push(
      evidence(
        "media_candidates",
        mediaCandidates.map(({ url, role }) => ({ url, role })),
        mediaCandidates[0].locator,
        100,
      ),
    );
  }

  return [
    {
      sourceUid: "nightly-acoustic",
      sourceUrl,
      kind: "recurring_activity",
      title: `Live Acoustic • ${businessName}`,
      description: `Nhạc acoustic trực tiếp hằng đêm tại ${businessName}. Xem nguồn chính thức để kiểm tra lịch mới nhất.`,
      startsAt: null,
      endsAt: null,
      timezone: "Asia/Ho_Chi_Minh",
      timePrecision: "recurring",
      rrule: "FREQ=DAILY",
      startsAtTime,
      durationMinutes: endMinutes - startMinutes,
      firstOccurrence: localDateInDalat(now),
      rruleUntil: null,
      locationName: businessName,
      address,
      latitude: isObject(business.geo)
        ? numberValue(business.geo.latitude)
        : null,
      longitude: isObject(business.geo)
        ? numberValue(business.geo.longitude)
        : null,
      organizerName: businessName,
      organizerUrl: sourceUrl,
      // "No cover" still requires ordering food/drink; do not mislabel it free.
      priceType: null,
      ticketTiers: null,
      ticketUrl: sourceUrl,
      reservationRequirement: reservationText ? "recommended" : "unknown",
      publicAccess: "confirmed",
      sourcePublishedAt: null,
      sourceUpdatedAt: null,
      eventStatus: "scheduled",
      evidence: evidenceRows,
      structuredPayload: {
        business: {
          "@type": business["@type"],
          name: business.name,
          url: business.url,
          address: business.address,
          geo: business.geo,
        },
        faqEvidence: answers
          .filter(({ answer }) =>
            /acoustic|booking is advisable|rain/i.test(answer),
          )
          .slice(0, 4),
        mediaCandidates,
      },
      attributes: {
        rain_suitable: Boolean(
          rainAnswer &&
          /do not cancel|as usual|goes ahead/i.test(rainAnswer.answer),
        ),
        no_cover_charge: noCover,
      },
      mediaCandidates,
    },
  ];
}
