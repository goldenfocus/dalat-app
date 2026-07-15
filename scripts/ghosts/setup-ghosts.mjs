// One-time ghost roster setup for the ghost-boost feature.
// Creates 12 auth users + profiles and registers them in the service-role-only
// seed_profiles table. No avatar photos by default — initials avatars read
// more human than 12 perfect AI faces and can't be reverse-image-searched.
//
// Usage: node scripts/ghosts/setup-ghosts.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// .env.local values can carry stray literal "\n" — sanitize before use
const clean = (v) => (v ?? "").replace(/\\n/g, "").trim();
const supabase = createClient(
  clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ROSTER = [
  { username: "minhtrandl", display_name: "Minh Trần", bio: "Cà phê & leo núi ⛰️" },
  { username: "linhnguyen.dl", display_name: "Linh Nguyễn", bio: "Đà Lạt local. Trà hơn cà phê." },
  { username: "tuanpham92", display_name: "Tuấn Phạm", bio: "guitar, lửa trại, kể chuyện" },
  { username: "huongle.dalat", display_name: "Hương Lê", bio: "weekend explorer" },
  { username: "ducvo.dl", display_name: "Đức Võ", bio: "chụp ảnh dạo" },
  { username: "thaobui.xinchao", display_name: "Thảo Bùi", bio: "mới về Đà Lạt 🌲" },
  { username: "khoaly.dl", display_name: "Khoa Lý", bio: "boardgames & bánh tráng nướng" },
  { username: "anhdang.dl", display_name: "Anh Đặng", bio: "chill là chính" },
  { username: "sarah.dalat", display_name: "Sarah M.", bio: "Kiwi in Vietnam 🇳🇿 tea > coffee, fight me" },
  { username: "tomh.travels", display_name: "Tom H.", bio: "digital nomad, third month in Dalat" },
  { username: "elenak.photo", display_name: "Elena K.", bio: "photographer, pine forest addict" },
  { username: "jakeonabike", display_name: "Jake R.", bio: "motorbike loops & cheap bánh mì" },
];

let ok = 0;
for (const ghost of ROSTER) {
  const email = `ghost.${ghost.username.replace(/[^a-z0-9]/g, "")}@dalat.app`;
  const { data: user, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(),
  });
  if (error) {
    console.error(`skip ${ghost.username}: ${error.message}`);
    continue;
  }
  // handle_new_user trigger auto-creates the profile row — upsert fields
  const { error: profErr } = await supabase.from("profiles").upsert({
    id: user.user.id,
    username: ghost.username,
    display_name: ghost.display_name,
    bio: ghost.bio,
  });
  if (profErr) {
    console.error(`profile ${ghost.username}: ${profErr.message}`);
    continue;
  }
  const { error: seedErr } = await supabase
    .from("seed_profiles")
    .upsert({ profile_id: user.user.id });
  if (seedErr) {
    console.error(`seed ${ghost.username}: ${seedErr.message}`);
    continue;
  }
  ok++;
  console.log(`✓ ${ghost.display_name} (@${ghost.username})`);
}

const { count } = await supabase
  .from("seed_profiles")
  .select("*", { count: "exact", head: true });
console.log(`\nCreated ${ok}/${ROSTER.length} this run. Ghost roster total: ${count}`);
