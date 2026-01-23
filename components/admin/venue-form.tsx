"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { VENUE_TYPES, VENUE_TYPE_CONFIG } from "@/lib/constants/venue-types";
import type { Venue, VenueType, OperatingHours } from "@/lib/types";

interface VenueFormProps {
  venue?: Venue;
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

  // Location
  const [latitude, setLatitude] = useState(venue?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(venue?.longitude?.toString() ?? "");

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
    const address = formData.get("address") as string;
    const googleMapsUrl = formData.get("google_maps_url") as string;
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

    if (!latitude || !longitude) {
      setError("Location coordinates are required");
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      setError("Invalid coordinates");
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
        latitude: lat,
        longitude: lng,
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
      } else {
        const { error: insertError } = await supabase.from("venues").insert(data);

        if (insertError) {
          setError(insertError.message);
          return;
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

            {/* Logo URL */}
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                type="url"
                placeholder="https://..."
                value={logoUrl ?? ""}
                onChange={(e) => setLogoUrl(e.target.value || null)}
              />
            </div>

            {/* Cover Photo URL */}
            <div className="space-y-2">
              <Label htmlFor="cover_photo_url">Cover Photo URL</Label>
              <Input
                id="cover_photo_url"
                type="url"
                placeholder="https://..."
                value={coverPhotoUrl ?? ""}
                onChange={(e) => setCoverPhotoUrl(e.target.value || null)}
              />
            </div>

            {/* Name */}
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
            <h2 className="font-semibold">Location</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude *</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  placeholder="11.9404"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude *</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  placeholder="108.4583"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                placeholder="123 Phan Đình Phùng, Ward 2"
                defaultValue={venue?.address ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="google_maps_url">Google Maps URL</Label>
              <Input
                id="google_maps_url"
                name="google_maps_url"
                type="url"
                placeholder="https://maps.google.com/..."
                defaultValue={venue?.google_maps_url ?? ""}
              />
            </div>
          </CardContent>
        </Card>

        {/* Operating Hours */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <h2 className="font-semibold">Operating Hours</h2>

            <div className="space-y-3">
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
          </CardContent>
        </Card>

        {/* Amenities */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <h2 className="font-semibold">Amenities</h2>

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
          </CardContent>
        </Card>

        {/* Contact & Links */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <h2 className="font-semibold">Contact & Links</h2>

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
          </CardContent>
        </Card>

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
