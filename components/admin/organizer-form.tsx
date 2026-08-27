"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { OrganizerLogoUpload } from "@/components/admin/organizer-logo-upload";
import { AIOrganizerLogoDialog } from "@/components/admin/ai-organizer-logo-dialog";
import { Trash2, AlertTriangle } from "lucide-react";
import type { Organizer } from "@/lib/types";
import { sanitizeSlug, suggestSlug, finalizeSlug } from "@/lib/utils";
import { useUnifiedSlugCheck } from "@/lib/hooks/use-unified-slug-check";

interface OrganizerFormProps {
  organizer?: Organizer;
}

export function OrganizerForm({ organizer }: OrganizerFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(
    organizer?.logo_url ?? null
  );
  const [name, setName] = useState(organizer?.name ?? "");

  const isEditing = !!organizer;

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [linkedEventsCount, setLinkedEventsCount] = useState<number | null>(null);

  // Slug state
  const [slug, setSlug] = useState(organizer?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  // Unified slug check across all entity types (venues, organizers, profiles)
  const { status: slugStatus, message: slugMessage } = useUnifiedSlugCheck({
    slug,
    entityType: "organizer",
    entityId: organizer?.id,
    originalSlug: organizer?.slug,
    touched: slugTouched,
  });

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

  // Check for linked events when delete is initiated
  const initiateDelete = async () => {
    if (!organizer) return;

    const supabase = createClient();
    const { count } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("organizer_id", organizer.id);

    setLinkedEventsCount(count ?? 0);
    setShowDeleteConfirm(true);
  };

  // Handle actual deletion
  const handleDelete = async () => {
    if (!organizer) return;

    setIsDeleting(true);
    setError(null);

    const supabase = createClient();

    // Unlink events from this organizer
    const { error: unlinkEventsError } = await supabase
      .from("events")
      .update({ organizer_id: null })
      .eq("organizer_id", organizer.id);

    if (unlinkEventsError) {
      setError(`Failed to unlink events: ${unlinkEventsError.message}`);
      setIsDeleting(false);
      return;
    }

    // Verify events were unlinked (RLS might silently block the update)
    const { count: remainingEvents } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("organizer_id", organizer.id);

    if (remainingEvents && remainingEvents > 0) {
      setError(`Cannot delete: ${remainingEvents} events are still linked. You may not have permission to unlink them.`);
      setIsDeleting(false);
      return;
    }

    // Unlink verification requests (no ON DELETE behavior)
    await supabase
      .from("verification_requests")
      .update({ organizer_id: null })
      .eq("organizer_id", organizer.id);

    // Delete logo from storage if exists
    if (organizer.logo_url) {
      const oldPath = organizer.logo_url.split("/organizer-logos/")[1];
      if (oldPath) {
        await supabase.storage.from("organizer-logos").remove([oldPath]);
      }
    }

    // Delete the organizer
    const { error: deleteError } = await supabase
      .from("organizers")
      .delete()
      .eq("id", organizer.id);

    if (deleteError) {
      setError(`Failed to delete: ${deleteError.message}`);
      setIsDeleting(false);
      return;
    }

    router.push("/admin/organizers");
    router.refresh();
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

    if (slugStatus === "taken" || slugStatus === "reserved" || slugStatus === "invalid" || slugStatus === "too_short") {
      setError(slugStatus === "reserved" ? "This URL is reserved" : "This URL is not available");
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
                dalat.app/
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
            {slugTouched && slugMessage && (
              <p
                className={`text-xs ${
                  slugStatus === "available"
                    ? "text-green-600"
                    : slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "reserved"
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
              >
                {slugStatus === "checking" && "Checking..."}
                {slugStatus === "available" && `✓ ${slugMessage}`}
                {slugStatus === "taken" && "✗ Already taken"}
                {slugStatus === "reserved" && "✗ This URL is reserved"}
                {slugStatus === "invalid" && "Only lowercase letters, numbers, dots, and hyphens"}
                {slugStatus === "too_short" && "URL must be at least 2 characters"}
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
            <Button type="submit" disabled={isPending || isDeleting} className="flex-1">
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
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </div>

          {/* Delete section - only show when editing */}
          {isEditing && (
            <div className="pt-6 border-t">
              {!showDeleteConfirm ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={initiateDelete}
                  disabled={isPending || isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete organizer
                </Button>
              ) : (
                <div className="space-y-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">Delete this organizer?</p>
                      {linkedEventsCount && linkedEventsCount > 0 ? (
                        <p className="text-sm text-muted-foreground mt-1">
                          This organizer is linked to {linkedEventsCount} event{linkedEventsCount !== 1 ? "s" : ""}.
                          These events will be unlinked but not deleted.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1">
                          This action cannot be undone.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Yes, delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
