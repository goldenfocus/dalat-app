import { Resend } from 'resend';
import type { EmailNotificationContent, ChannelResult } from '../types';
import { getRandomInspiringFooter } from '../inspiring-footers';
import { SITE_DOMAIN, SITE_URL } from '@/lib/constants';

// Lazy-load the Resend client
let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[email] RESEND_API_KEY not configured');
      return null;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string;
  content: EmailNotificationContent;
  replyTo?: string;
}

/**
 * Send an email notification via Resend.
 */
export async function sendEmailNotification(
  options: SendEmailOptions
): Promise<ChannelResult> {
  const { to, content, replyTo } = options;
  const client = getResendClient();

  if (!client) {
    return {
      channel: 'email',
      success: false,
      error: 'Resend client not configured',
    };
  }

  try {
    const inspiringFooter = getRandomInspiringFooter();
    const html = content.html || generateDefaultEmailHtml(content, inspiringFooter);
    const text = content.text || generateDefaultEmailText(content, inspiringFooter);

    const result = await client.emails.send({
      from: `Dalat Events <events@${SITE_DOMAIN}>`,
      to,
      subject: content.subject,
      html,
      text, // Plain text alternative for better deliverability
      replyTo,
    });

    if (result.error) {
      console.error('[email] Failed to send:', result.error.message);
      return {
        channel: 'email',
        success: false,
        error: result.error.message,
      };
    }

    console.log('[email] Sent to:', to);
    return {
      channel: 'email',
      success: true,
      messageId: result.data?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email] Exception sending:', message);
    return {
      channel: 'email',
      success: false,
      error: message,
    };
  }
}

/**
 * Send bulk emails via Resend's batch API.
 * Handles up to 100 emails per batch request.
 */
export async function sendBulkEmails(
  emails: Array<{ to: string; content: EmailNotificationContent }>
): Promise<{ sent: number; failed: number; errors?: string[] }> {
  const client = getResendClient();

  if (!client) {
    return { sent: 0, failed: emails.length, errors: ['Resend client not configured'] };
  }

  if (emails.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const BATCH_SIZE = 100;
  const batches: typeof emails[] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    batches.push(emails.slice(i, i + BATCH_SIZE));
  }

  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  for (const batch of batches) {
    const emailRequests = batch.map((email) => {
      const inspiringFooter = getRandomInspiringFooter();
      return {
        from: `Dalat Events <events@${SITE_DOMAIN}>`,
        to: email.to,
        subject: email.content.subject,
        html: email.content.html || generateDefaultEmailHtml(email.content, inspiringFooter),
        text: email.content.text || generateDefaultEmailText(email.content, inspiringFooter),
      };
    });

    try {
      const result = await client.batch.send(emailRequests);

      if (result.error) {
        totalFailed += batch.length;
        errors.push(result.error.message);
      } else {
        totalSent += batch.length;
      }
    } catch (error) {
      totalFailed += batch.length;
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  return {
    sent: totalSent,
    failed: totalFailed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Generate default HTML email from notification content.
 */
function generateDefaultEmailHtml(content: EmailNotificationContent, inspiringFooter: string): string {
  const primaryButton = content.primaryActionUrl && content.primaryActionLabel
    ? `<a href="${content.primaryActionUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin-right: 10px;">${content.primaryActionLabel}</a>`
    : '';

  const secondaryButton = content.secondaryActionUrl && content.secondaryActionLabel
    ? `<a href="${content.secondaryActionUrl}" style="display: inline-block; background: #f3f4f6; color: #374151; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">${content.secondaryActionLabel}</a>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${content.title}</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">${content.body}</p>

    ${(primaryButton || secondaryButton) ? `
    <div style="text-align: center; margin: 30px 0;">
      ${primaryButton}
      ${secondaryButton}
    </div>
    ` : ''}
  </div>

  <div style="text-align: center; margin-top: 20px;">
    <p style="font-size: 13px; color: #9ca3af; font-style: italic; margin: 0 0 8px 0;">
      "${inspiringFooter}"
    </p>
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
      Sent via <a href="${SITE_URL}" style="color: #667eea; text-decoration: none;">${SITE_DOMAIN}</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email from notification content.
 * Important for email deliverability - spam filters prefer emails with text alternatives.
 */
function generateDefaultEmailText(content: EmailNotificationContent, inspiringFooter: string): string {
  const lines: string[] = [
    content.title,
    '',
    content.body,
    '',
  ];

  if (content.primaryActionUrl) {
    lines.push(`${content.primaryActionLabel || 'Click here'}: ${content.primaryActionUrl}`);
  }

  if (content.secondaryActionUrl) {
    lines.push(`${content.secondaryActionLabel || 'Alternative'}: ${content.secondaryActionUrl}`);
  }

  lines.push('', '---', `"${inspiringFooter}"`, '', `Sent via ${SITE_DOMAIN} (${SITE_URL})`);

  return lines.join('\n');
}
