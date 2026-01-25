"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { OrganizerLogoUpload } from "@/components/admin/organizer-logo-upload";
import { AIOrganizerLogoDialog } from "@/components/admin/ai-organizer-logo-dialog";
import { EventMediaUpload } from "@/components/events/event-media-upload";
import { PlaceAutocomplete } from "@/components/events/place-autocomplete";
import { VENUE_TYPES, VENUE_TYPE_CONFIG } from "@/lib/constants/venue-types";
import { triggerTranslation } from "@/lib/translations-client";
import type { Venue, VenueType, OperatingHours } from "@/lib/types";
import { sanitizeSlug, suggestSlug, finalizeSlug } from "@/lib/utils";

interface VenueFormProps {
  venue?: Venue;
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const DAYS: (keyof OperatingHours)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_HOURS: OperatingHours = {
  monday: { open: "09:00", close: "22:00" },
  tuesday: { open: "09:00", close: "22:00" },
  wednesday: { open: "09:00", close: "22:00" },
  thursday: { open: "09:00", close: "22:00" },
  friday: { open: "09:00", close: "22:00" },
  saturday: { open: "09:00", close: "22:00" },
  sunday: { open: "09:00", close: "22:00" },
};

export function VenueForm({ venue }: VenueFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(venue?.name ?? "");
  const [venueType, setVenueType] = useState<VenueType | "">(venue?.venue_type ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(venue?.logo_url ?? null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(
    venue?.cover_photo_url ?? null
  );

  // Location (managed by PlaceAutocomplete)
  const [latitude, setLatitude] = useState<number | null>(venue?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(venue?.longitude ?? null);
  const [address, setAddress] = useState(venue?.address ?? "");
  const [googleMapsUrl, setGoogleMapsUrl] = useState(venue?.google_maps_url ?? "");

  // Operating hours
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(
    venue?.operating_hours ?? DEFAULT_HOURS
  );

  const isEditing = !!venue;

  // Slug state
  const [slug, setSlug] = useState(venue?.slug ?? "");
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

    if (isEditing && slug === venue?.slug) {
      setSlugStatus("available");
      return;
    }

    setSlugStatus("checking");

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("venues")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      setSlugStatus(data ? "taken" : "available");
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, slugTouched, isEditing, venue?.slug]);

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

  // Update operating hours for a specific day
  const updateDayHours = (
    day: keyof OperatingHours,
    field: "open" | "close" | "closed",
    value: string | boolean
  ) => {
    setOperatingHours((prev) => {
      if (field === "closed") {
        return {
          ...prev,
          [day]: value ? "closed" : { open: "09:00", close: "22:00" },
        };
      }
      const current = prev[day];
      if (current === "closed" || !current) {
        return prev;
      }
      return {
        ...prev,
        [day]: { ...current, [field]: value },
      };
    });
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const description = formData.get("description") as string;
    const websiteUrl = formData.get("website_url") as string;
    const facebookUrl = formData.get("facebook_url") as string;
    const instagramUrl = formData.get("instagram_url") as string;
    const zaloUrl = formData.get("zalo_url") as string;
    const phone = formData.get("phone") as string;
    const email = formData.get("email") as string;
    const priceRange = formData.get("price_range") as string;
    const isVerified = formData.get("is_verified") === "on";
    const hasWifi = formData.get("has_wifi") === "on";
    const hasParking = formData.get("has_parking") === "on";
    const hasOutdoorSeating = formData.get("has_outdoor_seating") === "on";
    const isPetFriendly = formData.get("is_pet_friendly") === "on";
    const isWheelchairAccessible = formData.get("is_wheelchair_accessible") === "on";

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

    if (latitude === null || longitude === null) {
      setError("Location is required - search for the venue location above");
      return;
    }

    if (!venueType) {
      setError("Venue type is required");
      return;
    }

    const supabase = createClient();

    startTransition(async () => {
      const data = {
        name,
        slug: cleanSlug,
        description: description || null,
        venue_type: venueType,
        latitude,
        longitude,
        address: address || null,
        google_maps_url: googleMapsUrl || null,
        logo_url: logoUrl,
        cover_photo_url: coverPhotoUrl,
        website_url: websiteUrl || null,
        facebook_url: facebookUrl || null,
        instagram_url: instagramUrl || null,
        zalo_url: zaloUrl || null,
        phone: phone || null,
        email: email || null,
        price_range: priceRange || null,
        operating_hours: operatingHours,
        is_verified: isVerified,
        has_wifi: hasWifi,
        has_parking: hasParking,
        has_outdoor_seating: hasOutdoorSeating,
        is_pet_friendly: isPetFriendly,
        is_wheelchair_accessible: isWheelchairAccessible,
      };

      if (isEditing) {
        const { error: updateError } = await supabase
          .from("venues")
          .update(data)
          .eq("id", venue.id);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        // Trigger translation for description only (venue names are proper names, never translate)
        if (description?.trim()) {
          triggerTranslation("venue", venue.id, [
            { field_name: "description", text: description.trim() },
          ]);
        }
      } else {
        const { data: insertedVenue, error: insertError } = await supabase
          .from("venues")
          .insert(data)
          .select("id")
          .single();

        if (insertError) {
          setError(insertError.message);
          return;
        }

        // Trigger translation for description only (venue names are proper names, never translate)
        if (insertedVenue && description?.trim()) {
          triggerTranslation("venue", insertedVenue.id, [
            { field_name: "description", text: description.trim() },
          ]);
        }
      }

      router.push("/admin/venues");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <h2 className="font-semibold">Basic Information</h2>

            {/* Name - first so it can inform AI generation */}
            <div className="space-y-2">
              <Label htmlFor="name">Venue name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Phố Bên Đồi"
                value={name}
                onChange={handleNameChange}
                required
              />
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <OrganizerLogoUpload
                organizerId={venue?.id}
                organizerName={name}
                bucket="venue-media"
                currentLogoUrl={logoUrl}
                onLogoChange={setLogoUrl}
                aiLogoButton={
                  <AIOrganizerLogoDialog
                    organizerId={venue?.id}
                    organizerName={name || "venue"}
                    currentLogoUrl={logoUrl}
                    onLogoGenerated={setLogoUrl}
                    context="venue-logo"
                  />
                }
              />
            </div>

            {/* Cover Photo */}
            <div className="space-y-2">
              <Label>Cover Photo</Label>
              <EventMediaUpload
                eventId={venue?.id || `temp-${Date.now()}`}
                eventTitle={name}
                bucket="venue-media"
                currentMediaUrl={coverPhotoUrl}
                onMediaChange={(url) => setCoverPhotoUrl(url)}
                autoSave={false}
                aiContext="venue-cover"
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">URL slug *</Label>
              <div className="flex items-center gap-0">
                <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input">
                  /venues/
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

            {/* Venue Type */}
            <div className="space-y-2">
              <Label htmlFor="venue_type">Venue type *</Label>
              <select
                id="venue_type"
                value={venueType}
                onChange={(e) => setVenueType(e.target.value as VenueType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Select type...</option>
                {VENUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {VENUE_TYPE_CONFIG[type].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <AIEnhanceTextarea
                id="description"
                name="description"
                context="a venue description for a Da Lat events platform"
                placeholder="About this venue..."
                defaultValue={venue?.description ?? ""}
                rows={4}
              />
            </div>

            {/* Price Range */}
            <div className="space-y-2">
              <Label htmlFor="price_range">Price range</Label>
              <select
                id="price_range"
                name="price_range"
                defaultValue={venue?.price_range ?? ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Not specified</option>
                <option value="$">$ - Budget-friendly</option>
                <option value="$$">$$ - Moderate</option>
                <option value="$$$">$$$ - Upscale</option>
                <option value="$$$$">$$$$ - Fine dining</option>
              </select>
            </div>

            {/* Verified toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_verified"
                name="is_verified"
                defaultChecked={venue?.is_verified ?? false}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_verified" className="font-normal">
                Verified venue (shows badge, priority in listings)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <h2 className="font-semibold">Location *</h2>

            <PlaceAutocomplete
              onPlaceSelect={(place) => {
                if (place) {
                  setLatitude(place.latitude);
                  setLongitude(place.longitude);
                  setAddress(place.address);
                  setGoogleMapsUrl(place.googleMapsUrl);
                } else {
                  setLatitude(null);
                  setLongitude(null);
                  setAddress("");
                  setGoogleMapsUrl("");
                }
              }}
              defaultValue={
                venue
                  ? {
                      placeId: "",
                      name: venue.name,
                      address: venue.address || "",
                      googleMapsUrl: venue.google_maps_url || "",
                      latitude: venue.latitude,
                      longitude: venue.longitude,
                    }
                  : null
              }
            />

            {latitude !== null && longitude !== null && (
              <p className="text-xs text-muted-foreground">
                Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Operating Hours - Collapsible */}
        <details className="group border rounded-xl overflow-hidden">
          <summary className="flex items-center justify-between px-5 py-4 bg-muted/50 hover:bg-muted transition-colors cursor-pointer list-none active:scale-[0.99] [&::-webkit-details-marker]:hidden">
            <span className="font-semibold">Operating Hours</span>
            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="p-6 space-y-3">
            {DAYS.map((day) => {
              const hours = operatingHours[day];
              const isClosed = hours === "closed";

              return (
                <div key={day} className="flex items-center gap-4">
                  <span className="w-24 capitalize text-sm">{day}</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isClosed}
                      onChange={(e) => updateDayHours(day, "closed", e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm text-muted-foreground">Closed</span>
                  </label>
                  {!isClosed && typeof hours === "object" && (
                    <>
                      <Input
                        type="time"
                        value={hours.open}
                        onChange={(e) => updateDayHours(day, "open", e.target.value)}
                        className="w-32"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={hours.close}
                        onChange={(e) => updateDayHours(day, "close", e.target.value)}
                        className="w-32"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </details>

        {/* Amenities - Collapsible */}
        <details className="group border rounded-xl overflow-hidden">
          <summary className="flex items-center justify-between px-5 py-4 bg-muted/50 hover:bg-muted transition-colors cursor-pointer list-none active:scale-[0.99] [&::-webkit-details-marker]:hidden">
            <span className="font-semibold">Amenities</span>
            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { id: "has_wifi", label: "WiFi available" },
                { id: "has_parking", label: "Parking available" },
                { id: "has_outdoor_seating", label: "Outdoor seating" },
                { id: "is_pet_friendly", label: "Pet friendly" },
                { id: "is_wheelchair_accessible", label: "Wheelchair accessible" },
              ].map(({ id, label }) => (
                <label key={id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={id}
                    name={id}
                    defaultChecked={
                      venue?.[id as keyof Venue] as boolean | undefined ?? false
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        {/* Contact & Links - Collapsible */}
        <details className="group border rounded-xl overflow-hidden">
          <summary className="flex items-center justify-between px-5 py-4 bg-muted/50 hover:bg-muted transition-colors cursor-pointer list-none active:scale-[0.99] [&::-webkit-details-marker]:hidden">
            <span className="font-semibold">Contact & Links</span>
            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+84..."
                  defaultValue={venue?.phone ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="hello@venue.com"
                  defaultValue={venue?.email ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_url">Website</Label>
                <Input
                  id="website_url"
                  name="website_url"
                  type="url"
                  placeholder="https://..."
                  defaultValue={venue?.website_url ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook_url">Facebook</Label>
                <Input
                  id="facebook_url"
                  name="facebook_url"
                  type="url"
                  placeholder="https://facebook.com/..."
                  defaultValue={venue?.facebook_url ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram_url">Instagram</Label>
                <Input
                  id="instagram_url"
                  name="instagram_url"
                  type="url"
                  placeholder="https://instagram.com/..."
                  defaultValue={venue?.instagram_url ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zalo_url">Zalo</Label>
                <Input
                  id="zalo_url"
                  name="zalo_url"
                  type="url"
                  placeholder="https://zalo.me/..."
                  defaultValue={venue?.zalo_url ?? ""}
                />
              </div>
            </div>
          </div>
        </details>

        {/* Submit */}
        <Card>
          <CardContent className="p-6">
            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

            <div className="flex gap-3">
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending
                  ? isEditing
                    ? "Saving..."
                    : "Creating..."
                  : isEditing
                  ? "Save changes"
                  : "Create venue"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
