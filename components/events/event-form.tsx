"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PlaceAutocomplete } from "@/components/events/place-autocomplete";
import { EventMediaUpload } from "@/components/events/event-media-upload";
import { FlyerBuilder } from "@/components/events/flyer-builder";
import { RecurrencePicker } from "@/components/events/recurrence-picker";
import { SponsorForm, createSponsorsForEvent, type DraftSponsor } from "@/components/events/sponsor-form";
import { toUTCFromDaLat, getDateTimeInDaLat } from "@/lib/timezone";
import { canEditSlug } from "@/lib/config";
import { getDefaultRecurrenceData, buildRRule } from "@/lib/recurrence";
import type { Event, RecurrenceFormData, Sponsor, EventSponsor } from "@/lib/types";

interface EventFormProps {
  userId: string;
  event?: Event;
  initialSponsors?: (EventSponsor & { sponsors: Sponsor })[];
}

/**
 * Sanitize a string into a valid slug format (while typing)
 */
function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Final cleanup of slug (on blur/submit) - removes leading/trailing dashes
 */
function finalizeSlug(input: string): string {
  return sanitizeSlug(input).replace(/^-+|-+$/g, "");
}

/**
 * Generate a slug from title with random suffix (for fallback/auto-generation)
 */
function generateSlug(title: string): string {
  const base = sanitizeSlug(title).slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Generate a suggested slug from title (without random suffix)
 */
function suggestSlug(title: string): string {
  return sanitizeSlug(title).slice(0, 50);
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function EventForm({ userId, event, initialSponsors = [] }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(
    event?.image_url ?? null
  );

  const isEditing = !!event;
  const slugEditable = canEditSlug(isEditing);

  // Title state (controlled for FlyerBuilder integration)
  const [title, setTitle] = useState(event?.title ?? "");

  // Pending file for upload (only for new events with file/generated image)
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Slug state
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugTouched, setSlugTouched] = useState(false);

  // Recurrence state (only for new events)
  const [recurrence, setRecurrence] = useState<RecurrenceFormData>(getDefaultRecurrenceData());
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    event?.starts_at ? new Date(event.starts_at) : null
  );

  // Draft sponsors state (for new events)
  const [draftSponsors, setDraftSponsors] = useState<DraftSponsor[]>([]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!slug || !slugTouched) {
      setSlugStatus("idle");
      return;
    }

    // Basic validation
    if (slug.length < 1 || !/^[a-z0-9-]+$/.test(slug)) {
      setSlugStatus("invalid");
      return;
    }

    // Skip check if slug hasn't changed from original
    if (isEditing && slug === event?.slug) {
      setSlugStatus("available");
      return;
    }

    setSlugStatus("checking");

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (data) {
        setSlugStatus("taken");
      } else {
        setSlugStatus("available");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, slugTouched, isEditing, event?.slug]);

  // Handle title change and auto-suggest slug
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      if (!isEditing && !slugTouched && slugEditable) {
        const suggested = suggestSlug(newTitle);
        setSlug(suggested);
      }
    },
    [isEditing, slugTouched, slugEditable]
  );

  // Handle image change from FlyerBuilder
  const handleImageChange = useCallback(
    (url: string | null, file?: File) => {
      setImageUrl(url);
      setPendingFile(file ?? null);
    },
    []
  );

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeSlug(e.target.value);
    setSlug(sanitized);
    setSlugTouched(true);
  };

  const handleSlugBlur = () => {
    setSlug(finalizeSlug(slug));
  };

  // Track selected date for recurrence picker
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      setSelectedDate(new Date(dateStr + "T12:00:00"));
    } else {
      setSelectedDate(null);
    }
  };

  // Parse existing event date/time in Da Lat timezone
  const defaults = event ? getDateTimeInDaLat(event.starts_at) : { date: "", time: "" };

  // Helper to upload image (file or base64) to Supabase storage
  async function uploadImage(
    supabase: ReturnType<typeof createClient>,
    eventId: string
  ): Promise<string | null> {
    // If we have a pending file, upload it
    if (pendingFile) {
      const ext = pendingFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(fileName, pendingFile, { cacheControl: "3600", upsert: true });

      if (uploadError) throw new Error("Failed to upload image");

      const { data: { publicUrl } } = supabase.storage
        .from("event-media")
        .getPublicUrl(fileName);

      return publicUrl;
    }

    // If imageUrl is a base64/data URL (from AI generation), upload it
    if (imageUrl?.startsWith("data:")) {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const ext = blob.type.split("/")[1] || "png";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(fileName, blob, { cacheControl: "3600", upsert: true });

      if (uploadError) throw new Error("Failed to upload generated image");

      const { data: { publicUrl } } = supabase.storage
        .from("event-media")
        .getPublicUrl(fileName);

      return publicUrl;
    }

    // Otherwise return the URL as-is (external URL or null)
    return imageUrl;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const description = formData.get("description") as string;
    const date = formData.get("date") as string;
    const time = formData.get("time") as string;
    const locationName = formData.get("location_name") as string;
    const address = formData.get("address") as string;
    const googleMapsUrl = formData.get("google_maps_url") as string;
    const externalChatUrl = formData.get("external_chat_url") as string;
    const capacityStr = formData.get("capacity") as string;

    if (!title.trim() || !date || !time) {
      setError("Title, date, and time are required");
      return;
    }

    // Validate slug if editable
    if (slugEditable && slugStatus === "taken") {
      setError("This URL is already taken. Please choose a different one.");
      return;
    }
    if (slugEditable && slugStatus === "invalid") {
      setError("Please enter a valid URL (lowercase letters, numbers, and hyphens only)");
      return;
    }

    // Convert Da Lat time to UTC for storage
    const startsAt = toUTCFromDaLat(date, time);
    const capacity = capacityStr ? parseInt(capacityStr, 10) : null;

    const supabase = createClient();

    startTransition(async () => {
      if (isEditing) {
        // Update existing event
        const updateData: Record<string, unknown> = {
          title,
          description: description || null,
          image_url: imageUrl,
          starts_at: startsAt,
          location_name: locationName || null,
          address: address || null,
          google_maps_url: googleMapsUrl || null,
          external_chat_url: externalChatUrl || null,
          capacity,
        };

        // Include slug if editable and changed
        const cleanSlug = finalizeSlug(slug);
        if (slugEditable && cleanSlug && cleanSlug !== event.slug) {
          updateData.slug = cleanSlug;
          // Append old slug to previous_slugs for redirects
          const currentPreviousSlugs = event.previous_slugs ?? [];
          if (!currentPreviousSlugs.includes(event.slug)) {
            updateData.previous_slugs = [...currentPreviousSlugs, event.slug];
          }
        }

        const { error: updateError } = await supabase
          .from("events")
          .update(updateData)
          .eq("id", event.id);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        // Navigate to new slug if changed, otherwise original
        const finalSlug = slugEditable && slug ? slug : event.slug;
        router.push(`/events/${finalSlug}`);
        router.refresh();
      } else {
        // Create new event or series
        const cleanSlug = finalizeSlug(slug);
        const finalSlug = slugEditable && cleanSlug && slugStatus === "available"
          ? cleanSlug
          : generateSlug(title);

        // If recurring, create a series via API
        if (recurrence.isRecurring) {
          const rrule = buildRRule(recurrence);

          const response = await fetch("/api/series", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug: finalSlug,
              title,
              description: description || null,
              location_name: locationName || null,
              address: address || null,
              google_maps_url: googleMapsUrl || null,
              external_chat_url: externalChatUrl || null,
              capacity,
              rrule,
              starts_at_time: time + ":00", // Convert "19:00" to "19:00:00"
              first_occurrence: date,
              rrule_until: recurrence.endType === "date" && recurrence.endDate
                ? new Date(recurrence.endDate).toISOString()
                : null,
              rrule_count: recurrence.endType === "count" ? recurrence.endCount : null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            setError(errorData.error || "Failed to create recurring event");
            return;
          }

          const seriesData = await response.json();

          // Create sponsors for the first event in the series
          if (draftSponsors.length > 0 && seriesData.first_event_id) {
            await createSponsorsForEvent(seriesData.first_event_id, draftSponsors);
          }

          router.push(`/series/${seriesData.slug}`);
        } else {
          // Single event - direct insert
          const { data, error: insertError } = await supabase
            .from("events")
            .insert({
              slug: finalSlug,
              title: title.trim(),
              description: description || null,
              starts_at: startsAt,
              location_name: locationName || null,
              address: address || null,
              google_maps_url: googleMapsUrl || null,
              external_chat_url: externalChatUrl || null,
              capacity,
              created_by: userId,
              status: "published",
            })
            .select()
            .single();

          if (insertError) {
            setError(insertError.message);
            return;
          }

          // Upload image if we have one (file, base64, or URL)
          try {
            const finalImageUrl = await uploadImage(supabase, data.id);
            if (finalImageUrl) {
              await supabase
                .from("events")
                .update({ image_url: finalImageUrl })
                .eq("id", data.id);
            }
          } catch {
            // Image upload failed but event was created - continue
            console.error("Failed to upload event image");
          }

          // Create sponsors for the new event
          if (draftSponsors.length > 0) {
            await createSponsorsForEvent(data.id, draftSponsors);
          }

          router.push(`/events/${data.slug}`);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Event flyer and title */}
          {isEditing ? (
            <>
              <EventMediaUpload
                eventId={event.id}
                currentMediaUrl={imageUrl}
                onMediaChange={setImageUrl}
              />
              <div className="space-y-2">
                <Label htmlFor="title">Event title *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Coffee & Code"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <FlyerBuilder
              title={title}
              onTitleChange={handleTitleChange}
              imageUrl={imageUrl}
              onImageChange={handleImageChange}
              defaultTitle=""
            />
          )}

          {/* Custom URL Slug */}
          {slugEditable && (
            <div className="space-y-2">
              <Label htmlFor="slug">Event URL</Label>
              <div className="flex items-center gap-0">
                <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input">
                  dalat.app/events/
                </span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={handleSlugChange}
                  onBlur={handleSlugBlur}
                  placeholder="my-event"
                  className="rounded-l-none"
                />
              </div>
              {slugTouched && (
                <p className={`text-xs ${
                  slugStatus === "available" ? "text-green-600" :
                  slugStatus === "taken" ? "text-red-500" :
                  slugStatus === "invalid" ? "text-red-500" :
                  slugStatus === "checking" ? "text-muted-foreground" :
                  "text-muted-foreground"
                }`}>
                  {slugStatus === "checking" && "Checking availability..."}
                  {slugStatus === "available" && "✓ This URL is available"}
                  {slugStatus === "taken" && "✗ This URL is already taken"}
                  {slugStatus === "invalid" && "Only lowercase letters, numbers, and hyphens allowed"}
                </p>
              )}
              {isEditing && (
                <p className="text-xs text-amber-600">
                  ⚠ Changing the URL will break any previously shared links
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              placeholder="What's this event about?"
              defaultValue={event?.description ?? ""}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Date and time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={defaults.date}
                onChange={handleDateChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time * <span className="text-muted-foreground font-normal">(Da Lat)</span></Label>
              <Input
                id="time"
                name="time"
                type="time"
                defaultValue={defaults.time}
                required
              />
            </div>
          </div>

          {/* Recurrence (only for new events) */}
          {!isEditing && (
            <RecurrencePicker
              selectedDate={selectedDate}
              value={recurrence}
              onChange={setRecurrence}
            />
          )}

          {/* Location (Google Places Autocomplete) */}
          <PlaceAutocomplete
            onPlaceSelect={() => {}}
            defaultValue={
              event?.location_name
                ? {
                    placeId: "",
                    name: event.location_name,
                    address: event.address || "",
                    googleMapsUrl: event.google_maps_url || "",
                  }
                : null
            }
          />

          {/* External link */}
          <div className="space-y-2">
            <Label htmlFor="external_chat_url">External link</Label>
            <Input
              id="external_chat_url"
              name="external_chat_url"
              type="url"
              placeholder="https://..."
              defaultValue={event?.external_chat_url ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Link to a form, chat group, website, or social media
            </p>
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <Label htmlFor="capacity">Max attendees</Label>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min="1"
              placeholder="Leave empty for unlimited"
              defaultValue={event?.capacity ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Once full, new RSVPs go to a waitlist
            </p>
          </div>

          {/* Sponsors */}
          <div className="pt-4 border-t">
            {isEditing && event ? (
              <SponsorForm
                eventId={event.id}
                initialSponsors={initialSponsors}
                onChange={() => {}}
              />
            ) : (
              <SponsorForm
                draftSponsors={draftSponsors}
                onDraftChange={setDraftSponsors}
              />
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending
              ? isEditing
                ? "Saving..."
                : recurrence.isRecurring
                  ? "Creating series..."
                  : "Creating..."
              : isEditing
                ? "Save changes"
                : recurrence.isRecurring
                  ? "Create recurring event"
                  : "Create event"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
