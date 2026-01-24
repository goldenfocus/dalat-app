"use client";

import { useState, useEffect } from "react";
import { Home, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventMediaUpload } from "@/components/events/event-media-upload";

interface HomepageConfig {
  id: string;
  hero_image_url: string | null;
  hero_focal_point: string | null;
  updated_at: string;
  updated_by: string | null;
}

export default function AdminHomepagePage() {
  const [config, setConfig] = useState<HomepageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load current config
  useEffect(() => {
    async function loadConfig() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("homepage_config")
          .select("*")
          .limit(1)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        if (data) {
          setConfig(data);
        }
      } catch (err) {
        console.error("Failed to load homepage config:", err);
        setError("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }

    loadConfig();
  }, []);

  // Handle media change from EventMediaUpload
  const handleMediaChange = async (url: string | null) => {
    if (!config) return;

    setError(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();
      const { data: updatedConfig, error: updateError } = await supabase
        .from("homepage_config")
        .update({
          hero_image_url: url,
          updated_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", config.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      setConfig(updatedConfig);
      setSuccessMessage(
        url
          ? "Hero image updated! Changes will appear on the homepage within 1 minute."
          : "Hero image removed. Homepage will show the minimal text hero."
      );

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Failed to save:", err);
      setError("Failed to save changes. Please try again.");
    }
  };

  // Handle focal point change
  const handleFocalPointChange = async (point: string | null) => {
    if (!config) return;

    setError(null);

    try {
      const supabase = createClient();
      const { data: updatedConfig, error: updateError } = await supabase
        .from("homepage_config")
        .update({
          hero_focal_point: point,
          updated_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", config.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      setConfig(updatedConfig);
    } catch (err) {
      console.error("Failed to save focal point:", err);
      setError("Failed to save focal point. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Home className="h-6 w-6" />
          Homepage Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize the homepage hero section
        </p>
      </div>

      {/* Hero Image Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Hero Image</CardTitle>
          <CardDescription>
            Upload a full-width background image for the homepage hero section.
            The image will be displayed with a gradient overlay for text readability.
            You can also use AI to generate an image.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Reuse EventMediaUpload component */}
          {config && (
            <EventMediaUpload
              eventId="homepage-hero"
              eventTitle="Da Lat Community"
              currentMediaUrl={config.hero_image_url}
              onMediaChange={handleMediaChange}
              autoSave={false}
              bucket="site-assets"
              aiContext="venue-cover"
              focalPoint={config.hero_focal_point}
              onFocalPointChange={handleFocalPointChange}
            />
          )}

          {/* Messages */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {successMessage && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {successMessage}
            </p>
          )}

          {/* Info */}
          <div className="text-sm text-muted-foreground space-y-1 pt-4 border-t">
            <p>
              <strong>Current status:</strong>{" "}
              {config?.hero_image_url ? "Hero image active" : "Using minimal text hero (no image)"}
            </p>
            {config?.updated_at && (
              <p>
                <strong>Last updated:</strong>{" "}
                {new Date(config.updated_at).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-muted-foreground/70 mt-2">
              Note: Changes may take up to 1 minute to appear on the homepage due to caching.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
