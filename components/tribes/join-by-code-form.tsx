"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tribe } from "@/lib/types";

interface JoinByCodeFormProps {
  tribe: Pick<Tribe, "slug" | "name" | "description" | "cover_image_url" | "access_type">;
  code: string;
  isAuthenticated: boolean;
  locale: string;
}

export function JoinByCodeForm({ tribe, code, isAuthenticated, locale }: JoinByCodeFormProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    if (!isAuthenticated) {
      router.push(`/${locale}/auth/login?redirect=/tribes/join/${code}`);
      return;
    }

    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/tribes/${tribe.slug}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to join");
        return;
      }

      router.push(`/${locale}/tribes/${tribe.slug}`);
    });
  }

  return (
    <Card className="w-full max-w-md">
      {tribe.cover_image_url && (
        <div className="relative h-32 overflow-hidden rounded-t-lg">
          <Image
            src={tribe.cover_image_url}
            alt={tribe.name}
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
      )}

      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary mb-2">
          {tribe.name.charAt(0).toUpperCase()}
        </div>
        <CardTitle>{tribe.name}</CardTitle>
        {tribe.description && (
          <CardDescription>{tribe.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="w-4 h-4" />
          <span>{t("inviteOnlyDesc")}</span>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button
          onClick={handleJoin}
          disabled={isPending}
          className="w-full px-4 py-3"
        >
          <Users className="w-4 h-4 mr-2" />
          {isPending ? "Joining..." : t("joinTribe")}
        </Button>

        {!isAuthenticated && (
          <p className="text-xs text-center text-muted-foreground">
            You&apos;ll need to sign in to join this tribe.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
