import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend";

interface ClaimRequest {
  entityType: "organizer" | "venue" | "profile";
  entitySlug: string;
  entityName: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body: ClaimRequest = await request.json();
    const { entityType, entitySlug, entityName, message } = body;

    if (!entityType || !entitySlug || !entityName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user's profile info
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single();

    // Record the claim request in the database
    if (entityType === "organizer") {
      await supabase
        .from("organizers")
        .update({
          claim_requested_at: new Date().toISOString(),
          claim_requested_by: user.id,
        })
        .eq("slug", entitySlug);
    }

    // Send email to claim@dalat.app
    const resend = getResendClient();
    const entityUrl = `https://dalat.app/${entitySlug}`;
    const adminUrl = `https://dalat.app/admin/${entityType}s/${entitySlug}`;

    await resend.emails.send({
      from: "Dalat Claims <claims@dalat.app>",
      to: "claim@dalat.app",
      subject: `🏷️ Claim Request: ${entityName} (${entityType})`,
      replyTo: user.email ?? undefined,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px;">🏷️ New Claim Request</h1>
  </div>

  <div style="background: #fffbeb; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #fcd34d; border-top: none;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #92400e; font-weight: 600; width: 120px;">Entity Type:</td>
        <td style="padding: 8px 0; color: #78350f;">${entityType.charAt(0).toUpperCase() + entityType.slice(1)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #92400e; font-weight: 600;">Entity Name:</td>
        <td style="padding: 8px 0; color: #78350f;">${entityName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #92400e; font-weight: 600;">Slug:</td>
        <td style="padding: 8px 0; color: #78350f;">${entitySlug}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #92400e; font-weight: 600;">Requester:</td>
        <td style="padding: 8px 0; color: #78350f;">
          ${profile?.display_name || profile?.username || "Unknown"}<br>
          <span style="font-size: 13px; color: #b45309;">${user.email}</span>
        </td>
      </tr>
    </table>

    ${
      message
        ? `
    <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #fcd34d;">
      <div style="color: #92400e; font-weight: 600; margin-bottom: 4px;">Message:</div>
      <div style="color: #78350f;">${message}</div>
    </div>
    `
        : ""
    }

    <div style="margin-top: 24px; display: flex; gap: 12px;">
      <a href="${entityUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">View Entity</a>
      <a href="${adminUrl}" style="display: inline-block; background: #78350f; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Admin Panel</a>
    </div>

    <p style="margin-top: 24px; font-size: 13px; color: #92400e;">
      Reply to this email to contact the requester directly.
    </p>
  </div>
</body>
</html>
      `.trim(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Claim request error:", error);
    return NextResponse.json(
      { error: "Failed to submit claim request" },
      { status: 500 }
    );
  }
}
