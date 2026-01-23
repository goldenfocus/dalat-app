import { Link } from "@/lib/i18n/routing";
import { Plus, MapPin, BadgeCheck, ExternalLink, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import type { Venue } from "@/lib/types";

async function getVenues(): Promise<Venue[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("venues")
    .select("*")
    .order("is_verified", { ascending: false })
    .order("name");
  return data ?? [];
}

export default async function AdminVenuesPage() {
  const venues = await getVenues();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Venues</h1>
          <p className="text-muted-foreground">
            Manage physical locations where events happen
          </p>
        </div>
        <Link href="/admin/venues/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Venue
          </Button>
        </Link>
      </div>

      {venues.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No venues yet</h2>
          <p className="text-muted-foreground mb-4">
            Add your first venue to start linking events to physical locations.
          </p>
          <Link href="/admin/venues/new">
            <Button>Add Venue</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => {
            const typeConfig = getVenueTypeConfig(venue.venue_type);
            const TypeIcon = typeConfig.icon;

            return (
              <Link
                key={venue.id}
                href={`/admin/venues/${venue.id}/edit`}
                className="group rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  <div className="shrink-0 w-16 h-16 rounded-lg bg-muted overflow-hidden">
                    {venue.logo_url ? (
                      <img
                        src={venue.logo_url}
                        alt={venue.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center ${typeConfig.bgColor} ${typeConfig.darkBgColor}`}
                      >
                        <TypeIcon
                          className={`w-8 h-8 ${typeConfig.color} ${typeConfig.darkColor}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{venue.name}</h3>
                      {venue.is_verified && (
                        <BadgeCheck className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${typeConfig.bgColor} ${typeConfig.darkBgColor} ${typeConfig.color} ${typeConfig.darkColor}`}
                      >
                        <TypeIcon className="w-3 h-3" />
                        {typeConfig.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        /{venue.slug}
                      </span>
                    </div>
                    {venue.address && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {venue.address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer info */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground">
                  {venue.total_events_hosted > 0 && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {venue.total_events_hosted} events hosted
                    </span>
                  )}
                  {venue.website_url && (
                    <span className="flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Website
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
