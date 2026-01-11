"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PlaceAutocomplete } from "@/components/events/place-autocomplete";
import { EventMediaUpload } from "@/components/events/event-media-upload";
import { toUTCFromDaLat, getDateTimeInDaLat } from "@/lib/timezone";
import type { Event } from "@/lib/types";

interface EventFormProps {
  userId: string;
  event?: Event;
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export function EventForm({ userId, event }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(
    event?.image_url ?? null
  );

  const isEditing = !!event;

  // Parse existing event date/time in Da Lat timezone
  const defaults = event ? getDateTimeInDaLat(event.starts_at) : { date: "", time: "" };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const date = formData.get("date") as string;
    const time = formData.get("time") as string;
    const locationName = formData.get("location_name") as string;
    const address = formData.get("address") as string;
    const googleMapsUrl = formData.get("google_maps_url") as string;
    const externalChatUrl = formData.get("external_chat_url") as string;
    const capacityStr = formData.get("capacity") as string;

    if (!title || !date || !time) {
      setError("Title, date, and time are required");
      return;
    }

    // Convert Da Lat time to UTC for storage
    const startsAt = toUTCFromDaLat(date, time);
    const capacity = capacityStr ? parseInt(capacityStr, 10) : null;

    const supabase = createClient();

    startTransition(async () => {
      if (isEditing) {
        // Update existing event
        const { error: updateError } = await supabase
          .from("events")
          .update({
            title,
            description: description || null,
            image_url: imageUrl,
            starts_at: startsAt,
            location_name: locationName || null,
            address: address || null,
            google_maps_url: googleMapsUrl || null,
            external_chat_url: externalChatUrl || null,
            capacity,
          })
          .eq("id", event.id);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        router.push(`/events/${event.slug}`);
        router.refresh();
      } else {
        // Create new event
        const slug = generateSlug(title);

        const { data, error: insertError } = await supabase
          .from("events")
          .insert({
            slug,
            title,
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

        router.push(`/events/${data.slug}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Event title *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Coffee & Code"
              defaultValue={event?.title ?? ""}
              required
            />
          </div>

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

          {/* Event image/video */}
          {isEditing ? (
            <div className="space-y-2">
              <Label>Event flyer or video</Label>
              <EventMediaUpload
                eventId={event.id}
                currentMediaUrl={imageUrl}
                onMediaChange={setImageUrl}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              You can add a flyer image or video after creating the event.
            </p>
          )}

          {/* Date and time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={defaults.date}
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

          {/* External chat URL */}
          <div className="space-y-2">
            <Label htmlFor="external_chat_url">Chat group link</Label>
            <Input
              id="external_chat_url"
              name="external_chat_url"
              type="url"
              placeholder="https://zalo.me/g/... or WhatsApp link"
              defaultValue={event?.external_chat_url ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Zalo, WhatsApp, or Facebook group link
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

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save changes"
                : "Create event"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
