import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { experienceAdmin } from "@/lib/experiences/server";
import { syncSocialHouseMenu } from "@/lib/menu/social-house-source";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncSocialHouseMenu(experienceAdmin());
    revalidatePath("/[locale]/[slug]", "page");
    revalidatePath("/[locale]/venues/[slug]/menu", "page");
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ error: "menu_sync_failed" }, { status: 502 });
  }
}
