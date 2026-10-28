import { arrivalFailure, arrivalJson } from "@/lib/arrival/http";
import { staffEvents } from "@/lib/arrival/staff-events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return arrivalJson({ events: await staffEvents() });
  } catch (error) {
    return arrivalFailure(error);
  }
}
