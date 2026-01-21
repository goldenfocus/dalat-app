"use client";

import { useState, useRef, useEffect } from "react";
import { ImageIcon, X, Plus, Loader2, GripVertical, ExternalLink, ChevronDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Sponsor, EventSponsor } from "@/lib/types";

// Draft sponsor for new events (before we have an eventId)
export interface DraftSponsor {
  id: string; // temporary client-side ID
  name: string;
  logo_url: string;
  website_url: string;
  logo_file?: File; // Store file for upload after event creation
}

interface SponsorFormProps {
  // For editing existing events
  eventId?: string;
  initialSponsors?: (EventSponsor & { sponsors: Sponsor })[];
  onChange?: (sponsors: (EventSponsor & { sponsors: Sponsor })[]) => void;
  // For new events (draft mode)
  draftSponsors?: DraftSponsor[];
  onDraftChange?: (sponsors: DraftSponsor[]) => void;
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validateLogoFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Please upload a JPEG, PNG, WebP, or SVG image";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "File size must be under 5MB";
  }
  return null;
}

export function SponsorForm({
  eventId,
  initialSponsors = [],
  onChange,
  draftSponsors = [],
  onDraftChange,
}: SponsorFormProps) {
  const isDraftMode = !eventId;

  // Live mode state (for editing)
  const [sponsors, setSponsors] = useState<(EventSponsor & { sponsors: Sponsor })[]>(initialSponsors);

  // Shared state
  const [isExpanded, setIsExpanded] = useState(initialSponsors.length > 0 || draftSponsors.length > 0);
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [existingSponsors, setExistingSponsors] = useState<Sponsor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingSponsors, setIsLoadingSponsors] = useState(false);
  const [newSponsor, setNewSponsor] = useState({ name: "", website_url: "", logo_url: "" });
  const [newSponsorFile, setNewSponsorFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing sponsors when add dialog opens
  useEffect(() => {
    if (isAdding && !isDraftMode) {
      loadExistingSponsors();
    }
  }, [isAdding, isDraftMode]);

  const loadExistingSponsors = async () => {
    setIsLoadingSponsors(true);
    try {
      const supabase = createClient();

      // Get all sponsors, ordered by most recently used in events
      const { data, error: fetchError } = await supabase
        .from("sponsors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      // Filter out sponsors already linked to this event
      const alreadyLinkedIds = new Set(sponsors.map(s => s.sponsor_id));
      const available = (data || []).filter(s => !alreadyLinkedIds.has(s.id));

      setExistingSponsors(available);
    } catch (err) {
      console.error("Error loading sponsors:", err);
    } finally {
      setIsLoadingSponsors(false);
    }
  };

  // Upload logo to storage (live mode only)
  const uploadLogo = async (file: File): Promise<string | null> => {
    if (!eventId) return null;

    const validationError = validateLogoFile(file);
    if (validationError) {
      setError(validationError);
      return null;
    }

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("sponsor-logos")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("sponsor-logos")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("Logo upload error:", err);
      setError("Failed to upload logo");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateLogoFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }

    if (isDraftMode) {
      // Draft mode: create preview URL, store file for later upload
      const previewUrl = URL.createObjectURL(file);
      setNewSponsor(prev => ({ ...prev, logo_url: previewUrl }));
      setNewSponsorFile(file);
    } else {
      // Live mode: upload immediately
      const url = await uploadLogo(file);
      if (url) {
        setNewSponsor(prev => ({ ...prev, logo_url: url }));
      }
    }
    e.target.value = "";
  };

  const handleAddSponsor = async () => {
    if (!newSponsor.name.trim()) {
      setError("Sponsor name is required");
      return;
    }

    setError(null);

    if (isDraftMode) {
      // Draft mode: add to local state
      const draft: DraftSponsor = {
        id: `draft-${Date.now()}`,
        name: newSponsor.name.trim(),
        logo_url: newSponsor.logo_url,
        website_url: newSponsor.website_url.trim(),
        logo_file: newSponsorFile || undefined,
      };

      const updated = [...draftSponsors, draft];
      onDraftChange?.(updated);

      // Reset form
      setNewSponsor({ name: "", website_url: "", logo_url: "" });
      setNewSponsorFile(null);
      setIsAdding(false);
    } else {
      // Live mode: save to database
      try {
        const supabase = createClient();

        const { data: sponsorData, error: sponsorError } = await supabase
          .from("sponsors")
          .insert({
            name: newSponsor.name.trim(),
            logo_url: newSponsor.logo_url || null,
            website_url: newSponsor.website_url.trim() || null,
            created_by: (await supabase.auth.getUser()).data.user?.id,
          })
          .select()
          .single();

        if (sponsorError) throw sponsorError;

        const sortOrder = sponsors.length;
        const { error: linkError } = await supabase
          .from("event_sponsors")
          .insert({
            event_id: eventId,
            sponsor_id: sponsorData.id,
            sort_order: sortOrder,
          });

        if (linkError) throw linkError;

        const newEventSponsor: EventSponsor & { sponsors: Sponsor } = {
          event_id: eventId!,
          sponsor_id: sponsorData.id,
          sort_order: sortOrder,
          created_at: new Date().toISOString(),
          sponsors: sponsorData,
        };

        const updatedSponsors = [...sponsors, newEventSponsor];
        setSponsors(updatedSponsors);
        onChange?.(updatedSponsors);

        setNewSponsor({ name: "", website_url: "", logo_url: "" });
        setIsAdding(false);
      } catch (err) {
        console.error("Error adding sponsor:", err);
        setError("Failed to add sponsor");
      }
    }
  };

  const handleAddExistingSponsor = async (sponsor: Sponsor) => {
    setError(null);

    if (isDraftMode) {
      // Draft mode: add to local state
      const draft: DraftSponsor = {
        id: `draft-${Date.now()}`,
        name: sponsor.name,
        logo_url: sponsor.logo_url || "",
        website_url: sponsor.website_url || "",
      };

      const updated = [...draftSponsors, draft];
      onDraftChange?.(updated);
      setIsAdding(false);
    } else {
      // Live mode: link to event
      try {
        const supabase = createClient();

        const sortOrder = sponsors.length;
        const { error: linkError } = await supabase
          .from("event_sponsors")
          .insert({
            event_id: eventId,
            sponsor_id: sponsor.id,
            sort_order: sortOrder,
          });

        if (linkError) throw linkError;

        const newEventSponsor: EventSponsor & { sponsors: Sponsor } = {
          event_id: eventId!,
          sponsor_id: sponsor.id,
          sort_order: sortOrder,
          created_at: new Date().toISOString(),
          sponsors: sponsor,
        };

        const updatedSponsors = [...sponsors, newEventSponsor];
        setSponsors(updatedSponsors);
        onChange?.(updatedSponsors);
        setIsAdding(false);
      } catch (err) {
        console.error("Error adding existing sponsor:", err);
        setError("Failed to add sponsor");
      }
    }
  };

  const handleRemoveSponsor = async (id: string) => {
    if (isDraftMode) {
      // Draft mode: remove from local state
      const updated = draftSponsors.filter(s => s.id !== id);
      onDraftChange?.(updated);
    } else {
      // Live mode: remove from database
      try {
        const supabase = createClient();

        const { error: deleteError } = await supabase
          .from("event_sponsors")
          .delete()
          .eq("event_id", eventId)
          .eq("sponsor_id", id);

        if (deleteError) throw deleteError;

        const updatedSponsors = sponsors.filter(s => s.sponsor_id !== id);
        setSponsors(updatedSponsors);
        onChange?.(updatedSponsors);
      } catch (err) {
        console.error("Error removing sponsor:", err);
        setError("Failed to remove sponsor");
      }
    }
  };

  // Get display list based on mode
  const displayList = isDraftMode
    ? draftSponsors.map(d => ({
        id: d.id,
        name: d.name,
        logo_url: d.logo_url,
        website_url: d.website_url,
      }))
    : sponsors.map(s => ({
        id: s.sponsor_id,
        name: s.sponsors?.name || "",
        logo_url: s.sponsors?.logo_url || "",
        website_url: s.sponsors?.website_url || "",
      }));

  const hasSponsors = displayList.length > 0;

  return (
    <div className="space-y-4">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <Label className="text-base cursor-pointer">
          Sponsors {hasSponsors && `(${displayList.length})`}
        </Label>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform",
          isExpanded && "rotate-180"
        )} />
      </button>

      {isExpanded && (
        <div className="space-y-4 pt-2">
          {/* Add sponsor button */}
          {!isAdding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add sponsor
            </Button>
          )}

          {/* Existing sponsors list */}
          {hasSponsors && (
            <div className="space-y-2">
              {displayList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />

                  {/* Logo */}
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {item.logo_url ? (
                      <img
                        src={item.logo_url}
                        alt={item.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Name & link */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    {item.website_url && (
                      <a
                        href={item.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate">{item.website_url}</span>
                      </a>
                    )}
                  </div>

                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSponsor(item.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add sponsor dialog */}
          {isAdding && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              {/* Mode toggle - only in live mode */}
              {!isDraftMode && (
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAddMode("existing")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded text-sm font-medium transition-colors",
                      addMode === "existing"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Select existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode("new")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded text-sm font-medium transition-colors",
                      addMode === "new"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Create new
                  </button>
                </div>
              )}

              {/* Existing sponsors list */}
              {addMode === "existing" && !isDraftMode && (
                <div className="space-y-3">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search sponsors..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Sponsors list */}
                  {isLoadingSponsors ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {existingSponsors
                        .filter(sponsor =>
                          sponsor.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((sponsor) => (
                          <button
                            key={sponsor.id}
                            type="button"
                            onClick={() => handleAddExistingSponsor(sponsor)}
                            className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-accent transition-colors text-left"
                          >
                            {/* Logo */}
                            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                              {sponsor.logo_url ? (
                                <img
                                  src={sponsor.logo_url}
                                  alt={sponsor.name}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>

                            {/* Name & link */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{sponsor.name}</p>
                              {sponsor.website_url && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {sponsor.website_url}
                                </p>
                              )}
                            </div>

                            {/* Add icon */}
                            <Plus className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          </button>
                        ))}

                      {existingSponsors.filter(sponsor =>
                        sponsor.name.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length === 0 && (
                        <p className="text-center py-8 text-sm text-muted-foreground">
                          {searchQuery ? "No sponsors found" : "No sponsors available"}
                        </p>
                      )}
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsAdding(false);
                        setSearchQuery("");
                        setError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Create new sponsor form */}
              {(addMode === "new" || isDraftMode) && (
                <>
                  <div className="flex items-start gap-4">
                {/* Logo upload */}
                <div
                  className={cn(
                    "w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors flex-shrink-0",
                    newSponsor.logo_url ? "border-transparent" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  ) : newSponsor.logo_url ? (
                    <img
                      src={newSponsor.logo_url}
                      alt="Logo preview"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground mx-auto" />
                      <span className="text-xs text-muted-foreground">Logo</span>
                    </div>
                  )}
                </div>

                {/* Name & URL inputs */}
                <div className="flex-1 space-y-3">
                  <Input
                    placeholder="Sponsor name *"
                    value={newSponsor.name}
                    onChange={(e) => setNewSponsor(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    type="url"
                    placeholder="Website URL (optional)"
                    value={newSponsor.website_url}
                    onChange={(e) => setNewSponsor(prev => ({ ...prev, website_url: e.target.value }))}
                  />
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                onChange={handleFileSelect}
                className="hidden"
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setAddMode("existing");
                    setSearchQuery("");
                    setNewSponsor({ name: "", website_url: "", logo_url: "" });
                    setNewSponsorFile(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddSponsor}
                  disabled={isUploading || !newSponsor.name.trim()}
                >
                  Add sponsor
                </Button>
              </div>
                </>
              )}
            </div>
          )}

          {!hasSponsors && !isAdding && (
            <p className="text-sm text-muted-foreground">
              Add sponsors to give them visibility on your event page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to create sponsors after event is created
export async function createSponsorsForEvent(
  eventId: string,
  draftSponsors: DraftSponsor[]
): Promise<void> {
  if (draftSponsors.length === 0) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  for (let i = 0; i < draftSponsors.length; i++) {
    const draft = draftSponsors[i];
    let logoUrl: string | null = draft.logo_url;

    // Upload logo if we have a file
    if (draft.logo_file) {
      const ext = draft.logo_file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `${eventId}/${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("sponsor-logos")
        .upload(fileName, draft.logo_file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from("sponsor-logos")
          .getPublicUrl(fileName);
        logoUrl = publicUrl;
      } else {
        // Upload failed - clear blob URL to avoid saving invalid reference
        logoUrl = null;
      }
    } else if (logoUrl?.startsWith("blob:")) {
      // Clear any blob URLs that weren't meant to be uploaded
      logoUrl = null;
    }

    // Create sponsor
    const { data: sponsorData, error: sponsorError } = await supabase
      .from("sponsors")
      .insert({
        name: draft.name,
        logo_url: logoUrl || null,
        website_url: draft.website_url || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (sponsorError) continue;

    // Link to event
    await supabase
      .from("event_sponsors")
      .insert({
        event_id: eventId,
        sponsor_id: sponsorData.id,
        sort_order: i,
      });
  }
}
