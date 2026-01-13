import { Resend } from "resend";

// Lazy-load the Resend client to avoid build errors when API key isn't set
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export interface EventInviteData {
  email: string;
  name?: string;
  token: string;
}

export interface EventDetails {
  id: string;
  title: string;
  date: Date;
  location: string;
  description?: string;
  imageUrl?: string;
}

/**
 * Send bulk event invitations using Resend's batch API.
 * Handles up to 100 emails per batch request.
 */
export async function sendBulkEventInvites(
  contacts: EventInviteData[],
  event: EventDetails,
  baseUrl: string
) {
  if (contacts.length === 0) {
    return { success: true, sent: 0, failed: 0 };
  }

  // Resend batch limit is 100 emails per request
  const BATCH_SIZE = 100;
  const batches: EventInviteData[][] = [];

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    batches.push(contacts.slice(i, i + BATCH_SIZE));
  }

  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  for (const batch of batches) {
    const emails = batch.map((contact) => ({
      from: "Dalat Events <events@dalat.app>",
      to: contact.email,
      subject: `You're invited: ${event.title}`,
      html: generateEventInviteHtml(contact, event, baseUrl),
    }));

    try {
      const result = await getResendClient().batch.send(emails);

      if (result.error) {
        totalFailed += batch.length;
        errors.push(result.error.message);
      } else {
        totalSent += batch.length;
      }
    } catch (error) {
      totalFailed += batch.length;
      errors.push(error instanceof Error ? error.message : "Unknown error");
    }
  }

  return {
    success: totalFailed === 0,
    sent: totalSent,
    failed: totalFailed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Send a single event invitation email.
 */
export async function sendEventInvite(
  contact: EventInviteData,
  event: EventDetails,
  baseUrl: string
) {
  try {
    const result = await getResendClient().emails.send({
      from: "Dalat Events <events@dalat.app>",
      to: contact.email,
      subject: `You're invited: ${event.title}`,
      html: generateEventInviteHtml(contact, event, baseUrl),
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, id: result.data?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate HTML email content for event invitations.
 * Using inline HTML for simplicity - can be replaced with React Email templates later.
 */
function generateEventInviteHtml(
  contact: EventInviteData,
  event: EventDetails,
  baseUrl: string
): string {
  const inviteUrl = `${baseUrl}/invite/${contact.token}`;
  const eventDate = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
    ${contact.name ? `<p style="font-size: 16px;">Hi ${contact.name},</p>` : "<p>Hi there,</p>"}

    <p style="font-size: 16px;">You've been invited to:</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 10px 0; color: #1f2937;">${event.title}</h2>
      <p style="margin: 5px 0; color: #6b7280;">📅 ${eventDate}</p>
      <p style="margin: 5px 0; color: #6b7280;">📍 ${event.location}</p>
      ${event.description ? `<p style="margin: 15px 0 0 0; color: #4b5563;">${event.description.slice(0, 200)}${event.description.length > 200 ? "..." : ""}</p>` : ""}
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        View Event & RSVP
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${inviteUrl}" style="color: #667eea;">${inviteUrl}</a>
    </p>
  </div>

  <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 20px;">
    Sent via Dalat Events
  </p>
</body>
</html>
  `.trim();
}

export { getResendClient };
