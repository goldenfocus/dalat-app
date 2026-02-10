"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useSlugValidation, useLocationState, useImageUpload, usePricingState } from "@/hooks";
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
import { VenueLinker } from "@/components/events/venue-linker";
import { EventMediaUpload } from "@/components/events/event-media-upload";
import { FlyerBuilder } from "@/components/events/flyer-builder";
import { RecurrencePicker } from "@/components/events/recurrence-picker";
import { SponsorForm, createSponsorsForEvent, type DraftSponsor } from "@/components/events/sponsor-form";
import { EventMaterialsInput, createMaterialsForEvent } from "@/components/events/event-materials-input";
import { PlaylistInput } from "@/components/events/playlist-input";
import { EventSettingsForm } from "@/components/events/event-settings-form";
import { TicketTierInput, type TicketTier, type PriceType } from "@/components/events/ticket-tier-input";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { PostCreationCelebration } from "@/components/events/post-creation-celebration";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronDown, Settings, Repeat, Sparkles, Tag } from "lucide-react";
import { PromoManager } from "@/components/events/promo-manager";
import { toUTCFromDaLat, getDateTimeInDaLat } from "@/lib/timezone";
import { canEditSlug } from "@/lib/config";
import { getDefaultRecurrenceData, buildRRule } from "@/lib/recurrence";
import type { Event, RecurrenceFormData, Sponsor, EventSponsor, EventSettings, TranslationFieldName, Organizer, UserRole, DraftMaterial, EventMaterial } from "@/lib/types";
import { hasRoleLevel } from "@/lib/types";
import { finalizeSlug } from "@/lib/utils";
import { EVENT_TAGS, TAG_CONFIG, type EventTag } from "@/lib/constants/event-tags";

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

interface PlaylistTrack {
  id: string;
  file_url: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
}

interface EventFormProps {
  userId: string;
  userRole?: UserRole;
  event?: Event;
  initialSponsors?: (EventSponsor & { sponsors: Sponsor })[];
  initialMaterials?: EventMaterial[];
  // For "Create Similar Event" feature
  copyFromEvent?: Event;
  copyFromSponsors?: (EventSponsor & { sponsors: Sponsor })[];
  // For inline settings (moments config, retranslate, etc.)
  initialSettings?: EventSettings | null;
  pendingMomentsCount?: number;
  // For playlist management
  initialPlaylistId?: string | null;
  initialPlaylistTracks?: PlaylistTrack[];
}

