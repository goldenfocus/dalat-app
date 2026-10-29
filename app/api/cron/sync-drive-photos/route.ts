import { NextResponse } from "next/server";
import { syncDrivePhotos } from "@/lib/drive-photos/sync";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  const key = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  if (!key) return NextResponse.json({state:"setup_required",reason:"GOOGLE_DRIVE_API_KEY is not configured"});
  try {
    return NextResponse.json(await syncDrivePhotos(key));
  } catch {
    // Don't expose provider messages or keys in the cron response or logs.
    console.error("[drive-photos] sync failed; inspect the private sync state and Google Drive API setup");
    return NextResponse.json({state:"failed",error:"Drive photo sync failed; check API access and private sync state"},{status:502});
  }
}
