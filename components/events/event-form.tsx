"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationPicker, type SelectedLocation } from "@/components/events/location-picker";
import { EventMediaUpload } from "@/components/events/event-media-upload";
import { FlyerBuilder } from "@/components/events/flyer-builder";
import { RecurrencePicker } from "@/components/events/recurrence-picker";
import { SponsorForm, createSponsorsForEvent, type DraftSponsor } from "@/components/events/sponsor-form";
import { EventSettingsForm } from "@/components/events/event-settings-form";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { PostCreationCelebration } from "@/components/events/post-creation-celebration";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Settings } from "lucide-react";
import { toUTCFromDaLat, getDateTimeInDaLat } from "@/lib/timezone";
import { canEditSlug } from "@/lib/config";
import { getDefaultRecurrenceData, buildRRule } from "@/lib/recurrence";
import type { Event, RecurrenceFormData, Sponsor, EventSponsor, EventSettings, TranslationFieldName, Organizer, UserRole } from "@/lib/types";
import { hasRoleLevel } from "@/lib/types";

/**
 * Trigger translation for an event (fire-and-forget)
 */
async function triggerEventTranslation(
  eventId: string,
  title: string,
  description: string | null
) {
  const fields: { field_name: TranslationFieldName; text: string }[] = [
    { field_name: 'title', text: title },
  ];

  if (description?.trim()) {
    fields.push({ field_name: 'description', text: description });
  }

  // Fire and forget - don't block the user
  fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content_type: 'event',
      content_id: eventId,
      fields,
      detect_language: true,
    }),
  }).catch((error) => {
    console.error('Translation trigger failed:', error);
  });
}

/**
 * Trigger AI processing for an event (fire-and-forget)
 * - Auto-tagging with category tags
 * - Spam detection (auto-hides if high confidence spam)
 */
async function triggerAIProcessing(eventId: string) {
  // Fire and forget - don't block the user
  Promise.all([
    // Auto-tag the event
    fetch('/api/admin/tag-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    }),
    // Check for spam
    fetch('/api/admin/spam-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, autoHide: true }),
    }),
  ]).catch((error) => {
    console.error('AI processing trigger failed:', error);
  });
}

interface EventFormProps {
  userId: string;
  userRole?: UserRole;
  event?: Event;
  initialSponsors?: (EventSponsor & { sponsors: Sponsor })[];
  // For "Create Similar Event" feature
  copyFromEvent?: Event;
  copyFromSponsors?: (EventSponsor & { sponsors: Sponsor })[];
  // For inline settings (moments config, retranslate, etc.)
  initialSettings?: EventSettings | null;
  pendingMomentsCount?: number;
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

export function EventForm({
  userId,
  userRole = "user",
  event,
  initialSponsors = [],
  copyFromEvent,
  copyFromSponsors = [],
  initialSettings,
  pendingMomentsCount = 0,
}: EventFormProps) {
  const router = useRouter();
  // Only moderators and above can select organizers
  const canSelectOrganizer = hasRoleLevel(userRole, "moderator");
  const t = useTranslations("eventForm");
  const tErrors = useTranslations("errors");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Celebration modal state (for new events)
  const [showCelebration, setShowCelebration] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<{
    slug: string;
    title: string;
    description: string | null;
    startsAt: string;
  } | null>(null);

  // Determine if we're copying from another event
  const isCopying = !!copyFromEvent;

  // Calculate smart defaults when copying
  const getCopyDefaults = useCallback(() => {
    if (!copyFromEvent) return null;

    const sourceDate = new Date(copyFromEvent.starts_at);
    // Suggest next day for the new event
    const nextDay = new Date(sourceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Convert source sponsors to draft format
    const draftFromCopy: DraftSponsor[] = copyFromSponsors.map((es, index) => ({
      id: `copy-${es.sponsor_id}-${index}`,
      name: es.sponsors?.name || "",
      logo_url: es.sponsors?.logo_url || "",
      website_url: es.sponsors?.website_url || "",
    }));

    // Get time from source event in Đà Lạt timezone
    const sourceDateTime = getDateTimeInDaLat(copyFromEvent.starts_at);

    return {
      title: copyFromEvent.title,
      description: copyFromEvent.description || "",
      // Use next day, but keep same time
      date: nextDay.toISOString().split("T")[0],
      time: sourceDateTime.time,
      locationName: copyFromEvent.location_name || "",
      address: copyFromEvent.address || "",
      googleMapsUrl: copyFromEvent.google_maps_url || "",
      // Clear external URL - each event typically has its own FB event
      externalChatUrl: "",
      capacity: copyFromEvent.capacity,
      sponsors: draftFromCopy,
      // Copy the flyer - same festival usually has same branding
      imageUrl: copyFromEvent.image_url,
    };
  }, [copyFromEvent, copyFromSponsors]);

  const copyDefaults = getCopyDefaults();

  const [imageUrl, setImageUrl] = useState<string | null>(
    event?.image_url ?? copyDefaults?.imageUrl ?? null
  );

  const isEditing = !!event;
  const slugEditable = canEditSlug(isEditing);

  // Title state (controlled for FlyerBuilder integration)
  const [title, setTitle] = useState(event?.title ?? copyDefaults?.title ?? "");

  // Pending file for upload (only for new events with file/generated image)
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Title position state (for flyer customization)
  const [titlePosition, setTitlePosition] = useState<"top" | "middle" | "bottom">(
    event?.title_position ?? "bottom"
  );

  // Online event state
  const [isOnline, setIsOnline] = useState(event?.is_online ?? false);

  // Slug state
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugTouched, setSlugTouched] = useState(false);

  // Recurrence state (only for new events)
  const [recurrence, setRecurrence] = useState<RecurrenceFormData>(getDefaultRecurrenceData());
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    event?.starts_at ? new Date(event.starts_at) : copyDefaults?.date ? new Date(copyDefaults.date) : null
  );

