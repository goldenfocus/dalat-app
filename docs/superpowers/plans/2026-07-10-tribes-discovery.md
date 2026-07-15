# Tribes Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tribes front door: a `/tribes` index, a homepage discovery strip, i18n in 12 languages, and 8 seeded starter tribes in prod.

**Architecture:** One shared ISR-cached fetch (`lib/tribes.ts`, `unstable_cache` + `createStaticClient`, 300s) feeds both a server-rendered `/tribes` grid and a homepage strip. Seeding is a SQL file run through `scripts/supabase-run-sql.sh` (prod writes must NOT use the `.env.local` key — it's stale; see memory). No schema/RLS changes; no member counts at launch (RLS hides `tribe_members` from anon).

**Tech Stack:** Next.js 16 App Router, next-intl, Supabase (anon/static client), Tailwind.

**Worktree:** `.worktrees/tribes-discovery` (already created, spec committed).

---

### Task 1: i18n keys in all 12 locale files

**Files:**
- Modify: `messages/en.json`, `messages/vi.json`, `messages/ko.json`, `messages/zh.json`, `messages/ru.json`, `messages/fr.json`, `messages/ja.json`, `messages/ms.json`, `messages/th.json`, `messages/de.json`, `messages/es.json`, `messages/id.json`

New keys inside the EXISTING `tribes` namespace (already registered in `lib/i18n/client-namespaces.ts` — no registration change): `findYourTribe`, `discoverTitle`, `discoverSubtitle`, `startTribe`, `seeAll`, `accessOpen`, `accessRequest`, `emptyTitle`, `emptyCta`.

- [ ] **Step 1: Insert keys via script** (mirrors the dateAtTime insertion done Jul 9; inserts at the top of the `"tribes": {` block, preserving file formatting; validates JSON after each write; proper top-level `json.loads` check, NOT substring)

```python
# run with: python3 <<'EOF' ... EOF  (from the worktree root)
import json, re

K = ["findYourTribe","discoverTitle","discoverSubtitle","startTribe","seeAll","accessOpen","accessRequest","emptyTitle","emptyCta"]
T = {
 "en": ["Find your tribe","Tribes of Đà Lạt","Little communities, big vibes — join the crews that make this city feel like home.","Start a tribe","See all","Open to all","Request to join","No tribes yet — the mist is waiting for its first crew.","Be the founder"],
 "vi": ["Tìm hội của bạn","Các hội nhóm Đà Lạt","Cộng đồng nhỏ, niềm vui lớn — tham gia những hội nhóm khiến thành phố này thân thương như nhà.","Lập hội mới","Xem tất cả","Mở cho mọi người","Cần duyệt để tham gia","Chưa có hội nhóm nào — sương mù đang chờ nhóm đầu tiên.","Làm người sáng lập"],
 "ko": ["나의 트라이브 찾기","달랏의 트라이브","작은 커뮤니티, 큰 즐거움 — 이 도시를 집처럼 느끼게 해주는 모임에 함께하세요.","트라이브 만들기","모두 보기","누구나 참여 가능","가입 신청 필요","아직 트라이브가 없어요 — 안개가 첫 모임을 기다리고 있어요.","첫 창립자 되기"],
 "zh": ["找到你的部落","大叻部落","小小社群，大大乐趣——加入让这座城市如家般温暖的圈子。","创建部落","查看全部","向所有人开放","需申请加入","还没有部落——雾中正等待第一个社群。","成为创始人"],
 "ru": ["Найди своё племя","Племена Далата","Маленькие сообщества, большая атмосфера — присоединяйтесь к компаниям, с которыми этот город становится домом.","Создать племя","Смотреть все","Открыто для всех","По заявке","Племён пока нет — туман ждёт свою первую компанию.","Стать основателем"],
 "fr": ["Trouvez votre tribu","Les tribus de Đà Lạt","Petites communautés, grande ambiance — rejoignez les bandes qui font de cette ville un chez-soi.","Créer une tribu","Voir tout","Ouvert à tous","Sur demande","Pas encore de tribus — la brume attend sa première bande.","Devenir fondateur"],
 "ja": ["自分のトライブを見つけよう","ダラットのトライブ","小さなコミュニティ、大きな楽しさ——この街を我が家にしてくれる仲間に出会おう。","トライブを作る","すべて見る","誰でも参加OK","参加には承認が必要","まだトライブがありません——霧が最初の仲間を待っています。","創設者になる"],
 "ms": ["Cari tribe anda","Tribe Đà Lạt","Komuniti kecil, keseronokan besar — sertai kumpulan yang menjadikan bandar ini terasa seperti rumah.","Mulakan tribe","Lihat semua","Terbuka untuk semua","Perlu mohon untuk sertai","Belum ada tribe — kabus menanti kumpulan pertamanya.","Jadi pengasas"],
 "th": ["ค้นหาไทรบ์ของคุณ","ไทรบ์แห่งดาลัด","คอมมูนิตี้เล็ก ๆ ที่อบอุ่น — เข้าร่วมแก๊งที่ทำให้เมืองนี้เหมือนบ้าน","สร้างไทรบ์","ดูทั้งหมด","เปิดรับทุกคน","ต้องขอเข้าร่วม","ยังไม่มีไทรบ์ — สายหมอกกำลังรอแก๊งแรกอยู่","เป็นผู้ก่อตั้ง"],
 "de": ["Finde deine Tribe","Tribes von Đà Lạt","Kleine Communities, großes Gefühl — schließ dich den Crews an, die diese Stadt zum Zuhause machen.","Tribe gründen","Alle ansehen","Offen für alle","Beitritt auf Anfrage","Noch keine Tribes — der Nebel wartet auf seine erste Crew.","Gründer werden"],
 "es": ["Encuentra tu tribu","Tribus de Đà Lạt","Comunidades pequeñas, gran ambiente — únete a los grupos que hacen de esta ciudad un hogar.","Crear una tribu","Ver todas","Abierta a todos","Solicitud para unirse","Aún no hay tribus — la niebla espera a su primer grupo.","Sé quien la funde"],
 "id": ["Temukan tribe-mu","Tribe Đà Lạt","Komunitas kecil, keseruan besar — gabung dengan kru yang membuat kota ini terasa seperti rumah.","Mulai tribe","Lihat semua","Terbuka untuk semua","Perlu izin bergabung","Belum ada tribe — kabut menanti kru pertamanya.","Jadi pendiri"],
}

for locale, vals in T.items():
    path = f"messages/{locale}.json"
    text = open(path, encoding="utf-8").read()
    data = json.loads(text)
    assert "tribes" in data, f"{locale}: no tribes namespace"
    missing = [k for k in K if k not in data["tribes"]]
    if not missing:
        print(f"{locale}: all present, skipped"); continue
    kv = dict(zip(K, vals))
    m = re.search(r'("tribes": \{\n)(\s*)', text)
    ind = m.group(2)
    ins = "".join(f'{ind}"{k}": {json.dumps(kv[k], ensure_ascii=False)},\n' for k in missing)
    new_text = text[:m.end(1)] + ins + text[m.end(1):]
    parsed = json.loads(new_text)
    assert all(k in parsed["tribes"] for k in K)
    open(path, "w", encoding="utf-8").write(new_text)
    print(f"{locale}: added {len(missing)}")
```

- [ ] **Step 2: Verify all 12 files parse and contain all 9 keys**

Run: `for f in messages/*.json; do python3 -c "import json;d=json.load(open('$f'));assert all(k in d['tribes'] for k in ['findYourTribe','discoverTitle','discoverSubtitle','startTribe','seeAll','accessOpen','accessRequest','emptyTitle','emptyCta']), '$f'" || echo FAIL $f; done; echo done`
Expected: only `done`, no FAIL lines.

- [ ] **Step 3: Commit**

```bash
git add messages/
git commit -m "feat(tribes): discovery i18n keys in all 12 locales"
```

### Task 2: Shared cached fetch — `lib/tribes.ts`

**Files:**
- Create: `lib/tribes.ts`

- [ ] **Step 1: Create the module**

```typescript
import { unstable_cache } from "next/cache";
import { createStaticClient } from "@/lib/supabase/server";
import type { Tribe } from "@/lib/types";

export type DiscoverTribe = Pick<
  Tribe,
  "id" | "slug" | "name" | "description" | "cover_image_url" | "access_type"
>;

/**
 * Listed public/request tribes for discovery surfaces (/tribes + homepage strip).
 * ISR-cached; uses createStaticClient because unstable_cache has no request
 * context (CLAUDE.md ISR rule). Returns [] on any failure — callers render
 * an empty state / nothing instead of erroring.
 */
export const getDiscoverTribes = unstable_cache(
  async (): Promise<DiscoverTribe[]> => {
    const supabase = createStaticClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("tribes")
      .select("id, slug, name, description, cover_image_url, access_type")
      .in("access_type", ["public", "request"])
      .eq("is_listed", true)
      .order("created_at", { ascending: true })
      .limit(60);

    if (error) {
      console.error("Error fetching discover tribes:", error);
      return [];
    }
    return (data ?? []) as DiscoverTribe[];
  },
  ["discover-tribes"],
  { revalidate: 300 }
);
```

- [ ] **Step 2: Commit**

```bash
git add lib/tribes.ts
git commit -m "feat(tribes): shared ISR-cached discovery fetch"
```

### Task 3: `TribeCard` — `components/tribes/tribe-card.tsx`

**Files:**
- Create: `components/tribes/tribe-card.tsx`

Server component (no "use client" — pure markup). Deterministic gradient fallback from the tribe name; whole card is a link; 44px+ target with `active:scale` feedback per CLAUDE.md touch rules.

- [ ] **Step 1: Create the component**

```tsx
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Users, UserCheck } from "lucide-react";
import type { DiscoverTribe } from "@/lib/tribes";

const GRADIENTS = [
  "from-orange-400 to-rose-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-purple-400 to-fuchsia-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-purple-500",
];

function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function TribeCard({ tribe }: { tribe: DiscoverTribe }) {
  const t = useTranslations("tribes");
  const isOpen = tribe.access_type === "public";

  return (
    <Link
      href={`/tribes/${tribe.slug}`}
      className="group block rounded-xl border border-border overflow-hidden hover:border-primary/50 hover:bg-muted/50 transition-colors active:scale-[0.99]"
    >
      <div className={`relative h-24 bg-gradient-to-br ${gradientFor(tribe.name)}`}>
        {tribe.cover_image_url ? (
          <Image
            src={tribe.cover_image_url}
            alt={tribe.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-white/80">
            {tribe.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
          {tribe.name}
        </h3>
        {tribe.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {tribe.description}
          </p>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {isOpen ? <Users className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          {isOpen ? t("accessOpen") : t("accessRequest")}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/tribes/tribe-card.tsx
git commit -m "feat(tribes): TribeCard for discovery surfaces"
```

### Task 4: `/tribes` index — `app/[locale]/tribes/page.tsx`

**Files:**
- Create: `app/[locale]/tribes/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link, locales } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { TribeCard } from "@/components/tribes/tribe-card";
import { getDiscoverTribes } from "@/lib/tribes";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import type { Locale } from "@/lib/types";

export const revalidate = 300;

type PageProps = { params: Promise<{ locale: Locale }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tribes" });
  return generateLocalizedMetadata({
    locale,
    path: "/tribes",
    title: t("discoverTitle"),
    description: t("discoverSubtitle"),
    keywords: [
      "Da Lat communities",
      "Dalat groups",
      "Da Lat tribes",
      "meet people Da Lat",
      "hội nhóm Đà Lạt",
      "cộng đồng Đà Lạt",
    ],
  });
}

export default async function TribesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tribes");
  const tribes = await getDiscoverTribes();

  return (
    <main className="container max-w-6xl mx-auto px-4 py-8">
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: "Home", url: `https://dalat.app/${locale}` },
          { name: t("discoverTitle"), url: `https://dalat.app/${locale}/tribes` },
        ])}
      />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">{t("discoverTitle")}</h1>
          <p className="text-muted-foreground max-w-xl">{t("discoverSubtitle")}</p>
        </div>
        <Link href="/tribes/new">
          <Button className="gap-2 active:scale-95 transition-all">
            <Plus className="w-4 h-4" />
            {t("startTribe")}
          </Button>
        </Link>
      </div>

      {tribes.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">{t("emptyTitle")}</p>
          <Link href="/tribes/new">
            <Button size="lg" className="gap-2 active:scale-95 transition-all">
              <Plus className="w-4 h-4" />
              {t("emptyCta")}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {tribes.map((tribe) => (
            <TribeCard key={tribe.id} tribe={tribe} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/[locale]/tribes/page.tsx"
git commit -m "feat(tribes): /tribes discovery index"
```

### Task 5: Homepage strip — `components/home/tribes-strip.tsx` + mount

**Files:**
- Create: `components/home/tribes-strip.tsx`
- Modify: `app/[locale]/page.tsx` (mount after the `RecommendedEventsProvider` block — below the event feed so the core feed stays above; deliberate placement tweak vs spec's "after ForYouSection", flag in summary)

- [ ] **Step 1: Create the strip (server component, returns null when empty per spec)**

```tsx
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { TribeCard } from "@/components/tribes/tribe-card";
import { getDiscoverTribes } from "@/lib/tribes";

export async function TribesStrip() {
  const tribes = await getDiscoverTribes();
  if (tribes.length === 0) return null;
  const t = await getTranslations("tribes");

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">{t("findYourTribe")}</h2>
        <Link
          href="/tribes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 -mr-3 rounded-lg"
        >
          {t("seeAll")}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
        {tribes.slice(0, 8).map((tribe) => (
          <div key={tribe.id} className="w-56 shrink-0 snap-start">
            <TribeCard tribe={tribe} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount in `app/[locale]/page.tsx`**

Add import: `import { TribesStrip } from "@/components/home/tribes-strip";`
Insert AFTER the closing `</RecommendedEventsProvider>` tag, inside the same container div:

```tsx
        <Suspense fallback={null}>
          <TribesStrip />
        </Suspense>
```

- [ ] **Step 3: Commit**

```bash
git add components/home/tribes-strip.tsx "app/[locale]/page.tsx"
git commit -m "feat(home): Find-your-tribe discovery strip"
```

### Task 6: Verify build + local render

- [ ] **Step 1: Full build (includes i18n namespace guard in prebuild)**

Run: `npm run build` — CONFIRM the output shows the guard ran (look for `check-client-namespaces` passing); do NOT trust exit code alone (Jul 9: a local build passed while the same commit failed the guard on Vercel — root cause of that discrepancy still unknown, so verify explicitly).
Also run standalone: `node scripts/check-client-namespaces.mjs && echo GUARD_OK`
Expected: `GUARD_OK`.

- [ ] **Step 2: Render check in dev against prod DB (seeds land in Task 7 — before seeding, expect the translated empty state; after seeding, cards)**

Run: `npm run dev -- -p 3005` then `curl -s http://127.0.0.1:3005/en/tribes | grep -o "Tribes of Đà Lạt\|Start a tribe" | sort -u` (use 127.0.0.1, not localhost — stale-SW memory)
Expected: both strings. Then `curl -s http://127.0.0.1:3005/vi/tribes | grep -c "hội"` ≥ 1. Kill the dev server after.

### Task 7: Seed 8 starter tribes in prod

**Files:**
- Create: `scripts/seed-tribes.sql` (committed for the record; idempotent)

Prod writes go through `scripts/supabase-run-sql.sh` (the `.env.local` service key is stale — memory: "prod writes need SQL runner not .env.local key"). Owner: resolve Yan's profile id FIRST, then substitute.

- [ ] **Step 1: Find the owner id**

Run: `echo "SELECT id, username, display_name FROM profiles WHERE username IN ('yan','yang','vibeyang') OR display_name ILIKE '%yan%' LIMIT 5;" > /tmp/owner.sql && ./scripts/supabase-run-sql.sh /tmp/owner.sql`
Expected: one obvious row for Yan; use its `id` as `:OWNER` below. If ambiguous, STOP and ask Yan which account owns the seeds.

- [ ] **Step 2: Write `scripts/seed-tribes.sql`** (replace `:OWNER` literal before running; `WHERE NOT EXISTS` keeps it idempotent — safe to re-run)

```sql
INSERT INTO tribes (slug, name, description, access_type, is_listed, created_by)
SELECT v.slug, v.name, v.description, 'public', true, ':OWNER'::uuid
FROM (VALUES
  ('hiking-trails', 'Hiking & Trails', 'Pine forests, waterfall chases, sunrise summits. We walk, we wander, we regret nothing (except that last hill).'),
  ('coffee-crawl', 'Coffee Crawl', 'Đà Lạt runs on arabica. Weekly missions to find the city''s best cup — from hidden garden cafés to roasters who take it very seriously.'),
  ('pickleball-dalat', 'Pickleball Đà Lạt', 'The fastest-growing sport in the highlands. All levels, loaner paddles, zero judgment — just show up.'),
  ('digital-nomads', 'Digital Nomads Đà Lạt', 'Remote workers, laptop warriors, café campers. Coworking days, visa wisdom, and the eternal hunt for fast wifi and good light.'),
  ('photography-walks', 'Photography Walks', 'Golden hour over Xuân Hương, misty pine alleys, market portraits. Bring any camera — phones count.'),
  ('food-adventures', 'Food Adventures', 'Bánh căn at dawn, lẩu gà lá é at night. We eat our way through Đà Lạt one street stall at a time.'),
  ('sunrise-runners', 'Sunrise Runners', 'Easy pace around the lake before the city wakes up. Cool air, warm people, coffee after — always coffee after.'),
  ('board-games-chill', 'Board Games & Chill', 'Rainy season''s best answer. Strategy nights, party games, and friendly betrayal over hot cacao.')
) AS v(slug, name, description)
WHERE NOT EXISTS (SELECT 1 FROM tribes t WHERE t.slug = v.slug);
```

- [ ] **Step 3: Run against prod + verify**

Run: `./scripts/supabase-run-sql.sh /tmp/seed-tribes-resolved.sql` (the `:OWNER`-substituted copy)
Then: `echo "SELECT slug, access_type, is_listed FROM tribes ORDER BY created_at;" > /tmp/check.sql && ./scripts/supabase-run-sql.sh /tmp/check.sql`
Expected: 9 rows (8 seeds + the pre-existing invite-only tribe).

- [ ] **Step 4: Also add each seed's creator as leader member** (tribes UI expects the creator to be a member; the create API does this — mirror it)

```sql
INSERT INTO tribe_members (tribe_id, user_id, role, status)
SELECT t.id, t.created_by, 'leader', 'active'
FROM tribes t
WHERE t.created_by = ':OWNER'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM tribe_members m WHERE m.tribe_id = t.id AND m.user_id = t.created_by
  );
```

Run via the SQL runner; verify: `SELECT count(*) FROM tribe_members;` expected ≥ 8.

- [ ] **Step 5: Commit the SQL file**

```bash
git add scripts/seed-tribes.sql
git commit -m "feat(tribes): idempotent starter-tribes seed (run via supabase-run-sql.sh)"
```

### Task 8: Ship

- [ ] **Step 1: Re-verify local render now that prod has seeds** — repeat Task 6 Step 2; expect 8 tribe cards on `/en/tribes`.

- [ ] **Step 2: Push pipeline**

```bash
git fetch origin main
git rebase origin/main
npm run build          # re-verify after rebase
git push origin HEAD:main
```

- [ ] **Step 3: Verify deploy green (MANDATORY — poll until success)**

```bash
SHA=$(git rev-parse HEAD)
while true; do S=$(gh api "repos/goldenfocus/dalat-app/commits/$SHA/status" --jq .state); echo $S; [ "$S" != "pending" ] && break; sleep 30; done
```
Expected: `success`. On `failure`: get the `dpl_` id from the status description, fix forward, push again — do not end the session on a red deploy.

- [ ] **Step 4: Prod smoke**

- `curl -s https://dalat.app/en/tribes | grep -c "tribes/"` ≥ 8 (card links present)
- `curl -s https://dalat.app/vi/tribes | grep -o "Các hội nhóm"` non-empty (vi UI strings)
- Homepage: `curl -s https://dalat.app/en | grep -o "Find your tribe"` non-empty
- Click-through: `curl -s -o /dev/null -w "%{http_code}" https://dalat.app/en/tribes/coffee-crawl` → 200

- [ ] **Step 5: Post-Deploy Summary + cleanup**

Post the summary (format per CLAUDE.md), then:
```bash
cd ~/dalat-app
git worktree remove .worktrees/tribes-discovery
git branch -D tribes-discovery
```
