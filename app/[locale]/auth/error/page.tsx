import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/routing";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;

  // Common error messages with user-friendly explanations
  const isExpiredLink = error?.includes("expired") || error?.includes("invalid");
  const isAlreadyConfirmed = error?.includes("already") || error?.includes("confirmed");

  return (
    <div className="space-y-4">
      {isAlreadyConfirmed ? (
        <p className="text-sm text-muted-foreground">
          Your email may already be confirmed. Try signing in below.
        </p>
      ) : isExpiredLink ? (
        <p className="text-sm text-muted-foreground">
          This link has expired or was already used. Please request a new one.
        </p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Something went wrong. Your email may already be confirmed - try signing in.
        </p>
      )}

      <Button asChild className="w-full">
        <Link href="/auth/login">Try signing in</Link>
      </Button>
    </div>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Oops!
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
