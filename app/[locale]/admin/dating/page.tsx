import { notFound } from "next/navigation";
import { getMessages } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DatingAdmin } from "@/components/dating/dating-admin";
import type { DatingCopy } from "@/lib/dating/live-types";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function DatingReports() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) notFound();
  const { data: staff } = await db.rpc("dating_is_staff");
  if (!staff) notFound();
  const { data, error } = await db.rpc("dating_admin_reports");
  if (error) throw new Error("Dating reports unavailable");
  const copy = (await getMessages()).dating as DatingCopy;
  return <DatingAdmin initial={data ?? []} copy={copy} />;
}
