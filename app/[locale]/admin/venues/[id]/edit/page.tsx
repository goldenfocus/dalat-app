import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VenueForm } from "@/components/admin/venue-form";
import type { Venue } from "@/lib/types";

interface EditVenuePageProps {
  params: Promise<{ id: string }>;
}

async function getVenue(id: string): Promise<Venue | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("venues").select("*").eq("id", id).single();
  return data;
}

export default async function EditVenuePage({ params }: EditVenuePageProps) {
  const { id } = await params;
  const venue = await getVenue(id);

  if (!venue) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit Venue</h1>
        <p className="text-muted-foreground">{venue.name}</p>
      </div>
      <VenueForm venue={venue} />
    </div>
  );
}