/**
 * Normalize a URL by adding https:// if no protocol is present
 * and lowercasing the domain (URLs are case-insensitive)
 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  // Already has a protocol
  if (/^https?:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Add https://
  return `https://${trimmed}`;
}

export function EventForm({
  userId,
  userRole = "user",
  event,
  initialSponsors = [],
  initialMaterials = [],
  copyFromEvent,
  copyFromSponsors = [],
  initialSettings,
  pendingMomentsCount = 0,
  initialPlaylistId,
  initialPlaylistTracks = [],
}: EventFormProps) {
  const router = useRouter();
  // Only moderators and above can select organizers
  const canSelectOrganizer = hasRoleLevel(userRole, "moderator");
  const t = useTranslations("eventForm");
  const tErrors = useTranslations("errors");
  const tPlaylist = useTranslations("playlist");
  const tSeries = useTranslations("series");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Check if editing a series event
  const isSeriesEvent = !!event?.series_id;
  const [seriesEditScope, setSeriesEditScope] = useState<"this" | "future" | "all">("this");

  // Celebration modal state (for new events)
  const [showCelebration, setShowCelebration] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<{
    slug: string;
    title: string;
    description: string | null;
    startsAt: string;
    imageUrl: string | null;
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

  const isEditing = !!event;
  const slugEditable = canEditSlug(isEditing);

  // Image upload state (consolidated hook)
  const {
    imageUrl,
    setImageUrl,
    imageFit,
    setImageFit,
    focalPoint,
    setFocalPoint,
    handleImageChange,
    uploadImage,
  } = useImageUpload({
    initialImageUrl: event?.image_url ?? copyDefaults?.imageUrl ?? null,
    initialImageFit: event?.image_fit ?? "cover",
    initialFocalPoint: event?.focal_point ?? null,
  });

  // Title state (controlled for FlyerBuilder integration)
  const [title, setTitle] = useState(event?.title ?? copyDefaults?.title ?? "");

  // Online event state
  const [isOnline, setIsOnline] = useState(event?.is_online ?? false);
  const [onlineLink, setOnlineLink] = useState(event?.online_link ?? "");

  // Slug validation state (consolidated hook)
  const {
    slug,
    slugStatus,
    slugTouched,
    handleSlugChange,
    handleSlugBlur,
    updateSlugFromTitle,
    getFinalSlug,
  } = useSlugValidation({
    initialSlug: event?.slug ?? "",
    editable: slugEditable,
    isEditing,
  });

  // Recurrence state (only for new events)
  const [recurrence, setRecurrence] = useState<RecurrenceFormData>(getDefaultRecurrenceData());
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    event?.starts_at ? new Date(event.starts_at) : copyDefaults?.date ? new Date(copyDefaults.date) : null
  );

  // Draft sponsors state (for new events) - initialize with copied sponsors
  const [draftSponsors, setDraftSponsors] = useState<DraftSponsor[]>(
    copyDefaults?.sponsors ?? []
  );

  // Draft materials state (for new events)
  const [draftMaterials, setDraftMaterials] = useState<DraftMaterial[]>([]);

  // Manual tags state (user-selected activity tags)
  const [selectedTags, setSelectedTags] = useState<EventTag[]>(
    (event?.ai_tags as EventTag[])?.filter((tag) => EVENT_TAGS.includes(tag as EventTag)) ?? []
  );

  // Pricing state (consolidated hook)
  const {
    priceType,
    setPriceType,
    ticketTiers,
    setTicketTiers,
    hasCapacityLimit,
    setHasCapacityLimit,
    initialCapacity,
  } = usePricingState({
    initialPriceType: event?.price_type ?? null,
    initialTicketTiers: event?.ticket_tiers ?? [],
    initialCapacity: event?.capacity ?? copyDefaults?.capacity ?? null,
  });

  // Organizer picker state
  const [organizerId, setOrganizerId] = useState<string | null>(
    event?.organizer_id ?? null
  );
  const [organizers, setOrganizers] = useState<Pick<Organizer, 'id' | 'name' | 'slug' | 'logo_url'>[]>([]);

  // Sponsor tier state (admin only)
  const canSetSponsorTier = hasRoleLevel(userRole, "admin");
  const [sponsorTier, setSponsorTier] = useState<number | null>(
    event?.sponsor_tier ?? null
  );

  // Location/venue state (consolidated hook)
  const {
    venueId,
    venueName,
    locationLat,
    locationLng,
    handleLocationSelect,
    handleVenueLink,
    clearVenue,
  } = useLocationState({
    initialVenueId: event?.venue_id ?? null,
    initialVenueName: event?.venues?.name ?? null,
    initialLatitude: event?.latitude ?? null,
    initialLongitude: event?.longitude ?? null,
  });

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

  // Handle title change and auto-suggest slug
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      updateSlugFromTitle(newTitle);
    },
    [updateSlugFromTitle]
  );

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const description = formData.get("description") as string;
    const date = formData.get("date") as string;
    const time = formData.get("time") as string;

    // Debug: Log form values to help diagnose validation issues
    console.log("[EventForm] Submit values:", { title: title.trim(), date, time });
    const locationName = formData.get("location_name") as string;
    const address = formData.get("address") as string;
    const googleMapsUrl = formData.get("google_maps_url") as string;
    const latitudeStr = formData.get("latitude") as string;
    const longitudeStr = formData.get("longitude") as string;
    const latitude = latitudeStr ? parseFloat(latitudeStr) : null;
    const longitude = longitudeStr ? parseFloat(longitudeStr) : null;
    const externalChatUrl = formData.get("external_chat_url") as string;
    const capacityStr = formData.get("capacity") as string;
    // Use state-managed venueId (set by LocationPicker or VenueLinker)
    const venueIdToSave = venueId;

    // Validate required fields with specific error messages
    const missingFields: string[] = [];
    if (!title.trim()) missingFields.push(tErrors("fieldTitle"));
    if (!date) missingFields.push(tErrors("fieldDate"));
    if (!time) missingFields.push(tErrors("fieldTime"));

    if (missingFields.length > 0) {
      setError(tErrors("fieldsRequired", { fields: missingFields.join(", ") }));
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
        // Check if we should update via series API (for "future" or "all" scope)
        if (isSeriesEvent && seriesEditScope !== "this" && event.series_id) {
          // Use series API to update template + events
          const seriesResponse = await fetch(`/api/series/${event.series_id}`, {
            method: "GET",
          });

          if (!seriesResponse.ok) {
            setError("Failed to fetch series information");
            return;
          }

          const seriesData = await seriesResponse.json();
          const seriesSlug = seriesData.series?.slug;

          if (!seriesSlug) {
            setError("Series not found");
            return;
          }

          const response = await fetch(`/api/series/${seriesSlug}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: description || null,
              image_url: imageUrl,
              location_name: locationName || null,
              address: address || null,
              google_maps_url: googleMapsUrl || null,
              external_chat_url: externalChatUrl || null,
              capacity,
              update_scope: seriesEditScope, // "future" or "all"
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            setError(data.error || "Failed to update series");
            return;
          }

          router.push(`/events/${event.slug}`);
          router.refresh();
        } else {
          // Update just this event (current behavior)
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
            title_position: "bottom",
            image_fit: imageFit,
            focal_point: focalPoint,
            capacity,
            price_type: priceType,
            ticket_tiers: ticketTiers.length > 0 ? ticketTiers : null,
            organizer_id: organizerId,
            venue_id: venueIdToSave || null,
            ai_tags: selectedTags,
            ...(canSetSponsorTier && { sponsor_tier: sponsorTier }),
            // Mark as exception if editing just this event in a series
            ...(isSeriesEvent && { is_exception: true }),
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
        }
      } else {
        // Create new event or series
        const finalSlug = getFinalSlug(title);

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
              title_position: "bottom",
              image_fit: imageFit,
              focal_point: focalPoint,
              capacity,
              price_type: priceType,
              ticket_tiers: ticketTiers.length > 0 ? ticketTiers : null,
              rrule,
              starts_at_time: time + ":00", // Convert "19:00" to "19:00:00"
              first_occurrence: date,
              rrule_until: recurrence.endType === "date" && recurrence.endDate
                ? new Date(recurrence.endDate).toISOString()
                : null,
              rrule_count: recurrence.endType === "count" ? recurrence.endCount : null,
              organizer_id: organizerId,
              venue_id: venueIdToSave || null,
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

          // Create materials for the first event in the series
          if (draftMaterials.length > 0 && seriesData.first_event_id) {
            await createMaterialsForEvent(seriesData.first_event_id, draftMaterials);
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
              title_position: "bottom",
              image_fit: imageFit,
              focal_point: focalPoint,
              capacity,
              price_type: priceType,
              ticket_tiers: ticketTiers.length > 0 ? ticketTiers : null,
              created_by: userId,
              status: "published",
              organizer_id: organizerId,
              venue_id: venueIdToSave || null,
              ai_tags: selectedTags.length > 0 ? selectedTags : [],
            })
            .select()
            .single();

          if (insertError) {
            setError(insertError.message);
            return;
          }

          // Upload image if we have one (file, base64, or URL)
          let eventImageUrl: string | null = null;
          try {
            const finalImageUrl = await uploadImage(data.id);
            if (finalImageUrl) {
              await supabase
                .from("events")
                .update({ image_url: finalImageUrl })
                .eq("id", data.id);
              eventImageUrl = finalImageUrl;
            }
          } catch {
            // Image upload failed but event was created - continue
            console.error("Failed to upload event image");
          }

          // Create sponsors for the new event
          if (draftSponsors.length > 0) {
            await createSponsorsForEvent(data.id, draftSponsors);
          }

          // Create materials for the new event
          if (draftMaterials.length > 0) {
            await createMaterialsForEvent(data.id, draftMaterials);
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
            imageUrl: eventImageUrl,
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
          {/* Series Edit Scope (only shown when editing a series event) */}
          {isEditing && isSeriesEvent && (
            <div className="p-4 bg-muted/50 rounded-lg border space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Repeat className="w-4 h-4" />
                {tSeries("editingSeriesEvent")}
              </div>
              <RadioGroup
                value={seriesEditScope}
                onValueChange={(value) => setSeriesEditScope(value as "this" | "future" | "all")}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="this" id="scope-this" className="mt-1" />
                  <div>
                    <Label htmlFor="scope-this" className="cursor-pointer font-medium">
                      {tSeries("editThisEventOnly")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {tSeries("editThisEventOnlyDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="future" id="scope-future-events" className="mt-1" />
                  <div>
                    <Label htmlFor="scope-future-events" className="cursor-pointer font-medium">
                      {tSeries("editThisAndFutureEvents")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {tSeries("editThisAndFutureEventsDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="all" id="scope-all-events" className="mt-1" />
                  <div>
                    <Label htmlFor="scope-all-events" className="cursor-pointer font-medium">
                      {tSeries("editAllEventsInSeries")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {tSeries("editAllEventsInSeriesDescription")}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

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
              imageFit={imageFit}
              onImageFitChange={setImageFit}
              focalPoint={focalPoint}
              onFocalPointChange={setFocalPoint}
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
                type="text"
                placeholder={t("onlineLinkPlaceholder")}
                value={onlineLink}
                onChange={(e) => setOnlineLink(e.target.value)}
                onBlur={(e) => setOnlineLink(normalizeUrl(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {t("onlineLinkHelp")}
              </p>
            </div>
          )}

          {/* Location - unified venue + address picker (hidden for online events) */}
          {!isOnline && (
          <>
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
              onLocationSelect={handleLocationSelect}
              onVenueIdChange={(id) => {
                if (!id) {
                  clearVenue();
                }
              }}
            />

            {/* Venue Linker - shows auto-suggestions and manual link option */}
            <VenueLinker
              venueId={venueId}
              venueName={venueName}
              latitude={locationLat}
              longitude={locationLng}
              onVenueChange={handleVenueLink}
              disabled={isPending}
            />
          </>
          )}

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

          {/* Sponsor Tier (admin only) */}
          {canSetSponsorTier && (
            <div className="space-y-2">
              <Label htmlFor="sponsorTier">{t("sponsorTier") || "Featured/Sponsored"}</Label>
              <Select
                value={sponsorTier?.toString() ?? "none"}
                onValueChange={(value) => setSponsorTier(value === "none" ? null : parseInt(value, 10))}
              >
                <SelectTrigger id="sponsorTier">
                  <SelectValue placeholder={t("selectSponsorTier") || "Select tier..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("notSponsored") || "Not featured"}</SelectItem>
                  <SelectItem value="1">{t("sponsorTier1") || "Basic (Tier 1)"}</SelectItem>
                  <SelectItem value="2">{t("sponsorTier2") || "Premium (Tier 2)"}</SelectItem>
                  <SelectItem value="3">{t("sponsorTier3") || "Gold (Tier 3)"}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("sponsorTierHelp") || "Featured events appear first in feeds with a gold badge."}
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
                  defaultValue={initialCapacity ?? ""}
                  className="w-24"
                />
              )}
            </div>
          </div>

          {/* Tickets & Pricing */}
          <TicketTierInput
            priceType={priceType}
            tiers={ticketTiers}
            onPriceTypeChange={setPriceType}
            onTiersChange={setTicketTiers}
          />

          {/* Activity Tags */}
          <Collapsible className="pt-4 border-t">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                {t("activityTags") || "Activity Type"}
                {selectedTags.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {selectedTags.length}
                  </span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                {t("activityTagsHelp") || "Select tags to help people find your event. AI will also auto-tag based on content."}
              </p>
              <div className="flex flex-wrap gap-2">
                {(['sports', 'fitness', 'music', 'art', 'food', 'workshop', 'meetup', 'outdoor'] as EventTag[]).map((tag) => {
                  const config = TAG_CONFIG[tag];
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTags(selectedTags.filter((t) => t !== tag));
                        } else {
                          setSelectedTags([...selectedTags, tag]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? config.color
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

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

          {/* Materials */}
          <Collapsible className="pt-4 border-t">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
              <span>{t("materials") || "Materials"}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              {isEditing && event ? (
                <EventMaterialsInput
                  eventId={event.id}
                  initialMaterials={initialMaterials}
                  onChange={() => {}}
                />
              ) : (
                <EventMaterialsInput
                  draftMaterials={draftMaterials}
                  onDraftChange={setDraftMaterials}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Promo (only when editing) */}
          {isEditing && event && (
            <Collapsible className="pt-4 border-t">
              <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t("promo") || "Promo"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <PromoManager
                  eventId={event.id}
                  eventSlug={event.slug}
                  seriesId={event.series_id}
                  isSeriesEvent={isSeriesEvent}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Playlist (only when editing) */}
          {isEditing && event && (
            <Collapsible className="pt-4 border-t">
              <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
                <span>{tPlaylist("title") || "Playlist"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <PlaylistInput
                  eventId={event.id}
                  initialPlaylistId={initialPlaylistId}
                  initialTracks={initialPlaylistTracks}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

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
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
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
          imageUrl={createdEvent.imageUrl}
        />
      )}
    </form>
  );
}
