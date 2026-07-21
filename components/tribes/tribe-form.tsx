"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Globe, Eye, Lock, EyeOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { TribeAccessType } from "@/lib/types";

interface TribeFormProps {
  locale: string;
}

const accessTypes: { value: TribeAccessType; icon: React.ReactNode; labelKey: string; descKey: string }[] = [
  { value: "public", icon: <Globe className="w-4 h-4" />, labelKey: "public", descKey: "publicDesc" },
  { value: "request", icon: <Eye className="w-4 h-4" />, labelKey: "request", descKey: "requestDesc" },
  { value: "invite_only", icon: <Lock className="w-4 h-4" />, labelKey: "inviteOnly", descKey: "inviteOnlyDesc" },
  { value: "secret", icon: <EyeOff className="w-4 h-4" />, labelKey: "secret", descKey: "secretDesc" },
];

export function TribeForm({ locale }: TribeFormProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accessType, setAccessType] = useState<TribeAccessType>("public");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/tribes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            access_type: accessType,
          }),
        });

        // Parse after the status check is decided — a non-JSON 500 must not throw past setError
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.code ? t(`settingsForm.${data.code}`) : t("createFailed"));
          return;
        }

        router.push(`/${locale}/tribes/${data.tribe.slug}`);
      } catch (err) {
        console.error("Tribe create error:", err);
        setError(t("createFailed"));
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={`/${locale}`}
        className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{tCommon("back")}</span>
      </Link>

      <h1 className="text-2xl font-bold mt-6 mb-8">{t("createTribe")}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">{t("form.name")}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("form.namePlaceholder")}
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t("form.descriptionOptional")}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("form.descriptionPlaceholder")}
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <Label>{t("accessType")}</Label>
          <RadioGroup value={accessType} onValueChange={(v) => setAccessType(v as TribeAccessType)}>
            {accessTypes.map((type) => (
              <div
                key={type.value}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  accessType === type.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onClick={() => setAccessType(type.value)}
              >
                <RadioGroupItem value={type.value} id={type.value} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {type.icon}
                    <Label htmlFor={type.value} className="font-medium cursor-pointer">
                      {t(type.labelKey)}
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{t(type.descKey)}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full px-4 py-3" disabled={isPending}>
          {isPending ? "Creating..." : t("createTribe")}
        </Button>
      </form>
    </div>
  );
}
