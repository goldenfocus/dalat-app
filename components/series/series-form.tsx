"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationPicker, type SelectedLocation } from "@/components/events/location-picker";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { describeRRule } from "@/lib/recurrence";
import type { EventSeries, Organizer } from "@/lib/types";

interface SeriesFormProps {
  series: EventSeries;
  userId: string;
}

export function SeriesForm({ series, userId: _userId }: SeriesFormProps) {
  const router = useRouter();
  const t = useTranslations("series");
  const tCommon = useTranslations("common");
  const tEventForm = useTranslations("eventForm");
  const tErrors = useTranslations("errors");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(series.title);
  const [description, setDescription] = useState(series.description || "");
  const [imageUrl, setImageUrl] = useState(series.image_url || "");
  const [startsAtTime, setStartsAtTime] = useState(
    series.starts_at_time?.slice(0, 5) || "19:00"
  );
  const [durationMinutes, setDurationMinutes] = useState(
    series.duration_minutes?.toString() || "120"
  );
  const [externalChatUrl, setExternalChatUrl] = useState(
    series.external_chat_url || ""
  );
  const [capacity, setCapacity] = useState(series.capacity?.toString() || "");
  const [hasCapacityLimit, setHasCapacityLimit] = useState(!!series.capacity);

  // Location state
  const [locationName, setLocationName] = useState(series.location_name || "");
  const [address, setAddress] = useState(series.address || "");
  const [googleMapsUrl, setGoogleMapsUrl] = useState(series.google_maps_url || "");
  const [latitude, setLatitude] = useState<number | null>(series.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(series.longitude ?? null);

  // Update scope: "series" = only template, "future" = template + future events
  const [updateScope, setUpdateScope] = useState<"series" | "future">("future");

  // Organizer state (for admins)
  const [organizerId, setOrganizerId] = useState<string | null>(
    series.organizer_id ?? null
  );
  const [organizers, setOrganizers] = useState<Pick<Organizer, 'id' | 'name' | 'slug' | 'logo_url'>[]>([]);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"future" | "all">("future");

  // Fetch organizers on mount
  useEffect(() => {
    async function fetchOrganizers() {
      const response = await fetch("/api/organizers?verified=true");
      if (response.ok) {
        const data = await response.json();
        setOrganizers(data.organizers || []);
      }
    }
    fetchOrganizers();
  }, []);

  // Handle location selection
  const handleLocationSelect = useCallback((location: SelectedLocation | null) => {
    if (location) {
      setLocationName(location.name);
      setAddress(location.address);
      setGoogleMapsUrl(location.googleMapsUrl || "");
      setLatitude(location.latitude);
      setLongitude(location.longitude);
    } else {
      setLocationName("");
      setAddress("");
      setGoogleMapsUrl("");
      setLatitude(null);
      setLongitude(null);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError(tErrors("fieldsRequired", { fields: tErrors("fieldTitle") }));
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/series/${series.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            image_url: imageUrl.trim() || null,
            starts_at_time: startsAtTime + ":00", // Convert "19:00" to "19:00:00"
            duration_minutes: parseInt(durationMinutes, 10) || 120,
            location_name: locationName || null,
            address: address || null,
            google_maps_url: googleMapsUrl || null,
            external_chat_url: externalChatUrl || null,
            capacity: hasCapacityLimit && capacity ? parseInt(capacity, 10) : null,
            organizer_id: organizerId,
            // Include update_scope to propagate changes
            update_scope: updateScope,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Failed to update series");
          return;
        }

        router.push(`/series/${series.slug}`);
        router.refresh();
      } catch (err) {
        console.error("Form submission error:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/series/${series.slug}?scope=${deleteScope}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to cancel series");
        setIsDeleting(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsDeleting(false);
    }
  }

  const recurrenceDescription = describeRRule(series.rrule);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back Navigation */}
      <Link
        href={`/series/${series.slug}`}
        className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{tCommon("back")}</span>
      </Link>

      <h1 className="text-2xl font-bold">{t("editSeries")}</h1>

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Recurrence Info (read-only) */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium text-muted-foreground">
              {t("recurrencePattern")}
            </p>
            <p className="text-foreground">{recurrenceDescription}</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">{tEventForm("titleRequired")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tEventForm("titlePlaceholder")}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{tEventForm("info")}</Label>
            <AIEnhanceTextarea
              id="description"
              name="description"
              value={description}
              onChange={setDescription}
              rows={3}
              context="a recurring event series description in Đà Lạt, Vietnam"
            />
            <p className="text-xs text-muted-foreground">
              {tEventForm("infoHelperText")}
            </p>
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">{tEventForm("imageUrl") || "Image URL"}</Label>
            <Input
              id="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
            {imageUrl && (
              <div className="mt-2">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="w-full max-w-xs rounded-lg object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            )}
          </div>

          {/* Time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="time">{t("startTime")}</Label>
              <Input
                id="time"
                type="time"
                value={startsAtTime}
                onChange={(e) => setStartsAtTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{t("duration")}</Label>
              <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 {t("hour")}</SelectItem>
                  <SelectItem value="90">1.5 {t("hours")}</SelectItem>
                  <SelectItem value="120">2 {t("hours")}</SelectItem>
                  <SelectItem value="180">3 {t("hours")}</SelectItem>
                  <SelectItem value="240">4 {t("hours")}</SelectItem>
                  <SelectItem value="300">5 {t("hours")}</SelectItem>
                  <SelectItem value="360">6 {t("hours")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location */}
          <LocationPicker
            defaultValue={
              locationName
                ? {
                    type: "place",
                    name: locationName,
                    address: address,
                    googleMapsUrl: googleMapsUrl,
                    latitude: latitude,
                    longitude: longitude,
                  }
                : null
            }
            onLocationSelect={handleLocationSelect}
          />

          {/* Hidden inputs for location data */}
          <input type="hidden" name="location_name" value={locationName} />
          <input type="hidden" name="address" value={address} />
          <input type="hidden" name="google_maps_url" value={googleMapsUrl} />
          <input type="hidden" name="latitude" value={latitude?.toString() || ""} />
          <input type="hidden" name="longitude" value={longitude?.toString() || ""} />

          {/* External Link */}
          <div className="space-y-2">
            <Label htmlFor="externalChatUrl">{tEventForm("externalLink")}</Label>
            <Input
              id="externalChatUrl"
              type="url"
              value={externalChatUrl}
              onChange={(e) => setExternalChatUrl(e.target.value)}
              placeholder={tEventForm("externalLinkPlaceholder")}
            />
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Checkbox
                id="hasCapacityLimit"
                checked={hasCapacityLimit}
                onCheckedChange={(checked) => setHasCapacityLimit(!!checked)}
              />
              <Label htmlFor="hasCapacityLimit" className="cursor-pointer">
                {tEventForm("limitAttendees")}
              </Label>
              {hasCapacityLimit && (
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-24"
                />
              )}
            </div>
          </div>

          {/* Organizer (if organizers exist) */}
          {organizers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="organizer">{tEventForm("organizer")}</Label>
              <Select
                value={organizerId ?? "none"}
                onValueChange={(value) => setOrganizerId(value === "none" ? null : value)}
              >
                <SelectTrigger id="organizer">
                  <SelectValue placeholder={tEventForm("selectOrganizer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tEventForm("noOrganizer")}</SelectItem>
                  {organizers.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Scope */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("updateScope")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={updateScope}
            onValueChange={(value) => setUpdateScope(value as "series" | "future")}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="series" id="scope-series" className="mt-1" />
              <div>
                <Label htmlFor="scope-series" className="cursor-pointer font-medium">
                  {t("thisSeriesOnly")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("thisSeriesOnlyDescription")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="future" id="scope-future" className="mt-1" />
              <div>
                <Label htmlFor="scope-future" className="cursor-pointer font-medium">
                  {t("allFutureEvents")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("allFutureEventsDescription")}
                </p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            {t("dangerZone")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("cancelSeriesDescription")}
          </p>

          <RadioGroup
            value={deleteScope}
            onValueChange={(value) => setDeleteScope(value as "future" | "all")}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="future" id="delete-future" className="mt-1" />
              <div>
                <Label htmlFor="delete-future" className="cursor-pointer font-medium">
                  {t("cancelFutureOnly")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("cancelFutureOnlyDescription")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="all" id="delete-all" className="mt-1" />
              <div>
                <Label htmlFor="delete-all" className="cursor-pointer font-medium">
                  {t("cancelAllEvents")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("cancelAllEventsDescription")}
                </p>
              </div>
            </div>
          </RadioGroup>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={isDeleting}>
                {isDeleting ? t("cancelling") : t("cancelSeries")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("confirmCancelTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteScope === "future"
                    ? t("confirmCancelFuture")
                    : t("confirmCancelAll")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("confirmCancel")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <p className="text-sm text-red-500 px-1">{error}</p>
      )}

      {/* Submit Button */}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? t("saving") : t("saveChanges")}
      </Button>
    </form>
  );
}
