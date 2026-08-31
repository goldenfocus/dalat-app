import { getSourceTier, getSourceTrustScore } from './source-quality';
import { getSourceByArticleUrl, NEWS_SOURCES } from './sources';
import type {
  AcceptedClaim,
  ClaimCandidate,
  ClaimExtractionSource,
  ClaimRejectionReason,
  NewsSourceProvenance,
  RejectedClaim,
  ScrapedArticle,
  VerificationMetrics,
  VerifiedClaimLedger,
  VerifiedFactGroup,
} from './types';

const MAX_EVIDENCE_WORDS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GeneratedNewsFields {
  title: string;
  storyContent: string;
  technicalContent: string;
  metaDescription: string;
  /** Other model-authored metadata such as topic, slug, keywords, and image text. */
  additionalText?: string[];
}

export type GenerationValidationCode =
  | 'missing-required-content'
  | 'unsupported-quote'
  | 'unsupported-entity'
  | 'unsupported-date'
  | 'unsupported-publisher-attribution'
  | 'unsupported-unit'
  | 'relative-date'
  | 'invented-number';

export interface GenerationValidationIssue {
  code: GenerationValidationCode;
  detail: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function normalizeClaimKey(value: string): string {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

const CLAIM_PREFIX_ALIASES: Record<string, string> = {
  accommodation: 'venue',
  business: 'venue',
  cafe: 'venue',
  homestay: 'venue',
  hostel: 'venue',
  hotel: 'venue',
  property: 'venue',
  resort: 'venue',
  restaurant: 'venue',
};

const ALLOWED_CLAIM_PREFIXES = new Set([
  'announcement', 'culture', 'economy', 'education', 'environment', 'event',
  'government', 'health', 'incident', 'organization', 'organizer', 'person',
  'place', 'policy', 'project', 'road', 'safety', 'service',
  'tourism', 'traffic', 'transport', 'venue', 'weather',
]);

const ALLOWED_CLAIM_FIELDS = new Set([
  'address', 'amount', 'area', 'attendance', 'authority', 'capacity', 'category',
  'cause', 'contact', 'cost', 'count', 'date', 'deadline', 'description',
  'distance', 'duration', 'eligibility', 'end_date', 'end_time', 'fee',
  'forecast', 'founder', 'height', 'impact', 'length', 'location', 'name', 'number',
  'opening_hours', 'operator', 'organizer', 'overflow_capacity', 'owner',
  'percentage', 'phone', 'price', 'requirement', 'route', 'schedule',
  'start_date', 'start_time', 'status', 'temperature', 'time', 'title', 'type',
  'venue', 'website', 'width',
]);

/**
 * Collapse common model-authored aliases before conflict detection. Keeping a
 * closed, deliberately broad taxonomy prevents the extractor from evading a
 * conflict by calling the same fact property.name in one source and
 * venue.name in another.
 */
export function canonicalizeClaimKey(value: string): string | null {
  const normalized = normalizeClaimKey(value);
  if (!normalized) return null;

  const segments = normalized.split('.').filter(Boolean);
  if (segments[0] === 'quote') {
    return segments.length >= 2 ? `quote.${segments.slice(1).join('.')}` : null;
  }

  const prefix = CLAIM_PREFIX_ALIASES[segments[0]] ?? segments[0];
  if (!ALLOWED_CLAIM_PREFIXES.has(prefix) || segments.length < 2) return null;

  let field = segments.slice(1).join('_');
  if (prefix === 'event') {
    if (field === 'date' || field === 'startdate') field = 'start_date';
    if (field === 'enddate') field = 'end_date';
  }
  if (prefix === 'venue' && field === 'title') field = 'name';
  if (field === 'openinghours') field = 'opening_hours';
  if (field === 'starttime') field = 'start_time';
  if (field === 'endtime') field = 'end_time';
  if (field === 'max_guests' || field === 'maximum_guests' || field === 'max_capacity') {
    field = 'capacity';
  }

  return ALLOWED_CLAIM_FIELDS.has(field) ? `${prefix}.${field}` : null;
}

export function normalizeClaimValue(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^["“”]+|["“”]+$/g, '')
    .replace(/[.。]+$/u, '')
    .trim();
}

export function countEvidenceWords(fragment: string): number {
  return fragment.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/**
 * Evidence matching deliberately has no semantic/fuzzy step. The only
 * allowances are Unicode normalization, case, and collapsed whitespace.
 */
export function evidenceAppearsInSource(fragment: string, sourceText: string): boolean {
  const normalizedFragment = normalizeText(fragment).toLowerCase();
  const normalizedSource = normalizeText(sourceText).toLowerCase();
  return normalizedFragment.length > 0 && normalizedSource.includes(normalizedFragment);
}

function valueAppearsAsCompletePhrase(value: string, evidenceFragment: string): boolean {
  const normalizedValue = normalizeSemanticText(value);
  const normalizedEvidence = normalizeSemanticText(evidenceFragment);
  if (!normalizedValue || !normalizedEvidence) return false;
  const pattern = escapeRegExp(normalizedValue).replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|\\s)${pattern}(?=$|\\s)`, 'u').test(normalizedEvidence);
}

type ClaimRelationshipField = 'owner' | 'operator' | 'organizer' | 'authority' | 'founder';

const CLAIM_RELATIONSHIP_FIELDS = new Set<ClaimRelationshipField>([
  'owner', 'operator', 'organizer', 'authority', 'founder',
]);

const CLAIM_NEGATION_OR_DENIAL = /\b(?:not|no|never|isn\s+t|wasn\s+t|doesn\s+t|didn\s+t|cannot|can\s+t|deny|denies|denied|denying|refute|refuted|dispute|disputed|false|khong|chang|chua|phu\s+nhan|bac\s+bo|tranh\s+cai)\b/u;
const CLAIM_UNCERTAINTY_OR_HISTORICAL = /\b(?:alleged|allegedly|reportedly|purported|purportedly|suspected|supposedly|claim|claims|claimed|may|might|could|can|would|should|if|unless|perhaps|likely|unlikely|possible|possibly|improbable|doubt|doubts|doubted|doubtful|whether|unclear|uncertain|unconfirmed|possibility|theory|hypothesis|rumor|rumour|speculation|speculative|suggest|suggests|suggested|appears|seems|believed|under\s+review|being\s+reviewed|expected|former|previous|ex|nghi\s+van|bi\s+cao\s+buoc|duoc\s+cho\s+la|co\s+the|chua\s+ro|khong\s+ro|neu|kha\s+nang|cuu|truoc\s+day)\b/u;

// Every fixed renderer label needs evidence for its semantic field, not merely
// a matching value. These deliberately conservative English/Vietnamese cues
// trade recall for factual safety; unmapped fields fail closed.
const CLAIM_FIELD_EVIDENCE_PATTERNS: Record<string, RegExp> = {
  address: /\b(?:address|located\s+at|dia\s+chi|toa\s+lac|tai)\b/u,
  amount: /\b(?:amount|total|sum|value|tong|so\s+tien|gia\s+tri|doanh\s+thu|ti|trieu|dong|vnd|usd|eur|gbp)\b|[$€£₫]/u,
  area: /\b(?:area|square\s+meters?|hectares?|acre|dien\s+tich|m2|ha)\b/u,
  attendance: /\b(?:attendance|attended|participants?|visitors?|guests?|spectators?|nguoi\s+tham\s+du|khach|luot\s+(?:nguoi|khach))\b/u,
  capacity: /\b(?:capacity|accommodates?|admits?|seats?|guests?|suc\s+chua|cho\s+ngoi|toi\s+da)\b/u,
  category: /\b(?:category|classified|classification|hang\s+muc|phan\s+loai|loai)\b/u,
  cause: /\b(?:cause|caused|because|due\s+to|reason|resulted\s+from|nguyen\s+nhan|do|vi)\b/u,
  contact: /\b(?:contact|email|phone|telephone|lien\s+he|hotline)\b/u,
  cost: /\b(?:cost|costs|priced|price|chi\s+phi|gia|vnd|usd|eur|gbp)\b|[$€£₫]/u,
  count: /\b(?:count|total|number\s+of|recorded|tong|so\s+luong|co)\b/u,
  date: /\b(?:date|dated|on\s+\d|scheduled|takes\s+place|ngay|dien\s+ra|to\s+chuc)\b/u,
  deadline: /\b(?:deadline|no\s+later\s+than|applications?\s+close|han|han\s+chot|cham\s+nhat)\b/u,
  description: /[a-z0-9]/u,
  distance: /\b(?:distance|away|kilometers?|kilometres?|\d\s*km|khoang\s+cach|cach)\b/u,
  duration: /\b(?:duration|lasts?|lasting|for\s+\d|hours?|minutes?|days?|thoi\s+luong|keo\s+dai)\b/u,
  eligibility: /\b(?:eligible|eligibility|open\s+to|qualif|du\s+dieu\s+kien|doi\s+tuong)\b/u,
  end_date: /\b(?:end\s+date|ends?|through|until|to\s+\d|ket\s+thuc|den\s+ngay|het\s+ngay)\b/u,
  end_time: /\b(?:end\s+time|ends?|until|closes?|ket\s+thuc|den\s+luc|dong\s+cua)\b/u,
  fee: /\b(?:fee|charge|admission|ticket|phi|le\s+phi|ve|vnd|usd|eur|gbp)\b|[$€£₫]/u,
  forecast: /\b(?:forecast|predicted|prediction|expected|du\s+bao|du\s+kien)\b/u,
  height: /\b(?:height|high|meters?\s+tall|metres?\s+tall|chieu\s+cao|cao)\b/u,
  impact: /\b(?:impact|affect|effect|result|consequence|anh\s+huong|tac\s+dong|hau\s+qua)\b/u,
  length: /\b(?:length|long|kilometers?|kilometres?|meters?|metres?|chieu\s+dai|dai)\b/u,
  location: /\b(?:location|located|held\s+at|takes\s+place\s+at|venue|dia\s+diem|tai|o)\b/u,
  name: /\b(?:name|named|called|known\s+as|ten|homestay|hotel|resort|hostel|cafe|restaurant|company|association|museum|university)\b/u,
  number: /\b(?:number|total|count|figure|so\s+luong|tong|con\s+so)\b/u,
  opening_hours: /\b(?:opening\s+hours|open\s+from|opens?|closes?|hours|gio\s+mo\s+cua|mo\s+cua|dong\s+cua)\b/u,
  overflow_capacity: /\b(?:overflow\s+capacity|additional\s+capacity|extra\s+guests?|suc\s+chua\s+bo\s+sung|cho\s+bo\s+sung)\b/u,
  percentage: /\b(?:percent|percentage|ty\s+le|phan\s+tram)\b|%/u,
  phone: /\b(?:phone|telephone|tel|hotline|dien\s+thoai|lien\s+he)\b/u,
  price: /\b(?:price|priced|cost|admission|ticket|gia|gia\s+ve|vnd|usd|eur|gbp)\b|[$€£₫]/u,
  requirement: /\b(?:requirement|required|must|need\s+to|yeu\s+cau|bat\s+buoc|can)\b/u,
  route: /\b(?:route|runs?\s+from|between|via|tuyen|lo\s+trinh|di\s+qua)\b/u,
  schedule: /\b(?:schedule|scheduled|timetable|program|chuong\s+trinh|lich|lich\s+trinh)\b/u,
  start_date: /\b(?:start\s+date|event\s+date|event\s+is\s+on|starts?|begins?|from\s+\d|opens?\s+on|scheduled|takes\s+place|bat\s+dau|tu\s+ngay|dien\s+ra|ngay)\b/u,
  start_time: /\b(?:start\s+time|starts?|begins?|at\s+\d|opens?\s+at|bat\s+dau|luc|gio)\b/u,
  status: /\b(?:status|cancelled|canceled|postponed|rescheduled|confirmed|approved|open|closed|ongoing|completed|tinh\s+trang|trang\s+thai|huy|hoan|xac\s+nhan|phe\s+duyet|dang\s+dien\s+ra|ket\s+thuc)\b/u,
  temperature: /\b(?:temperature|degrees?|celsius|fahrenheit|nhiet\s+do|do\s+c|°)\b/u,
  time: /\b(?:time|at\s+\d|hours?|gio|luc)\b/u,
  title: /\b(?:title|titled|headline|chu\s+de|tieu\s+de|ten)\b/u,
  type: /\b(?:type|kind|category|loai|hinh\s+thuc)\b/u,
  venue: /\b(?:venue|is\s+at|held\s+at|takes\s+place\s+at|location|dia\s+diem|tai|o)\b/u,
  website: /\b(?:website|site|official\s+page|web|trang\s+web|http|www)\b/u,
  width: /\b(?:width|wide|meters?\s+wide|metres?\s+wide|chieu\s+rong|rong)\b/u,
};

const CLAIM_PREFIX_EVIDENCE_PATTERNS: Record<string, RegExp> = {
  announcement: /\b(?:announcement|announced|notice|statement|thong\s+bao|cong\s+bo)\b/u,
  culture: /\b(?:culture|cultural|heritage|art|music|van\s+hoa|di\s+san|nghe\s+thuat|am\s+nhac)\b/u,
  economy: /\b(?:economy|economic|business|market|kinh\s+te|doanh\s+nghiep|doanh\s+thu|thi\s+truong)\b/u,
  education: /\b(?:education|school|student|university|giao\s+duc|truong|hoc\s+sinh|sinh\s+vien)\b/u,
  environment: /\b(?:environment|environmental|pollution|forest|moi\s+truong|o\s+nhiem|rung)\b/u,
  event: /\b(?:event|festival|concert|race|exhibition|workshop|ceremony|su\s+kien|le\s+hoi|buoi\s+hoa\s+nhac|cuoc\s+dua|trien\s+lam|hoi\s+thao)\b/u,
  government: /\b(?:government|authority|department|committee|province|city|chinh\s+quyen|so|uy\s+ban|tinh|thanh\s+pho)\b/u,
  health: /\b(?:health|hospital|medical|disease|y\s+te|benh\s+vien|suc\s+khoe|benh)\b/u,
  incident: /\b(?:incident|accident|fire|crash|collision|flood|landslide|su\s+co|tai\s+nan|hoa\s+hoan|vu\s+viec|lu\s+lut|sat\s+lo)\b/u,
  organization: /\b(?:organization|organisation|company|association|foundation|committee|agency|to\s+chuc|cong\s+ty|hiep\s+hoi|quy|uy\s+ban|co\s+quan)\b/u,
  organizer: /\b(?:organizer|organiser|host|ban\s+to\s+chuc|don\s+vi\s+to\s+chuc)\b/u,
  person: /\b(?:person|man|woman|mr|mrs|ms|ong|ba|anh|chi|nguoi)\b/u,
  place: /\b(?:place|location|area|city|district|ward|village|lake|mountain|park|dia\s+diem|khu\s+vuc|thanh\s+pho|huyen|phuong|xa|ho|nui|cong\s+vien)\b/u,
  policy: /\b(?:policy|rule|regulation|decision|chinh\s+sach|quy\s+dinh|quyet\s+dinh)\b/u,
  project: /\b(?:project|development|construction|du\s+an|cong\s+trinh|xay\s+dung)\b/u,
  road: /\b(?:road|street|highway|route|duong|quoc\s+lo|tinh\s+lo)\b/u,
  safety: /\b(?:safety|safe|warning|risk|an\s+toan|canh\s+bao|rui\s+ro)\b/u,
  service: /\b(?:service|facility|program|dich\s+vu|tien\s+ich|chuong\s+trinh)\b/u,
  tourism: /\b(?:tourism|tourist|visitor|travel|du\s+lich|du\s+khach|tham\s+quan)\b/u,
  traffic: /\b(?:traffic|congestion|vehicle|giao\s+thong|un\s+tac|phuong\s+tien)\b/u,
  transport: /\b(?:transport|bus|train|flight|airport|transit|van\s+tai|xe\s+buyt|tau|chuyen\s+bay|san\s+bay)\b/u,
  venue: /\b(?:venue|property|homestay|hotel|resort|hostel|cafe|restaurant|museum|park|lake|mountain|dia\s+diem|co\s+so|khach\s+san|nha\s+hang|bao\s+tang|cong\s+vien|ho|nui)\b/u,
  weather: /\b(?:weather|rain|temperature|storm|forecast|thoi\s+tiet|mua|nhiet\s+do|bao|du\s+bao)\b/u,
};

function normalizeSemanticText(value: string): string {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FACT_VALUE_MARKER = 'factvalue';

function normalizedDateMention(rawClause: string, isoDate: string): string | null {
  const patterns = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/gu,
    /\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/gu,
    /\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/gu,
    /\b[A-Za-z]+\s+\d{1,2}(?:,)?\s+\d{4}\b/gu,
  ];
  for (const pattern of patterns) {
    for (const match of rawClause.matchAll(pattern)) {
      if (extractCanonicalDates(match[0]).has(isoDate)) {
        return normalizeSemanticText(match[0]);
      }
    }
  }
  return null;
}

function valueBearingEvidenceClauses(
  normalizedKey: string,
  value: string,
  evidenceFragment: string
): string[] {
  const normalizedValue = normalizeSemanticText(value);
  const isoDate = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
  return evidenceFragment
    // Treat punctuation between digits as part of a Vietnamese number or
    // date (16,46; 45.600; 12.09), not as a clause boundary.
    .split(/(?:(?<!\d)[.!?;:,]|[.!?;:,](?!\d)|[\r\n]+|\b(?:but|while|whereas|however|although|and|nhung|trong\s+khi|tuy\s+nhien|va)\b)/iu)
    .map((rawClause) => ({ rawClause, clause: normalizeSemanticText(rawClause) }))
    .filter(({ clause }) => Boolean(clause))
    .flatMap(({ rawClause, clause }) => {
      const exactPattern = new RegExp(
        `(?:^|\\s)(${escapeRegExp(normalizedValue).replace(/\s+/g, '\\s+')})(?=$|\\s)`,
        'u'
      );
      if (exactPattern.test(clause)) {
        return [clause.replace(exactPattern, (match, captured: string) => (
          match.replace(captured, FACT_VALUE_MARKER)
        ))];
      }
      if (isoDate && /(?:^|\.)[a-z_]*date$/u.test(normalizedKey)) {
        const dateMention = normalizedDateMention(rawClause, isoDate);
        if (dateMention) return [clause.replace(dateMention, FACT_VALUE_MARKER)];
      }
      return [];
    });
}

function templateMatches(clause: string, templates: string[]): boolean {
  return templates.some((template) => new RegExp(template, 'u').test(clause));
}

/**
 * Find every complete source statement containing the exact evidence fragment.
 * Semantic safety is evaluated on these statements, not only on the substring
 * selected by the model: otherwise `the event was cancelled` could be lifted
 * out of `Officials denied the event was cancelled` and invert the source.
 */
function sourceContextsForEvidence(
  evidenceFragment: string,
  ...sourceRegions: string[]
): string[] {
  const contexts = new Set<string>();
  for (const region of sourceRegions) {
    // Keep commas and colons inside the context because denial/uncertainty in a
    // leading clause can govern the evidence after it. Hard sentence endings
    // are safe boundaries and remain attached for question detection.
    const statements = region
      .split(/(?<=[.!?;])(?:\s+|$)|[\r\n]+/u)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      if (evidenceAppearsInSource(evidenceFragment, statement)) {
        contexts.add(statement);
      }
    }

    // Sentence splitting can mistake abbreviations such as `Mr.` or `Dr.` for
    // a boundary. Also inspect a bounded word window around every exact match
    // so a nearby denial cannot be hidden behind that punctuation.
    const normalizedRegion = normalizeText(region);
    const normalizedFragment = normalizeText(evidenceFragment);
    const haystack = normalizedRegion.toLowerCase();
    const needle = normalizedFragment.toLowerCase();
    let searchFrom = 0;
    while (needle && searchFrom <= haystack.length - needle.length) {
      const matchAt = haystack.indexOf(needle, searchFrom);
      if (matchAt < 0) break;
      const before = normalizedRegion.slice(0, matchAt).trim().split(/\s+/u).filter(Boolean).slice(-24);
      const matched = normalizedRegion.slice(matchAt, matchAt + needle.length);
      const after = normalizedRegion.slice(matchAt + needle.length).trim().split(/\s+/u).filter(Boolean).slice(0, 24);
      contexts.add([...before, matched, ...after].join(' '));
      searchFrom = matchAt + Math.max(needle.length, 1);
    }
  }
  return [...contexts];
}

function evidenceContextsAreSemanticallySafe(
  normalizedKey: string,
  contexts: string[]
): boolean {
  if (contexts.length === 0) return false;
  const field = normalizedKey.split('.').at(-1);
  return contexts.every((context) => {
    const normalizedContext = normalizeSemanticText(context);
    if (
      context.includes('?')
      || /^(?:did|does|do|is|are|was|were|can|could|may|might|would|will|whether|what|when|where|who|why|how|co\s+phai|lieu)\b/u.test(normalizedContext)
    ) return false;
    if (CLAIM_NEGATION_OR_DENIAL.test(normalizedContext)) return false;
    if (field !== 'forecast' && CLAIM_UNCERTAINTY_OR_HISTORICAL.test(normalizedContext)) {
      return false;
    }
    return true;
  });
}

function claimFieldTemplateIsSupported(
  prefix: string,
  field: string,
  markedClause: string,
  normalizedValue: string
): boolean {
  const prefixPattern = CLAIM_PREFIX_EVIDENCE_PATTERNS[prefix];
  const fieldPattern = CLAIM_FIELD_EVIDENCE_PATTERNS[field];
  if (!prefixPattern || !fieldPattern) return false;
  const subject = prefixPattern.source;
  const cue = fieldPattern.source;
  const value = `\\b${FACT_VALUE_MARKER}\\b`;
  const gap = '(?:\\s+[a-z0-9]+){0,2}\\s+';

  if (field === 'name' || field === 'title') {
    if (markedClause === FACT_VALUE_MARKER && prefixPattern.test(normalizedValue)) return true;
    return templateMatches(markedClause, [
      `${subject}${gap}(?:name|title)\\s+(?:is\\s+|la\\s+)?${value}`,
      `${subject}${gap}(?:named|called|titled|known\\s+as|ten\\s+la)\\s+${value}`,
      `\\b(?:name|title|ten)${gap}${subject}\\s+(?:is\\s+|la\\s+)?${value}`,
      `${value}\\s+(?:is|was|la)${gap}${subject}`,
    ]);
  }

  if (field === 'cause') {
    return templateMatches(markedClause, [
      `${subject}${gap}(?:was\\s+|is\\s+)?(?:caused\\s+by|due\\s+to|because\\s+of|resulted\\s+from|do|vi)\\s+${value}`,
      `\\b(?:cause|reason|nguyen\\s+nhan)${gap}${subject}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
      `${value}\\s+(?:directly\\s+)?(?:caused|triggered|led\\s+to|resulted\\s+in|gay\\s+ra)${gap}${subject}`,
    ]);
  }

  if (field === 'status') {
    return templateMatches(markedClause, [
      `${subject}\\s+(?:is|was|remains|became|has\\s+been|had\\s+been|da|dang|van|bi|duoc)\\s+${value}`,
      `\\b(?:status|tinh\\s+trang|trang\\s+thai)${gap}${subject}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
      `${value}\\s+${subject}`,
    ]);
  }

  if (field === 'venue' || field === 'location' || field === 'address') {
    return templateMatches(markedClause, [
      `${subject}${gap}(?:is|was|held|located|takes\\s+place)\\s+(?:at|in)\\s+${value}`,
      `${subject}${gap}(?:dien\\s+ra|to\\s+chuc)\\s+(?:tai|o)\\s+${value}`,
      `\\b(?:venue|location|address|dia\\s+diem|dia\\s+chi)${gap}${subject}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
    ]);
  }

  if (field === 'date' || field.endsWith('_date')) {
    const phase = field.startsWith('end_')
      ? '(?:ends?|until|through|ket\\s+thuc|den\\s+ngay)'
      : '(?:starts?|begins?|on|scheduled\\s+for|takes\\s+place\\s+on|bat\\s+dau|tu\\s+ngay|dien\\s+ra\\s+ngay|ngay)';
    const dateCue = field.startsWith('end_')
      ? '(?:end\\s+date|ending\\s+date|ngay\\s+ket\\s+thuc)'
      : '(?:date|event\\s+date|start\\s+date|starting\\s+date|ngay\\s+bat\\s+dau)';
    return templateMatches(markedClause, [
      `${subject}${gap}${phase}\\s+${value}`,
      `${subject}${gap}${dateCue}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
      `\\b(?:date|start\\s+date|end\\s+date|ngay)${gap}${subject}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
      `${value}${gap}${subject}`,
    ]);
  }

  if (field === 'time' || field.endsWith('_time')) {
    const phase = field.startsWith('end_')
      ? '(?:ends?|until|closes?|ket\\s+thuc|den\\s+luc|dong\\s+cua)'
      : '(?:starts?|begins?|at|opens?\\s+at|bat\\s+dau|luc|gio)';
    const timeCue = field.startsWith('end_')
      ? '(?:end\\s+time|closing\\s+time|gio\\s+ket\\s+thuc)'
      : '(?:time|event\\s+time|start\\s+time|starting\\s+time|gio\\s+bat\\s+dau)';
    return templateMatches(markedClause, [
      `${subject}${gap}${phase}\\s+${value}`,
      `${subject}${gap}${timeCue}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
      `\\b(?:time|start\\s+time|end\\s+time|gio)${gap}${subject}\\s+(?:is\\s+|was\\s+|la\\s+)?${value}`,
      `${value}${gap}${subject}`,
    ]);
  }

  // Quantities and other low-ambiguity fields still require subject, field cue,
  // and exact value to be adjacent in one of a small set of declarative forms.
  return templateMatches(markedClause, [
    `${subject}${gap}${cue}${gap}(?:is\\s+|was\\s+|of\\s+|at\\s+|la\\s+)?${value}`,
    `${cue}${gap}${subject}${gap}(?:is\\s+|was\\s+|of\\s+|at\\s+|la\\s+)?${value}`,
    `${subject}${gap}${value}${gap}${cue}`,
    `${value}${gap}${cue}${gap}${subject}`,
  ]);
}

const STRICT_DIRECTIONAL_CLAIM_FIELDS = new Set([
  'address', 'cause', 'date', 'end_date', 'end_time', 'location', 'name',
  'start_date', 'start_time', 'status', 'time', 'title', 'venue',
]);

/**
 * A value merely appearing in a fragment does not prove the model-selected
 * relationship key. Require explicit directional wording around that exact
 * value before a fixed label such as "Venue owner" can be published.
 */
export function claimKeyIsSupportedByEvidence(
  normalizedKey: string,
  value: string,
  evidenceFragment: string
): boolean {
  if (normalizedKey.startsWith('quote.')) {
    const normalizedQuoteValue = normalizeClaimValue(value);
    return extractDirectQuotes(evidenceFragment)
      .some((quote) => normalizeClaimValue(quote) === normalizedQuoteValue);
  }
  const completeEvidence = normalizeSemanticText(evidenceFragment);
  if (
    evidenceFragment.includes('?')
    || /^(?:did|does|do|is|are|was|were|can|could|may|might|would|will|whether|what|when|where|who|why|how|co\s+phai|lieu)\b/u.test(completeEvidence)
  ) return false;
  const field = normalizedKey.split('.').at(-1);
  if (!field) return false;
  const isRelationshipField = CLAIM_RELATIONSHIP_FIELDS.has(field as ClaimRelationshipField);
  const prefix = normalizedKey.split('.')[0];
  const clauses = valueBearingEvidenceClauses(normalizedKey, value, evidenceFragment);
  const normalizedValue = normalizeSemanticText(value);
  if (clauses.length === 0 || !normalizedValue) return false;
  const valuePattern = FACT_VALUE_MARKER;
  const patterns: Record<ClaimRelationshipField, string[]> = {
    owner: [
      `${valuePattern}\\s+(?:is|was)\\s+(?:the\\s+)?(?:venue\\s+|property\\s+)?(?:owner|proprietor)\\b`,
      `${valuePattern}\\s+(?:owns?|owned|so huu)\\b`,
      `\\b(?:owned\\s+by|owner|proprietor|chu\\s+so\\s+huu|chu\\s+nhan|thuoc\\s+so\\s+huu\\s+cua)\\s+(?:is\\s+|la\\s+|cua\\s+)?${valuePattern}\\b`,
      `\\b${valuePattern}\\s+(?:la|chinh\\s+la)\\s+chu\\s+(?:so\\s+huu|nhan)\\b`,
    ],
    operator: [
      `${valuePattern}\\s+(?:operates?|manages?|runs?|van\\s+hanh|quan\\s+ly|dieu\\s+hanh)\\b`,
      `\\b(?:operated|managed|run)\\s+by\\s+${valuePattern}\\b`,
      `\\b(?:operator|manager|don\\s+vi\\s+van\\s+hanh|don\\s+vi\\s+quan\\s+ly)\\s+(?:is\\s+|la\\s+)?${valuePattern}\\b`,
      `\\b(?:do|boi)\\s+${valuePattern}\\s+(?:van\\s+hanh|quan\\s+ly|dieu\\s+hanh)\\b`,
    ],
    organizer: [
      `${valuePattern}\\s+(?:(?:is|was)\\s+(?:the\\s+)?(?:event\\s+)?organizer|organizes?|hosts?|to\\s+chuc|chu\\s+tri)\\b`,
      `\\b(?:organized|organised|hosted)\\s+by\\s+${valuePattern}\\b`,
      `\\b(?:organizer|organiser|ban\\s+to\\s+chuc|don\\s+vi\\s+to\\s+chuc)\\s+(?:is\\s+|la\\s+)?${valuePattern}\\b`,
      `\\b(?:do|boi)\\s+${valuePattern}\\s+(?:to\\s+chuc|chu\\s+tri)\\b`,
    ],
    authority: [
      `${valuePattern}\\s+(?:(?:is|was)\\s+(?:the\\s+)?(?:responsible\\s+)?authority|leads?|chu\\s+tri|phe\\s+duyet)\\b`,
      `\\b(?:led|approved|overseen)\\s+by\\s+${valuePattern}\\b`,
      `\\b(?:authority|co\\s+quan\\s+chu\\s+tri|co\\s+quan\\s+co\\s+tham\\s+quyen)\\s+(?:is\\s+|la\\s+)?${valuePattern}\\b`,
    ],
    founder: [
      `${valuePattern}\\s+(?:(?:is|was)\\s+(?:the\\s+)?founder|founded|sang\\s+lap)\\b`,
      `\\b(?:founded|established)\\s+by\\s+${valuePattern}\\b`,
      `\\b(?:founder|nguoi\\s+sang\\s+lap)\\s+(?:is\\s+|la\\s+)?${valuePattern}\\b`,
    ],
  };

  return clauses.some((clause) => {
    if (CLAIM_NEGATION_OR_DENIAL.test(clause)) return false;
    if (field !== 'forecast' && CLAIM_UNCERTAINTY_OR_HISTORICAL.test(clause)) return false;
    const prefixPattern = CLAIM_PREFIX_EVIDENCE_PATTERNS[prefix];
    const fieldPattern = CLAIM_FIELD_EVIDENCE_PATTERNS[field];
    const prefixSupported = prefixPattern?.test(clause)
      || prefixPattern?.test(completeEvidence)
      || false;
    if (!prefixSupported) return false;
    if (!isRelationshipField) {
      // For non-directional atomic fields, an exact short source fragment with
      // the subject family, field cue, and verbatim value is sufficient. The
      // surrounding source statement has already passed the denial and
      // uncertainty checks above. Directional fields keep their stricter
      // word-order templates so names, causes, locations, dates, and statuses
      // cannot be attached to the wrong subject.
      if (!STRICT_DIRECTIONAL_CLAIM_FIELDS.has(field)) {
        return fieldPattern?.test(completeEvidence) ?? false;
      }
      return claimFieldTemplateIsSupported(prefix, field, clause, normalizedValue);
    }
    return patterns[field as ClaimRelationshipField]
      .some((pattern) => new RegExp(pattern, 'u').test(clause));
  });
}

const RELATIVE_DATE_PATTERNS: RegExp[] = [
  /\b(today|tonight|yesterday|tomorrow|now|currently|recently|soon)\b/giu,
  /\b(this|next|last)\s+(morning|afternoon|evening|night|day|week|weekend|month|year)\b/giu,
  /\b(this|next|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/giu,
  /\b(earlier|later)\s+(today|this\s+(week|month|year))\b/giu,
  /\b(in|over)\s+the\s+(coming|next|past|previous)\s+(days?|weeks?|months?|years?)\b/giu,
];

export function findRelativeDatePhrases(value: string): string[] {
  const matches = new Set<string>();
  for (const pattern of RELATIVE_DATE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      matches.add(match[0]);
    }
  }
  return [...matches];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Convert untrusted model JSON into candidates; acceptance happens separately. */
export function parseClaimCandidates(value: unknown): ClaimCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.claims)) return [];

  return value.claims.map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      sourceIndex: Number(record.source_index ?? record.sourceIndex),
      key: typeof record.normalized_key === 'string'
        ? record.normalized_key
        : typeof record.key === 'string'
          ? record.key
          : '',
      value: typeof record.normalized_value === 'string'
        ? record.normalized_value
        : typeof record.value === 'string'
          ? record.value
          : '',
      confidence: Number(record.confidence),
      evidenceFragment: typeof record.evidence_fragment === 'string'
        ? record.evidence_fragment
        : typeof record.evidenceFragment === 'string'
          ? record.evidenceFragment
          : '',
    };
  });
}

export function createClaimExtractionSources(
  articles: ScrapedArticle[],
  fallbackRetrievedAt: string
): ClaimExtractionSource[] {
  return articles.map((article, index) => {
    const registeredSource = getSourceByArticleUrl(article.sourceUrl);
    const hasRegisteredIdentity = registeredSource?.id === article.sourceId;

    return {
      sourceIndex: index + 1,
      sourceId: article.sourceId,
      sourceUrl: article.sourceUrl,
      // A persisted display name cannot manufacture an independent publisher.
      // Only an exact source-id + origin match receives the registry identity
      // and trust tier; anything else remains usable for review as Tier E.
      publisher: hasRegisteredIdentity ? registeredSource.name : article.sourceName,
      tier: hasRegisteredIdentity ? getSourceTier(article.sourceId) : 'E',
      title: normalizeText(article.title),
      text: article.content,
      publishedAt: article.publishedAt,
      retrievedAt: article.retrievedAt || fallbackRetrievedAt,
    };
  });
}

function rejected(
  candidate: ClaimCandidate,
  reason: ClaimRejectionReason,
  detail: string
): RejectedClaim {
  return { candidate, reason, detail };
}

const MONTH_NUMBERS: Record<string, string> = {
  january: '1', jan: '1', february: '2', feb: '2', march: '3', mar: '3',
  april: '4', apr: '4', may: '5', june: '6', jun: '6', july: '7', jul: '7',
  august: '8', aug: '8', september: '9', sep: '9', sept: '9', october: '10', oct: '10',
  november: '11', nov: '11', december: '12', dec: '12',
};

function canonicalDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > new Date().getUTCFullYear() + 1 || month < 1 || month > 12) {
    return null;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractCanonicalDates(value: string): Set<string> {
  const dates = new Set<string>();
  for (const match of value.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/gu)) {
    const date = canonicalDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) dates.add(date);
  }
  for (const match of value.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/gu)) {
    const date = canonicalDate(Number(match[3]), Number(match[2]), Number(match[1]));
    if (date) dates.add(date);
  }
  for (const match of value.toLowerCase().matchAll(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/gu)) {
    const month = MONTH_NUMBERS[match[2]];
    const date = month && canonicalDate(Number(match[3]), Number(month), Number(match[1]));
    if (date) dates.add(date);
  }
  for (const match of value.toLowerCase().matchAll(/\b([a-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})\b/gu)) {
    const month = MONTH_NUMBERS[match[1]];
    const date = month && canonicalDate(Number(match[3]), Number(month), Number(match[2]));
    if (date) dates.add(date);
  }
  return dates;
}

function sourceFreshness(source: ClaimExtractionSource, now: Date): number {
  const publishedTime = source.publishedAt ? Date.parse(source.publishedAt) : NaN;
  const retrievedTime = Date.parse(source.retrievedAt);
  const timestamp = Number.isFinite(publishedTime) ? publishedTime : retrievedTime;
  if (!Number.isFinite(timestamp)) return 0;

  const ageDays = Math.max(0, (now.getTime() - timestamp) / DAY_MS);
  let score: number;
  if (ageDays <= 7) score = 1;
  else if (ageDays <= 30) score = 0.9;
  else if (ageDays <= 90) score = 0.75;
  else if (ageDays <= 365) score = 0.5;
  else score = 0.25;

  // A retrieval time proves when we saw a page, not when its claim was current.
  return Number.isFinite(publishedTime) ? score : score * 0.6;
}

function buildFactGroups(claims: AcceptedClaim[]): VerifiedFactGroup[] {
  const groups = new Map<string, AcceptedClaim[]>();
  for (const claim of claims) {
    const groupKey = `${claim.normalizedKey}\u0000${claim.normalizedValue}`;
    const group = groups.get(groupKey) ?? [];
    group.push(claim);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .sort((a, b) => {
      const keyOrder = a[0].normalizedKey.localeCompare(b[0].normalizedKey);
      return keyOrder || a[0].normalizedValue.localeCompare(b[0].normalizedValue);
    })
    .map((group, index) => ({
      id: `fact-${index + 1}`,
      normalizedKey: group[0].normalizedKey,
      normalizedValue: group[0].normalizedValue,
      value: group[0].value,
      claimIds: group.map((claim) => claim.id),
      sourceIndexes: [...new Set(group.map((claim) => claim.sourceIndex))].sort((a, b) => a - b),
      sourceUrls: [...new Set(group.map((claim) => claim.sourceUrl))],
      confidence: group.reduce((sum, claim) => sum + claim.confidence, 0) / group.length,
    }));
}

function calculateMetrics(
  acceptedClaims: AcceptedClaim[],
  rejectedClaims: RejectedClaim[],
  factGroups: VerifiedFactGroup[],
  candidateCount: number,
  sources: ClaimExtractionSource[],
  now: Date
): VerificationMetrics {
  const usedSourceIndexes = [...new Set(acceptedClaims.map((claim) => claim.sourceIndex))];
  const usedSources = usedSourceIndexes
    .map((sourceIndex) => sources[sourceIndex - 1])
    .filter((source): source is ClaimExtractionSource => Boolean(source));

  const sourceQuality = usedSources.length > 0
    ? usedSources.reduce((sum, source) => sum + getSourceTrustScore(source.tier), 0) / usedSources.length
    : 0;
  const acceptedById = new Map(acceptedClaims.map((claim) => [claim.id, claim]));
  const corroboration = factGroups.length > 0
    ? factGroups.filter((group) => {
      const groupClaims = group.claimIds
        .map((claimId) => acceptedById.get(claimId))
        .filter((claim): claim is AcceptedClaim => Boolean(claim));
      if (groupClaims.some((claim) => claim.sourceTier === 'A')) return true;

      // Multiple URLs from one publisher are not independent confirmation.
      const publishers = new Set(groupClaims.map((claim) => (
        normalizeText(claim.publisher).toLowerCase() || claim.sourceId
      )));
      return publishers.size >= 2;
    }).length / factGroups.length
    : 0;
  const extractionSupport = candidateCount > 0
    ? acceptedClaims.reduce((sum, claim) => sum + claim.confidence, 0) / candidateCount
    : 0;
  const freshness = usedSources.length > 0
    ? usedSources.reduce((sum, source) => sum + sourceFreshness(source, now), 0) / usedSources.length
    : 0;
  const conflictingClaims = rejectedClaims.filter((claim) => claim.reason === 'conflicting-value').length;
  const agreement = candidateCount > 0 ? 1 - conflictingClaims / candidateCount : 0;

  return {
    sourceQuality: clamp01(sourceQuality),
    corroboration: clamp01(corroboration),
    extractionSupport: clamp01(extractionSupport),
    freshness: clamp01(freshness),
    agreement: clamp01(agreement),
  };
}

/**
 * Validates evidence first, then rejects every value for a key if the remaining
 * evidence disagrees. No model output can bypass this ledger.
 */
export function buildVerifiedClaimLedger(
  candidates: ClaimCandidate[],
  sources: ClaimExtractionSource[],
  now: Date = new Date()
): VerifiedClaimLedger {
  const provisional: Array<{ claim: AcceptedClaim; candidate: ClaimCandidate }> = [];
  const rejectedClaims: RejectedClaim[] = [];

  candidates.forEach((candidate, candidateIndex) => {
    const source = Number.isInteger(candidate.sourceIndex)
      ? sources[candidate.sourceIndex - 1]
      : undefined;
    if (!source || source.sourceIndex !== candidate.sourceIndex) {
      rejectedClaims.push(rejected(candidate, 'invalid-source-index', 'source_index does not identify an input source'));
      return;
    }

    const key = normalizeText(candidate.key);
    const value = normalizeText(candidate.value);
    const normalizedKey = canonicalizeClaimKey(key);
    const normalizedValue = normalizeClaimValue(value);
    if (!normalizeClaimKey(key) || !normalizedValue) {
      rejectedClaims.push(rejected(candidate, 'invalid-claim', 'claim key and value must both be non-empty'));
      return;
    }
    if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
      rejectedClaims.push(rejected(candidate, 'invalid-confidence', 'confidence must be between 0 and 1'));
      return;
    }

    const evidenceFragment = normalizeText(candidate.evidenceFragment);
    if (!evidenceFragment) {
      rejectedClaims.push(rejected(candidate, 'missing-evidence', 'evidence_fragment is required'));
      return;
    }
    if (countEvidenceWords(evidenceFragment) > MAX_EVIDENCE_WORDS) {
      rejectedClaims.push(rejected(candidate, 'evidence-too-long', `evidence_fragment exceeds ${MAX_EVIDENCE_WORDS} words`));
      return;
    }
    // Headlines are discovery hints, not sufficient publication evidence: a
    // body can explicitly correct or deny its own shorthand headline. Require
    // the complete relation in the fetched article body and never bridge the
    // title/body boundary.
    if (!evidenceAppearsInSource(evidenceFragment, source.text)) {
      rejectedClaims.push(rejected(candidate, 'evidence-not-found', 'evidence_fragment was not found in the identified source body'));
      return;
    }
    if (!normalizedKey) {
      rejectedClaims.push(rejected(candidate, 'unsupported-key', 'claim key is outside the supported factual taxonomy'));
      return;
    }
    // Claim values get no publication-metadata exception: every numeric token
    // must occur in this exact evidence fragment. publishedAt is attached by
    // trusted pipeline metadata and never passes through the model claim value.
    const exactValueAppearsInEvidence = valueAppearsAsCompletePhrase(value, evidenceFragment);
    const isDateKey = normalizedKey.endsWith('_date')
      || /(?:^|\.)date(?:\.|$)/u.test(normalizedKey);
    const normalizedIsoDate = /^\d{4}-\d{2}-\d{2}$/u.test(value)
      ? canonicalDate(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)))
      : null;
    const canonicalDateAppearsInEvidence = isDateKey
      && normalizedIsoDate !== null
      && extractCanonicalDates(evidenceFragment).has(normalizedIsoDate);
    const normalizedValueIsSupported = exactValueAppearsInEvidence || canonicalDateAppearsInEvidence;
    if (!normalizedValueIsSupported) {
      rejectedClaims.push(rejected(
        candidate,
        'value-not-supported',
        'normalized claim value is not deterministically supported by its evidence fragment'
      ));
      return;
    }
    const evidenceContexts = sourceContextsForEvidence(
      evidenceFragment,
      source.text
    );
    if (!evidenceContextsAreSemanticallySafe(normalizedKey, evidenceContexts)) {
      rejectedClaims.push(rejected(
        candidate,
        'key-not-supported',
        'the containing source statement negates, questions, or qualifies the selected evidence fragment'
      ));
      return;
    }
    if (!claimKeyIsSupportedByEvidence(normalizedKey, value, evidenceFragment)) {
      rejectedClaims.push(rejected(
        candidate,
        'key-not-supported',
        'the evidence contains the value but does not explicitly support the proposed relationship key'
      ));
      return;
    }
    if (findRelativeDatePhrases(value).length > 0) {
      rejectedClaims.push(rejected(candidate, 'relative-date', 'claim values must use absolute dates and times'));
      return;
    }
    provisional.push({
      candidate,
      claim: {
        id: `claim-${candidate.sourceIndex}-${candidateIndex + 1}`,
        sourceIndex: candidate.sourceIndex,
        sourceId: source.sourceId,
        sourceUrl: source.sourceUrl,
        publisher: source.publisher,
        sourceTier: source.tier,
        key,
        value,
        normalizedKey,
        normalizedValue,
        confidence: candidate.confidence,
        retrievedAt: source.retrievedAt,
        publishedAt: source.publishedAt,
        evidenceFragment,
      },
    });
  });

  const valuesByKey = new Map<string, Set<string>>();
  for (const { claim } of provisional) {
    const values = valuesByKey.get(claim.normalizedKey) ?? new Set<string>();
    values.add(claim.normalizedValue);
    valuesByKey.set(claim.normalizedKey, values);
  }
  const conflictingKeys = new Set(
    [...valuesByKey.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([key]) => key)
  );

  const nonConflicting = provisional.filter(({ claim, candidate }) => {
    if (!conflictingKeys.has(claim.normalizedKey)) return true;
    rejectedClaims.push(rejected(
      candidate,
      'conflicting-value',
      `multiple supported values were found for ${claim.normalizedKey}`
    ));
    return false;
  });

  // Repeated model rows cannot inflate corroboration or extraction support.
  const bestBySourceAndFact = new Map<string, AcceptedClaim>();
  for (const { claim } of nonConflicting) {
    const key = `${claim.sourceUrl}\u0000${claim.normalizedKey}\u0000${claim.normalizedValue}`;
    const existing = bestBySourceAndFact.get(key);
    if (!existing || claim.confidence > existing.confidence) {
      bestBySourceAndFact.set(key, claim);
    }
  }
  const acceptedClaims = [...bestBySourceAndFact.values()];
  const factGroups = buildFactGroups(acceptedClaims);
  const metrics = calculateMetrics(
    acceptedClaims,
    rejectedClaims,
    factGroups,
    candidates.length,
    sources,
    now
  );

  return {
    acceptedClaims,
    rejectedClaims,
    factGroups,
    candidateCount: candidates.length,
    conflictingKeyCount: conflictingKeys.size,
    metrics,
  };
}

export function buildSourceProvenance(
  sources: ClaimExtractionSource[],
  ledger: VerifiedClaimLedger,
  acceptedFactFingerprint?: string
): NewsSourceProvenance[] {
  const acceptedSourceIndexes = new Set(
    ledger.acceptedClaims.map((claim) => claim.sourceIndex)
  );
  return sources.filter((source) => acceptedSourceIndexes.has(source.sourceIndex)).map((source) => ({
    url: source.sourceUrl,
    title: source.title,
    publisher: source.publisher,
    published_at: source.publishedAt,
    tier: source.tier,
    retrieved_at: source.retrievedAt,
    ...(acceptedFactFingerprint
      ? { accepted_fact_fingerprint: acceptedFactFingerprint }
      : {}),
    claims: ledger.acceptedClaims
      .filter((claim) => claim.sourceIndex === source.sourceIndex)
      .map((claim) => ({
        id: claim.id,
        source_index: claim.sourceIndex,
        normalized_key: claim.normalizedKey,
        normalized_value: claim.normalizedValue,
        confidence: claim.confidence,
        evidence_fragment: claim.evidenceFragment,
      })),
  }));
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
  thousand: '1000',
  million: '1000000',
  billion: '1000000000',
  first: '1',
  second: '2',
  third: '3',
};

function normalizeNumericToken(token: string): string {
  const lower = token.toLowerCase();
  if (NUMBER_WORDS[lower]) return NUMBER_WORDS[lower];

  const percent = lower.endsWith('%');
  let numeric = percent ? lower.slice(0, -1) : lower;
  if (/^\d{1,3}([,.]\d{3})+$/u.test(numeric)) {
    numeric = numeric.replace(/[,.]/g, '');
  } else {
    numeric = numeric.replace(',', '.');
  }
  numeric = numeric.replace(/^0+(?=\d)/, '');
  return `${numeric || '0'}${percent ? '%' : ''}`;
}

export function extractNumericTokens(value: string): string[] {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\d+(?:[,.]\d+)*%?/gu)) {
    tokens.add(normalizeNumericToken(match[0]));
  }
  for (const match of value.toLowerCase().matchAll(/\b[a-z]+\b/gu)) {
    if (NUMBER_WORDS[match[0]]) tokens.add(NUMBER_WORDS[match[0]]);
  }
  return [...tokens];
}

function extractDirectQuotes(value: string): string[] {
  const quotes: string[] = [];
  const patterns = [/"([^"\n]+)"/gu, /“([^”\n]+)”/gu, /^>\s*(.+)$/gmu];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      quotes.push(normalizeText(match[1]));
    }
  }
  return quotes;
}

const ENTITY_SUFFIX_PATTERN = /\b((?:[\p{Lu}][\p{L}\p{M}'’.-]*[ \t]+)*(?:[Hh]omestay|[Hh]otel|[Rr]esort|[Hh]ostel|[Cc]afe|[Cc]afé|[Rr]estaurant|[Cc]ompany|[Cc]orporation|[Aa]ssociation|[Ff]oundation|[Cc]ommittee|[Cc]ouncil|[Aa]uthority|[Aa]gency|[Dd]epartment|[Mm]inistry|[Uu]niversity|[Mm]useum|[Ss]chool|[Ii]nstitute|[Cc]lub|[Cc]enter|[Cc]entre|[Pp]ark|[Ll]ake|[Mm]ountain|[Ss]quare|[Vv]illage))\b/gu;
// Three title-cased words catches common Vietnamese personal names and titled
// people without treating ordinary two-word markdown headings as entities.
const PROPER_NOUN_PHRASE_PATTERN = /\b([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*){2,5})\b/gu;

type RelationshipField = 'owner' | 'operator' | 'organizer' | 'authority' | 'founder';

interface RelationshipAssertion {
  entity: string;
  field: RelationshipField;
}

const RELATIONSHIP_PATTERNS: Array<{
  field: RelationshipField;
  object: RegExp;
  subject: RegExp;
}> = [
  {
    field: 'owner',
    object: /\b[Oo]wned[ \t]+by[ \t]+([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})/gu,
    subject: /\b([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})[ \t]+owns\b/gu,
  },
  {
    field: 'operator',
    object: /\b(?:[Oo]perated|[Mm]anaged|[Rr]un)[ \t]+by[ \t]+([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})/gu,
    subject: /\b([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})[ \t]+(?:operates|manages|runs)\b/gu,
  },
  {
    field: 'organizer',
    object: /\b(?:[Oo]rganized|[Hh]osted)[ \t]+by[ \t]+([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})/gu,
    subject: /\b([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})[ \t]+(?:organizes|hosts)\b/gu,
  },
  {
    field: 'authority',
    object: /\b[Ll]ed[ \t]+by[ \t]+([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})/gu,
    subject: /\b([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})[ \t]+leads\b/gu,
  },
  {
    field: 'founder',
    object: /\b[Ff]ounded[ \t]+by[ \t]+([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})/gu,
    subject: /\b([\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}'’.-]*|of|the|and)){0,6})[ \t]+founded\b/gu,
  },
];

function normalizeEntity(value: string): string {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractNamedEntityPhrases(value: string): string[] {
  const entities = new Set<string>();
  for (const pattern of [ENTITY_SUFFIX_PATTERN, PROPER_NOUN_PHRASE_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const entity = normalizeText(match[1]).replace(/^(?:The|A|An)[ \t]+/u, '');
      // Named calendar dates are checked by the date validator, not as people
      // or organizations (for example "September 12, 2026").
      if (extractCanonicalDates(entity).size === 0) entities.add(entity);
    }
  }
  return [...entities];
}

function extractRelationshipAssertions(value: string): RelationshipAssertion[] {
  const assertions = new Map<string, RelationshipAssertion>();
  for (const { field, object, subject } of RELATIONSHIP_PATTERNS) {
    for (const pattern of [object, subject]) {
      pattern.lastIndex = 0;
      for (const match of value.matchAll(pattern)) {
        const entity = normalizeText(match[1]).replace(/^(?:The|A|An)[ \t]+/u, '');
        assertions.set(`${field}\u0000${entity}`, { field, entity });
      }
    }
  }
  return [...assertions.values()];
}

function containsPublisherAttribution(value: string): boolean {
  const normalized = normalizeEntity(value);
  if (/\b(?:according to|reported by|published by)\b/u.test(normalized)) return true;

  for (const source of NEWS_SOURCES) {
    const publisher = normalizeEntity(source.name);
    const start = normalized.indexOf(publisher);
    if (start < 0) continue;
    const nearby = normalized.slice(start + publisher.length, start + publisher.length + 50);
    if (/\b(?:reports?|reported|publishes?|published|writes?|wrote|says?|said)\b/u.test(nearby)) {
      return true;
    }
  }
  return false;
}

function extractProtectedUnits(value: string): Set<string> {
  const units = new Set<string>();
  for (const match of value.matchAll(/\b(?:VND|USD|EUR|GBP|km|cm|mm|kg|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?)\b|[$€£₫%]/giu)) {
    units.add(match[0].toLowerCase());
  }
  return units;
}

const CURRENCY_UNIT_PATTERN = 'VND|USD|EUR|GBP|[$€£₫]';
const MEASURE_UNIT_PATTERN = 'km|cm|mm|kg|hours?|hrs?|hr|minutes?|mins?|min|days?|weeks?|months?|years?|%';
const NUMBER_TOKEN_PATTERN = `\\d+(?:[,.]\\d+)*|${Object.keys(NUMBER_WORDS).join('|')}`;

function normalizeProtectedUnit(value: string): string {
  const unit = value.toLowerCase();
  if (unit === '₫' || unit === 'vnd') return 'vnd';
  if (unit === '$' || unit === 'usd') return 'usd';
  if (unit === '€' || unit === 'eur') return 'eur';
  if (unit === '£' || unit === 'gbp') return 'gbp';
  if (/^(hours?|hrs?|hr)$/u.test(unit)) return 'hour';
  if (/^(minutes?|mins?|min)$/u.test(unit)) return 'minute';
  if (/^days?$/u.test(unit)) return 'day';
  if (/^weeks?$/u.test(unit)) return 'week';
  if (/^months?$/u.test(unit)) return 'month';
  if (/^years?$/u.test(unit)) return 'year';
  if (unit === '%') return 'percent';
  return unit;
}

function extractNumberUnitPairs(value: string): Set<string> {
  const pairs = new Set<string>();
  const suffixPattern = new RegExp(
    `\\b(${NUMBER_TOKEN_PATTERN})\\s*(${CURRENCY_UNIT_PATTERN}|${MEASURE_UNIT_PATTERN})(?=\\b|\\s|[.,;:!?)]|$)`,
    'giu'
  );
  const currencyPrefixPattern = new RegExp(
    `(${CURRENCY_UNIT_PATTERN})\\s*(${NUMBER_TOKEN_PATTERN})\\b`,
    'giu'
  );

  for (const match of value.matchAll(suffixPattern)) {
    pairs.add(`${normalizeNumericToken(match[1])}|${normalizeProtectedUnit(match[2])}`);
  }
  for (const match of value.matchAll(currencyPrefixPattern)) {
    pairs.add(`${normalizeNumericToken(match[2])}|${normalizeProtectedUnit(match[1])}`);
  }
  return pairs;
}

export function validateGeneratedContent(
  fields: GeneratedNewsFields,
  ledger: VerifiedClaimLedger
): GenerationValidationIssue[] {
  const issues: GenerationValidationIssue[] = [];
  if (!normalizeText(fields.title) || !normalizeText(fields.storyContent)) {
    issues.push({
      code: 'missing-required-content',
      detail: 'generated title and story content are required',
    });
  }

  const prose = [
    fields.title,
    fields.storyContent,
    fields.technicalContent,
    fields.metaDescription,
    ...(fields.additionalText ?? []),
  ].join('\n');

  const allowedQuotes = new Set(
    ledger.acceptedClaims
      .filter((claim) => /(^|\.)quote(\.|$)/u.test(claim.normalizedKey))
      .map((claim) => claim.normalizedValue)
  );
  for (const quote of extractDirectQuotes(prose)) {
    if (!allowedQuotes.has(normalizeClaimValue(quote))) {
      issues.push({
        code: 'unsupported-quote',
        detail: `direct quote is not present in an accepted quote claim: ${quote.slice(0, 80)}`,
      });
    }
  }

  const allowedEntityValues = [
    ...ledger.acceptedClaims.map((claim) => claim.value),
    'Đà Lạt', 'Da Lat', 'Lâm Đồng', 'Lam Dong', 'Việt Nam', 'Vietnam', 'ĐàLạt.app',
  ].map(normalizeEntity);
  for (const entity of extractNamedEntityPhrases(prose)) {
    const normalizedEntity = normalizeEntity(entity);
    const isAllowed = allowedEntityValues.some((allowed) =>
      allowed === normalizedEntity || ` ${allowed} `.includes(` ${normalizedEntity} `)
    );
    if (!isAllowed) {
      issues.push({
        code: 'unsupported-entity',
        detail: `named entity is not present in the accepted fact ledger: ${entity.slice(0, 100)}`,
      });
    }
  }

  const allowedRelationships = new Map<RelationshipField, string[]>();
  for (const field of ['owner', 'operator', 'organizer', 'authority', 'founder'] as const) {
    allowedRelationships.set(
      field,
      ledger.acceptedClaims
        .filter((claim) => claim.normalizedKey.endsWith(`.${field}`))
        .map((claim) => normalizeEntity(claim.value))
    );
  }
  for (const { entity, field } of extractRelationshipAssertions(prose)) {
    const normalizedEntity = normalizeEntity(entity);
    const isSupportedRelationship = (allowedRelationships.get(field) ?? []).some((allowed) =>
      allowed === normalizedEntity || ` ${allowed} `.includes(` ${normalizedEntity} `)
    );
    if (!isSupportedRelationship) {
      issues.push({
        code: 'unsupported-entity',
        detail: `${field} relationship is not present in the accepted fact ledger: ${entity.slice(0, 100)}`,
      });
    }
  }

  if (containsPublisherAttribution(prose)) {
    issues.push({
      code: 'unsupported-publisher-attribution',
      detail: 'publisher attribution belongs in the dynamic Sources section, not generated prose',
    });
  }

  for (const phrase of findRelativeDatePhrases(prose)) {
    issues.push({
      code: 'relative-date',
      detail: `relative date phrase is not allowed: ${phrase}`,
    });
  }

  const allowedDates = new Set(
    ledger.acceptedClaims.flatMap((claim) => [...extractCanonicalDates(claim.value)])
  );
  for (const date of extractCanonicalDates(prose)) {
    if (!allowedDates.has(date)) {
      issues.push({
        code: 'unsupported-date',
        detail: `absolute date is not present in the accepted fact ledger: ${date}`,
      });
    }
  }

  const allowedUnits = new Set(
    ledger.acceptedClaims.flatMap((claim) => [...extractProtectedUnits(claim.value)])
  );
  for (const unit of extractProtectedUnits(prose)) {
    if (!allowedUnits.has(unit)) {
      issues.push({
        code: 'unsupported-unit',
        detail: `currency or unit is not present in the accepted fact ledger: ${unit}`,
      });
    }
  }

  const allowedNumberUnitPairs = new Set(
    ledger.acceptedClaims.flatMap((claim) => [...extractNumberUnitPairs(claim.value)])
  );
  for (const pair of extractNumberUnitPairs(prose)) {
    if (!allowedNumberUnitPairs.has(pair)) {
      issues.push({
        code: 'unsupported-unit',
        detail: `number and currency or unit pairing is not present in the accepted fact ledger: ${pair}`,
      });
    }
  }

  const allowedNumbers = new Set(
    ledger.acceptedClaims.flatMap((claim) => extractNumericTokens(claim.value))
  );
  for (const token of extractNumericTokens(prose)) {
    if (!allowedNumbers.has(token)) {
      issues.push({
        code: 'invented-number',
        detail: `numeric token is not present in the accepted fact ledger: ${token}`,
      });
    }
  }

  return issues;
}

export function assertGeneratedContentIsSupported(
  fields: GeneratedNewsFields,
  ledger: VerifiedClaimLedger
): void {
  const issues = validateGeneratedContent(fields, ledger);
  if (issues.length > 0) {
    throw new Error(`Generated news failed deterministic verification: ${issues.map((issue) => issue.detail).join('; ')}`);
  }
}
