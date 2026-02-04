"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Festival, Organizer } from "@/lib/types";

interface FestivalFormProps {
  userId: string;
  festival?: Festival;
  organizers: Organizer[];
  redirectTo?: string;
}

export function FestivalForm({ userId: _userId, festival, organizers: _organizers, redirectTo = "/admin/festivals" }: FestivalFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState(festival?.title || "");
  const [slug, setSlug] = useState(festival?.slug || "");
  const [subtitle, setSubtitle] = useState(festival?.subtitle || "");
  const [description, setDescription] = useState(festival?.description || "");
  const [startDate, setStartDate] = useState(festival?.start_date || "");
  const [endDate, setEndDate] = useState(festival?.end_date || "");
  const [locationCity, setLocationCity] = useState(festival?.location_city || "Đà Lạt");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const supabase = createClient();

    const festivalData = {
      title,
      slug,
      subtitle: subtitle || null,
      description: description || null,
      start_date: startDate,
      end_date: endDate,
      location_city: locationCity,
      status: "draft" as const,
    };

    if (festival) {
      await supabase
        .from("festivals")
        .update(festivalData)
        .eq("id", festival.id);
    } else {
      await supabase.from("festivals").insert(festivalData);
    }

    setIsSubmitting(false);
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{festival ? "Edit Festival" : "Create Festival"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Festival Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Festival name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug *</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="festival-name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Optional tagline"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locationCity">City</Label>
            <Input
              id="locationCity"
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
              placeholder="Đà Lạt"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Festival description..."
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {festival ? "Saving..." : "Creating..."}
              </>
            ) : festival ? (
              "Save Changes"
            ) : (
              "Create Festival"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
