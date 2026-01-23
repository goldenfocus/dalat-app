"use client";

import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import type { Venue, VenueType } from "@/lib/types";

interface VenuePickerProps {
  value: string | null;
  onChange: (venueId: string | null) => void;
  placeholder?: string;
}

interface VenueOption {
  id: string;
  name: string;
  venue_type: VenueType | null;
  address: string | null;
}

export function VenuePicker({
  value,
  onChange,
  placeholder = "Select a venue...",
}: VenuePickerProps) {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch venues on mount
  useEffect(() => {
    async function fetchVenues() {
      const supabase = createClient();
      const { data } = await supabase
        .from("venues")
        .select("id, name, venue_type, address")
        .order("name");

      if (data) {
        setVenues(data);
      }
      setLoading(false);
    }

    fetchVenues();
  }, []);

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(val) => onChange(val === "none" ? null : val)}
    >
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Loading..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">No venue selected</span>
        </SelectItem>
        {venues.map((venue) => {
          const typeConfig = getVenueTypeConfig(venue.venue_type);
          const TypeIcon = typeConfig.icon;

          return (
            <SelectItem key={venue.id} value={venue.id}>
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${typeConfig.bgColor} ${typeConfig.darkBgColor}`}
                >
                  <TypeIcon
                    className={`w-3 h-3 ${typeConfig.color} ${typeConfig.darkColor}`}
                  />
                </div>
                <span>{venue.name}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
