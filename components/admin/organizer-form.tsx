"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { OrganizerLogoUpload } from "@/components/admin/organizer-logo-upload";
import type { Organizer } from "@/lib/types";

interface OrganizerFormProps {
  organizer?: Organizer;
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
}

function finalizeSlug(input: string): string {
  return sanitizeSlug(input).replace(/^-+|-+$/g, "");
}

function suggestSlug(title: string): string {
  return sanitizeSlug(title).slice(0, 50);
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function OrganizerForm({ organizer }: OrganizerFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(
    organizer?.logo_url ?? null
  );
  const [name, setName] = useState(organizer?.name ?? "");

  const isEditing = !!organizer;

  // Slug state
  const [slug, setSlug] = useState(organizer?.slug ?? "");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugTouched, setSlugTouched] = useState(false);

  // Check slug availability
  useEffect(() => {
    if (!slug || !slugTouched) {
      setSlugStatus("idle");
      return;
    }

    if (slug.length < 1 || !/^[a-z0-9-]+$/.test(slug)) {
      setSlugStatus("invalid");
      return;
    }

    if (isEditing && slug === organizer?.slug) {
      setSlugStatus("available");
      return;
    }

    setSlugStatus("checking");

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("organizers")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      setSlugStatus(data ? "taken" : "available");
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, slugTouched, isEditing, organizer?.slug]);

  // Auto-suggest slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!isEditing && !slugTouched) {
      setSlug(suggestSlug(newName));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(sanitizeSlug(e.target.value));
    setSlugTouched(true);
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const websiteUrl = formData.get("website_url") as string;
    const facebookUrl = formData.get("facebook_url") as string;
    const instagramUrl = formData.get("instagram_url") as string;
    const isVerified = formData.get("is_verified") === "on";

    if (!name) {
      setError("Name is required");
      return;
    }

    const cleanSlug = finalizeSlug(slug);
    if (!cleanSlug) {
      setError("URL slug is required");
      return;
    }

    if (slugStatus === "taken") {
      setError("This URL is already taken");
      return;
    }

    const supabase = createClient();

    startTransition(async () => {
      const data = {
        name,
        slug: cleanSlug,
        description: description || null,
        logo_url: logoUrl,
        website_url: websiteUrl || null,
        facebook_url: facebookUrl || null,
        instagram_url: instagramUrl || null,
        is_verified: isVerified,
      };

      if (isEditing) {
        const { error: updateError } = await supabase
          .from("organizers")
          .update(data)
          .eq("id", organizer.id);

        if (updateError) {
          setError(updateError.message);
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from("organizers")
          .insert(data);

        if (insertError) {
          setError(insertError.message);
          return;
        }
      }

      router.push("/admin/organizers");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Logo upload */}
          <OrganizerLogoUpload
            organizerId={organizer?.id}
            organizerName={name || "this organizer"}
            currentLogoUrl={logoUrl}
            onLogoChange={setLogoUrl}
            aiLogoButton={
              <AIOrganizerLogoDialog
                organizerId={organizer?.id}
                organizerName={name || "this organizer"}
                currentLogoUrl={logoUrl}
                onLogoGenerated={setLogoUrl}
              />
            }
          />

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Organization name *</Label>
            <Input
              id="name"
              name="name"
              placeholder="Phố Bên Đồi"
              value={name}
              onChange={handleNameChange}
              required
            />
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL slug *</Label>
            <div className="flex items-center gap-0">
              <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input">
                /organizers/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={handleSlugChange}
                onBlur={() => setSlug(finalizeSlug(slug))}
                placeholder="pho-ben-doi"
                className="rounded-l-none"
              />
            </div>
            {slugTouched && (
              <p
                className={`text-xs ${
                  slugStatus === "available"
                    ? "text-green-600"
                    : slugStatus === "taken" || slugStatus === "invalid"
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
              >
                {slugStatus === "checking" && "Checking..."}
                {slugStatus === "available" && "✓ Available"}
                {slugStatus === "taken" && "✗ Already taken"}
                {slugStatus === "invalid" && "Only lowercase letters, numbers, and hyphens"}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              placeholder="About this organization..."
              defaultValue={organizer?.description ?? ""}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Links</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website_url">Website</Label>
                <Input
                  id="website_url"
                  name="website_url"
                  type="url"
                  placeholder="https://..."
                  defaultValue={organizer?.website_url ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook_url">Facebook</Label>
                <Input
                  id="facebook_url"
                  name="facebook_url"
                  type="url"
                  placeholder="https://facebook.com/..."
                  defaultValue={organizer?.facebook_url ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram_url">Instagram</Label>
                <Input
                  id="instagram_url"
                  name="instagram_url"
                  type="url"
                  placeholder="https://instagram.com/..."
                  defaultValue={organizer?.instagram_url ?? ""}
                />
              </div>
            </div>
          </div>

          {/* Verified toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_verified"
              name="is_verified"
              defaultChecked={organizer?.is_verified ?? false}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="is_verified" className="font-normal">
              Verified organizer (shows badge, priority in listings)
            </Label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                ? "Save changes"
                : "Create organizer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