  // Draft sponsors state (for new events) - initialize with copied sponsors
  const [draftSponsors, setDraftSponsors] = useState<DraftSponsor[]>(
    copyDefaults?.sponsors ?? []
  );

  // Capacity limit toggle
  const [hasCapacityLimit, setHasCapacityLimit] = useState(
    !!event?.capacity || !!copyDefaults?.capacity
  );

  // Organizer picker state
  const [organizerId, setOrganizerId] = useState<string | null>(
    event?.organizer_id ?? null
  );
  const [organizers, setOrganizers] = useState<Pick<Organizer, 'id' | 'name' | 'slug' | 'logo_url'>[]>([]);

  // Fetch organizers on mount
  useEffect(() => {
    async function fetchOrganizers() {
      const supabase = createClient();
      const { data } = await supabase
        .from("organizers")
        .select("id, name, slug, logo_url")
        .eq("is_verified", true)
        .order("name");

      if (data) {
        setOrganizers(data);
      }
    }
    fetchOrganizers();
  }, []);

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

  // Get today's date in local timezone (for min date validation)
  const getTodayDateString = useCallback(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Track selected date for recurrence picker
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      // For new events, prevent selecting past dates
      if (!isEditing) {
        const today = getTodayDateString();
        if (dateStr < today) {
          // Reset to today if user somehow selects a past date
          e.target.value = today;
          setSelectedDate(new Date(today + "T12:00:00"));
          return;
        }
      }
      setSelectedDate(new Date(dateStr + "T12:00:00"));
    } else {
      setSelectedDate(null);
    }
  };

  // Parse existing event date/time in Đà Lạt timezone
  // For copying: use the calculated next day and same time
  const defaults = event
    ? getDateTimeInDaLat(event.starts_at)
    : copyDefaults
      ? { date: copyDefaults.date, time: copyDefaults.time }
      : { date: "", time: "" };

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
    const latitudeStr = formData.get("latitude") as string;
    const longitudeStr = formData.get("longitude") as string;
    const latitude = latitudeStr ? parseFloat(latitudeStr) : null;
    const longitude = longitudeStr ? parseFloat(longitudeStr) : null;
    const externalChatUrl = formData.get("external_chat_url") as string;
    const onlineLink = formData.get("online_link") as string;
    const capacityStr = formData.get("capacity") as string;
    const venueIdFromForm = formData.get("venue_id") as string;

    if (!title.trim() || !date || !time) {
      setError(tErrors("titleDateTimeRequired"));
      return;
    }

    // For new events, prevent past dates
    if (!isEditing) {
      const today = getTodayDateString();
      if (date < today) {
        setError(tErrors("pastDateNotAllowed") || "Cannot create events in the past");
        return;
      }
    }

    // Validate slug if editable
    if (slugEditable && slugStatus === "taken") {
      setError(t("urlTaken"));
      return;
    }
    if (slugEditable && slugStatus === "invalid") {
      setError(t("urlInvalid"));
      return;
    }

    // Convert Đà Lạt time to UTC for storage
    const startsAt = toUTCFromDaLat(date, time);
    const capacity = capacityStr ? parseInt(capacityStr, 10) : null;

    const supabase = createClient();

    startTransition(async () => {
      try {
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
          latitude,
          longitude,
          external_chat_url: externalChatUrl || null,
          is_online: isOnline,
          online_link: isOnline ? (onlineLink || null) : null,
          title_position: titlePosition,
          capacity,
          organizer_id: organizerId,
          venue_id: venueIdFromForm || null,
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
              latitude,
              longitude,
              external_chat_url: externalChatUrl || null,
              is_online: isOnline,
              online_link: isOnline ? (onlineLink || null) : null,
              title_position: titlePosition,
              capacity,
              rrule,
              starts_at_time: time + ":00", // Convert "19:00" to "19:00:00"
              first_occurrence: date,
              rrule_until: recurrence.endType === "date" && recurrence.endDate
                ? new Date(recurrence.endDate).toISOString()
                : null,
              rrule_count: recurrence.endType === "count" ? recurrence.endCount : null,
              organizer_id: organizerId,
              venue_id: venueIdFromForm || null,
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

          // Trigger AI processing for the first event (fire-and-forget)
          if (seriesData.first_event_id) {
            triggerEventTranslation(seriesData.first_event_id, title.trim(), description || null);
            triggerAIProcessing(seriesData.first_event_id);
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
              latitude,
              longitude,
              external_chat_url: externalChatUrl || null,
              is_online: isOnline,
              online_link: isOnline ? (onlineLink || null) : null,
              title_position: titlePosition,
              capacity,
              created_by: userId,
              status: "published",
              organizer_id: organizerId,
              venue_id: venueIdFromForm || null,
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

          // Trigger AI processing in background (fire-and-forget)
          triggerEventTranslation(data.id, title.trim(), description || null);
          triggerAIProcessing(data.id);

          // Show celebration modal instead of immediate redirect
          setCreatedEvent({
            slug: data.slug,
            title: title.trim(),
            description: description || null,
            startsAt: startsAt,
          });
          setShowCelebration(true);
        }
      }
      } catch (err) {
        console.error("Form submission error:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
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
                eventTitle={title}
                currentMediaUrl={imageUrl}
                onMediaChange={setImageUrl}
              />
              <div className="space-y-2">
                <Label htmlFor="title">{t("titleRequired")}</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder={t("titlePlaceholder")}
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
              titlePosition={titlePosition}
              onTitlePositionChange={setTitlePosition}
            />
          )}

          {/* Custom URL Slug */}
          {slugEditable && (
            <div className="space-y-2">
              <Label htmlFor="slug">{t("url")}</Label>
              <div className="flex items-center gap-0">
                <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input">
                  {t("eventUrlPrefix")}
                </span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={handleSlugChange}
                  onBlur={handleSlugBlur}
                  placeholder={t("urlPlaceholder")}
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
                  {slugStatus === "checking" && t("checkingAvailability")}
                  {slugStatus === "available" && `✓ ${t("urlAvailable")}`}
                  {slugStatus === "taken" && `✗ ${t("urlTaken")}`}
                  {slugStatus === "invalid" && t("urlValidation")}
                </p>
              )}
              {isEditing && slug !== event?.slug && (
                <p className="text-xs text-amber-600">
                  ⚠ {t("urlChangeWarning")}
                </p>
              )}
            </div>
          )}

          {/* Info */}
          <div className="space-y-2">
            <Label htmlFor="description">{t("info")}</Label>
            <AIEnhanceTextarea
              id="description"
              name="description"
              defaultValue={event?.description ?? copyDefaults?.description ?? ""}
              rows={3}
              context="an event description for a local community event in Đà Lạt, Vietnam"
            />
            <p className="text-xs text-muted-foreground">
              {t("infoHelperText")}
            </p>
          </div>

          {/* Date and time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">{t("dateRequired")}</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={defaults.date}
                onChange={handleDateChange}
                min={!isEditing ? getTodayDateString() : undefined}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">{t("timeRequired")}</Label>
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

          {/* Online event toggle */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="isOnline"
                checked={isOnline}
                onCheckedChange={(checked) => setIsOnline(!!checked)}
              />
              <Label htmlFor="isOnline" className="cursor-pointer">
                {t("onlineEvent")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("onlineEventHelp")}
            </p>
          </div>

          {/* Online link (when online event) */}
          {isOnline && (
            <div className="space-y-2">
              <Label htmlFor="online_link">{t("onlineLink")}</Label>
              <Input
                id="online_link"
                name="online_link"
                type="url"
                placeholder={t("onlineLinkPlaceholder")}
                defaultValue={event?.online_link ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                {t("onlineLinkHelp")}
              </p>
            </div>
          )}

          {/* Location - unified venue + address picker */}
          <LocationPicker
            defaultValue={
              event?.location_name
                ? {
                    type: event.venue_id ? "venue" : "place",
                    venueId: event.venue_id ?? undefined,
                    name: event.location_name,
                    address: event.address || "",
                    googleMapsUrl: event.google_maps_url || "",
                    latitude: event.latitude ?? null,
                    longitude: event.longitude ?? null,
                  }
                : copyDefaults?.locationName
                  ? {
                      type: "place",
                      name: copyDefaults.locationName,
                      address: copyDefaults.address,
                      googleMapsUrl: copyDefaults.googleMapsUrl,
                      latitude: null,
                      longitude: null,
                    }
                  : null
            }
            defaultVenueId={event?.venue_id}
          />

          {/* External link */}
          <div className="space-y-2">
            <Label htmlFor="external_chat_url">{t("externalLink")}</Label>
            <Input
              id="external_chat_url"
              name="external_chat_url"
              type="url"
              placeholder={t("externalLinkPlaceholder")}
              defaultValue={event?.external_chat_url ?? ""}
            />
            {isCopying && (
              <p className="text-xs text-muted-foreground">
                {t("externalLinkNotCopied")}
              </p>
            )}
          </div>

          {/* Organizer (only show for moderators+ if organizers exist) */}
          {canSelectOrganizer && organizers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="organizer">{t("organizer")}</Label>
              <Select
                value={organizerId ?? "none"}
                onValueChange={(value) => setOrganizerId(value === "none" ? null : value)}
              >
                <SelectTrigger id="organizer">
                  <SelectValue placeholder={t("selectOrganizer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noOrganizer")}</SelectItem>
                  {organizers.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("organizerHelp")}
              </p>
            </div>
          )}

          {/* Capacity */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Checkbox
                id="hasCapacityLimit"
                checked={hasCapacityLimit}
                onCheckedChange={(checked) => setHasCapacityLimit(!!checked)}
              />
              <Label htmlFor="hasCapacityLimit" className="cursor-pointer">
                {t("limitAttendees")}
              </Label>
              {hasCapacityLimit && (
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  defaultValue={event?.capacity ?? copyDefaults?.capacity ?? ""}
                  className="w-24"
                />
              )}
            </div>
          </div>

          {/* Sponsors */}
          <Collapsible className="pt-4 border-t">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
              <span>{t("sponsors") || "Sponsors"}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
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
            </CollapsibleContent>
          </Collapsible>

          {/* Settings (only when editing) */}
          {isEditing && event && (
            <Collapsible className="pt-4 border-t">
              <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {t("settings") || "Settings"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <EventSettingsForm
                  eventId={event.id}
                  eventSlug={event.slug}
                  eventTitle={title}
                  eventDescription={event.description}
                  initialSettings={initialSettings ?? null}
                  pendingCount={pendingMomentsCount}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending
              ? isEditing
                ? t("saving")
                : recurrence.isRecurring
                  ? t("creatingSeries")
                  : t("creating")
              : isEditing
                ? t("saveChanges")
                : recurrence.isRecurring
                  ? t("createRecurringEvent")
                  : t("createEvent")}
          </Button>
        </CardContent>
      </Card>

      {/* Post-creation celebration modal */}
      {createdEvent && (
        <PostCreationCelebration
          isOpen={showCelebration}
          onClose={() => setShowCelebration(false)}
          eventSlug={createdEvent.slug}
          eventTitle={createdEvent.title}
          eventDescription={createdEvent.description}
          startsAt={createdEvent.startsAt}
        />
      )}
    </form>
  );
}
