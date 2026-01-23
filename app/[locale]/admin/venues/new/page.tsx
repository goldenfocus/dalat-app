import { VenueForm } from "@/components/admin/venue-form";

export default function NewVenuePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add New Venue</h1>
        <p className="text-muted-foreground">
          Create a new physical location for events
        </p>
      </div>
      <VenueForm />
    </div>
  );
}
