import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const error = params?.error;

  // Common error messages with user-friendly explanations
  const isExpiredLink = error?.includes("expired") || error?.includes("invalid");
  const isAlreadyConfirmed = error?.includes("already") || error?.includes("confirmed");

  // User-friendly hint based on error type
  const friendlyHint = isAlreadyConfirmed
    ? t("error.alreadyConfirmed")
    : isExpiredLink
    ? t("error.linkExpired")
    : null;

  return (
    <div className="space-y-4">
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">{error}</p>
          {friendlyHint && (
            <p className="text-sm text-muted-foreground">{friendlyHint}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("error.genericMessage")}
        </p>
      )}

      <Button asChild className="w-full">
        <Link href="/auth/login">{t("error.trySigningIn")}</Link>
      </Button>
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth");
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {t("error.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense>
                <ErrorContent searchParams={searchParams} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
