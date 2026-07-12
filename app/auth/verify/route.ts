import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

/**
 * This route acts as a click-through gate for email verification links.
 * It redirects to a confirmation page that requires user interaction,
 * preventing email security scanners from consuming single-use tokens.
 *
 * Flow:
 * 1. Email contains link to /auth/verify?token_hash=...&type=...
 * 2. This route redirects to /en/auth/verify?token_hash=...&type=...
 * 3. User clicks "Confirm" button on that page
 * 4. Browser redirects to /auth/confirm which verifies via verifyOtp()
 *
 * Exception: password recovery skips the interstitial and goes straight to
 * the reset form — the form submit is the human gate there, so the token
 * is only consumed when the user sets their new password.
 *
 * Note: We use token_hash instead of token to bypass the PKCE flow,
 * which fixes authentication issues when magic links open in a different
 * browser than the PWA (where the PKCE verifier is stored).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") || "magiclink";
  const locale = url.searchParams.get("locale") || "en";

  if (!tokenHash) {
    return NextResponse.redirect(new URL(`/${locale}/auth/error?error=No token provided`, url.origin));
  }

  if (type === "recovery") {
    const resetPageUrl = new URL(`/${locale}/auth/reset-password`, url.origin);
    resetPageUrl.searchParams.set("token_hash", tokenHash);
    return NextResponse.redirect(resetPageUrl);
  }

  // Redirect to our confirmation page with token_hash
  // Use the locale from the email template for proper localization
  const confirmPageUrl = new URL(`/${locale}/auth/verify`, url.origin);
  confirmPageUrl.searchParams.set("token_hash", tokenHash);
  confirmPageUrl.searchParams.set("type", type);

  return NextResponse.redirect(confirmPageUrl);
}
