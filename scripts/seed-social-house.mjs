#!/usr/bin/env node
/**
 * One-off onboarding seed for Social House Dalat (venue + organizer + menu +
 * event backfill). Idempotent: re-running upserts by slug.
 *
 *   SUPABASE_ACCESS_TOKEN=... CLOUDFLARE_API_TOKEN=... \
 *   node scripts/seed-social-house.mjs <dir-with-downloaded-site-assets>
 *
 * <dir> is a copy of https://socialhousedalat.com/ (it must contain
 * assets/img/...). Photos are uploaded to R2 (never Supabase Storage).
 * Pass --dry to skip uploads and writes and just print the SQL.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, extname, basename } from "node:path";

const SRC = process.argv[2];
const DRY = process.argv.includes("--dry");
const PROJECT = "aljcmodwjqlznzcydyor";
const CF_ACCOUNT = "00b406a96bebe80b300bbaae0cd7f716";
const R2_BUCKET = "dalat-app-media";
const CDN = "https://cdn.dalat.app";
const YAN = "303f96f6-0501-465c-9ee5-96e6136bb8bb";
const SLUG = "social-house-dalat";

if (!SRC || !existsSync(join(SRC, "assets/img"))) {
  console.error("usage: seed-social-house.mjs <site-assets-dir> [--dry]");
  process.exit(1);
}
const img = (p) => join(SRC, "assets/img", p);
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const menu = JSON.parse(readFileSync(new URL("./data/social-house/menu.json", import.meta.url), "utf8"));
const i18nPath = new URL("./data/social-house/menu-i18n.json", import.meta.url);
const menuI18n = existsSync(i18nPath) ? JSON.parse(readFileSync(i18nPath, "utf8")) : { sections: {}, items: {} };

// Node's fetch can't reach api.cloudflare.com from some sandboxes; curl can.
const curl = (args) => execFileSync("curl", ["-sS", "--fail-with-body", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });

// ---------------------------------------------------------------- uploads
const uploaded = new Map(); // local rel path -> public URL
async function upload(bucket, key, localRel) {
  const path = `${SLUG}/${key}`;
  const url = `${CDN}/${bucket}/${path}`;
  uploaded.set(localRel + "|" + bucket, url);
  if (DRY) return url;
  const out = curl([
    "-X", "PUT",
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(`${bucket}/${path}`)}`,
    "-H", `Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    "-H", `Content-Type: ${MIME[extname(key).toLowerCase()] ?? "application/octet-stream"}`,
    "--data-binary", `@${img(localRel)}`,
  ]);
  if (!JSON.parse(out).success) throw new Error(`R2 upload failed ${bucket}/${path}: ${out}`);
  return url;
}

const humanize = (f) =>
  basename(f, extname(f)).replace(/^\w+-\d+-/, "").replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

const logoUrl = await upload("venue-media", "logo.png", "logo.png");
const orgLogoUrl = await upload("organizer-logos", "logo.png", "logo.png");
const coverUrl = await upload("venue-media", "cover.jpg", "og-image.jpg");

// gallery: carousel + life + a selection of event photos, with SEO-friendly captions
const galleryDirs = ["carousel", "carousel-family", "carousel-homemade", "life/2026-10", "events"];
const photos = [];
for (const d of galleryDirs) {
  for (const f of readdirSync(img(d)).sort()) {
    if (!MIME[extname(f).toLowerCase()] || f.includes("poster")) continue;
    const rel = `${d}/${f}`;
    const key = `gallery/${d.replace(/\//g, "-")}-${f}`;
    const url = await upload("venue-media", key, rel);
    photos.push({ url, caption: humanize(f) + " – Socialhouse Dalat", sort_order: photos.length });
  }
}
const eventImg = async (rel, name) => upload("event-media", name, rel);
const menuImg = async (rel, name) => upload("venue-media", `menu/${name}`, rel);

const itemImages = {
  "Orange Cold Brew Cold Foam": await menuImg("cold-brew-socialhouse-dalat.jpg", "orange-cold-brew.jpg"),
  "Chicken Burrito": await menuImg("carousel-homemade/burrito-whole-wheat-tortilla.jpg", "burrito.jpg"),
  "Chicken Soup": await menuImg("carousel-homemade/mama-soup.jpg", "mama-soup.jpg"),
  "Pancakes with homemade jam": await menuImg("carousel-homemade/pancake-homemade-jam.jpg", "pancakes.jpg"),
};

const evBrew = await eventImg("events/brew-music-01-dj-danithedock.jpg", "morning-brew-music.jpg");
const evSunrise = await eventImg("events/sunrise-01-sun-through-the-pines.jpg", "brew-sunrise.jpg");

// ---------------------------------------------------------------- SQL
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const j = (o) => `${q(JSON.stringify(o))}::jsonb`;

const description =
  "Socialhouse Dalat is a café, bar & kitchen in the heart of Đà Lạt, run by Slaven, Yoko and Mom. " +
  "Lang Biang coffee from Zanya, matcha from Lạc Yên Trà, 70% Zanya hot chocolate, homemade cookies, brownies and pastries, " +
  "and an all-day kitchen: burritos, Mama's noodle soup, pancakes and a family dinner. " +
  "Super fast Wi-Fi for remote workers, board game nights, language exchange evenings, live music mornings and sunrise rides – " +
  "come for the coffee, stay for the community. Open daily 7:00–22:00, closed Tuesdays, at 184 Tô Ngọc Vân.";

const hours = {};
for (const d of ["monday", "wednesday", "thursday", "friday", "saturday", "sunday"]) hours[d] = { open: "07:00", close: "22:00" };
hours.tuesday = "closed";

const common = {
  website_url: "https://socialhousedalat.com",
  facebook_url: "https://www.facebook.com/p/Socialhouse-Dalat-61592018831278/",
  instagram_url: "https://www.instagram.com/socialhouse_dalat/",
  zalo_url: "https://zalo.me/0707681445",
};

const sql = `
-- venue (the business page)
insert into venues (slug, name, description, venue_type, latitude, longitude, address, google_maps_url,
  website_url, facebook_url, instagram_url, zalo_url, phone, email, operating_hours,
  has_wifi, has_outdoor_seating, is_pet_friendly, price_range, tags, cuisine_types, photos,
  logo_url, cover_photo_url, source_locale, created_by, preorder_enabled, geocode_source)
values (${q(SLUG)}, 'Social House Dalat', ${q(description)}, 'cafe', 11.9467648, 108.4341887,
  '184 Đường Tô Ngọc Vân, Phường Xuân Hương, Đà Lạt, Lâm Đồng 66122, Vietnam',
  'https://maps.app.goo.gl/2XHcfUNDzv4Da24L6',
  ${q(common.website_url)}, ${q(common.facebook_url)}, ${q(common.instagram_url)}, ${q(common.zalo_url)},
  '+84707681445', 'socialhousedalat@gmail.com', ${j(hours)},
  true, false, true, '$',
  '{coffee,matcha,cold brew,homemade pastries,board games,language exchange,live music,fast wifi,remote work,bar,pet friendly}',
  '{Coffee,Matcha,Homemade pastries,Burritos,Noodle soup,Vegetarian options}',
  ${j(photos)}, ${q(logoUrl)}, ${q(coverUrl)}, 'en', ${q(YAN)}, true, 'google_maps_link')
on conflict (slug) do update set description=excluded.description, operating_hours=excluded.operating_hours,
  photos=excluded.photos, logo_url=excluded.logo_url, cover_photo_url=excluded.cover_photo_url,
  tags=excluded.tags, cuisine_types=excluded.cuisine_types, preorder_enabled=true,
  website_url=excluded.website_url, facebook_url=excluded.facebook_url, instagram_url=excluded.instagram_url, zalo_url=excluded.zalo_url;

-- organizer (events are filed under this identity)
insert into organizers (slug, name, description, logo_url, website_url, facebook_url, instagram_url, zalo_url,
  organizer_type, contact_email, contact_phone)
select ${q(SLUG)} || case when exists (select 1 from unified_slugs where slug = ${q(SLUG)} and entity_type <> 'organizer') then '-events' else '' end,
  'Social House Dalat', ${q(description)}, ${q(orgLogoUrl)}, ${q(common.website_url)}, ${q(common.facebook_url)},
  ${q(common.instagram_url)}, ${q(common.zalo_url)}, 'business', 'socialhousedalat@gmail.com', '+84707681445'
where not exists (select 1 from organizers where name = 'Social House Dalat');

update venues set organizer_id = (select id from organizers where name = 'Social House Dalat' order by created_at limit 1)
 where slug = ${q(SLUG)};

`;

const venueSub = `(select id from venues where slug = ${q(SLUG)})`;
const menuSql = [
  ...menu.sections.map((s, si) => {
    const tr = menuI18n.sections?.[s.slug] ?? {};
    return `insert into venue_menu_sections (venue_id, slug, title, title_i18n, note, note_i18n, sort)
      values (${venueSub}, ${q(s.slug)}, ${q(s.title)}, ${j(tr.title ?? {})}, ${q(s.note)}, ${j(tr.note ?? {})}, ${si * 10})
      on conflict (venue_id, slug) do update set title=excluded.title, title_i18n=excluded.title_i18n, note=excluded.note, note_i18n=excluded.note_i18n, sort=excluded.sort;`;
  }),
  ...menu.sections.flatMap((s) =>
    s.items.map((it, ii) => {
      const tr = menuI18n.items?.[it.name] ?? {};
      const sec = `(select id from venue_menu_sections where venue_id = ${venueSub} and slug = ${q(s.slug)})`;
      return `insert into venue_menu_items (venue_id, section_id, name, name_i18n, description, description_i18n, price_vnd, tags, image_url, sort)
        select ${venueSub}, ${sec}, ${q(it.name)}, ${j(tr.name ?? {})}, ${q(it.description)}, ${j(tr.description ?? {})}, ${it.price_vnd},
          ${q(`{${it.tags.join(",")}}`)}::text[], ${q(itemImages[it.name] ?? null)}, ${ii * 10}
        where not exists (select 1 from venue_menu_items x where x.section_id = ${sec} and x.name = ${q(it.name)});
      update venue_menu_items set name_i18n=${j(tr.name ?? {})}, description_i18n=${j(tr.description ?? {})}
        where section_id = ${sec} and name = ${q(it.name)};`;
    }),
  ),
].join("\n");

const orgSub = `(select id from organizers where name = 'Social House Dalat' order by created_at limit 1)`;
const pastEvents = `
-- backfill: past events listed on socialhousedalat.com/events
insert into events (slug, title, description, image_url, location_name, address, latitude, longitude, starts_at, ends_at,
  timezone, status, created_by, venue_id, organizer_id, source_locale, price_type)
values ('morning-brew-music-social-house-20261003', 'Morning Brew & Music',
  'Coffee and a morning DJ set by DJ Danithedock – a full house dancing before lunch. Free entry and buy-one-get-one-free drinks.',
  ${q(evBrew)}, 'Social House Dalat', '184 Đường Tô Ngọc Vân, Phường Xuân Hương, Đà Lạt', 11.9467648, 108.4341887,
  '2026-10-03T09:00:00+07', '2026-10-03T11:00:00+07', 'Asia/Ho_Chi_Minh', 'published', ${q(YAN)}, ${venueSub}, ${orgSub}, 'en', 'free')
on conflict (slug) do nothing;

insert into events (slug, title, description, image_url, location_name, starts_at, ends_at,
  timezone, status, created_by, organizer_id, source_locale, price_type)
values ('brew-sunrise-social-house-20261020', 'Brew & Sunrise',
  'An early motorbike ride out of Đà Lạt to watch the sunrise over the pine hills – then climbing trees, a picnic in the grass and coffee with a view.',
  ${q(evSunrise)}, 'Pine hills outside Đà Lạt (ride starts at Social House)', '2026-10-20T05:00:00+07', '2026-10-20T09:00:00+07',
  'Asia/Ho_Chi_Minh', 'published', ${q(YAN)}, ${orgSub}, 'en', 'free')
on conflict (slug) do nothing;

-- re-home existing Social House events (venue + organizer)
update events set venue_id = ${venueSub}, organizer_id = ${orgSub}
 where slug in ('wa-3a719ada4375212547b8','wa-3a114f6d2a733f7b67db','wa-3a070b453e694b7bc8d6','wa-3a00bf7bce5d91a0ff6a','wa-3a2979fb8f3b13e24d53')
    or slug like 'language-exchange-social-house-z8oc-%';
-- hosted at Social House by another organizer: link the place only
update events set venue_id = ${venueSub} where slug = 'wa-3a472d9b60fae5e7e98e';
update event_series set venue_id = ${venueSub}, organizer_id = ${orgSub}
 where id = 'ad0a0c5e-f718-447c-89f1-6fa3b78e3c52';
`;

const finalSql = `begin;\n${sql}\n${menuSql}\n${pastEvents}\ncommit;`;

if (DRY) {
  console.log(finalSql.slice(0, 6000));
  console.log(`\n… ${finalSql.length} chars, ${photos.length} gallery photos, ${uploaded.size} uploads`);
  process.exit(0);
}

const payload = join(tmpdir(), `seed-social-house-${process.pid}.json`);
writeFileSync(payload, JSON.stringify({ query: finalSql }));
const out = curl([
  "-X", "POST", `https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
  "-H", `Authorization: Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
  "-H", "Content-Type: application/json",
  "--data-binary", `@${payload}`,
]);
console.log(out.slice(0, 800));
console.log(`${uploaded.size} files uploaded, ${photos.length} gallery photos`);
