import { arrivalFailure, arrivalJson } from "@/lib/arrival/http";
import { managedVenues } from "@/lib/venues/managed";
import { staffEvents } from "@/lib/arrival/staff-events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [events, venues] = await Promise.all([staffEvents(), managedVenues()]);
    return arrivalJson({ events, venues });
  } catch (error) {
    return arrivalFailure(error);
  }
}
