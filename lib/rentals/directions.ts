import { z } from "zod";
import { generateGoogleMapsUrl, isGoogleMapsUrl, parseCoordinates } from "@/lib/geo/parse-location";

const shareLink = (value: string, hosts: string[]) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.includes(url.hostname) &&
      !url.username && !url.password && !url.port && url.pathname !== "/" ? url.href : null;
  } catch {
    return null;
  }
};

export const safeGrabMapsLink = (value: string) => shareLink(value, ["grabmaps.grab.com", "grab.onelink.me"]);

export function safeRentalMapsLink(value: string) {
  if (isGoogleMapsUrl(value)) return new URL(value).href;
  const pin = parseCoordinates(value);
  return pin ? generateGoogleMapsUrl(pin.latitude, pin.longitude) : null;
}

export const rentalDirectionsColumns = "listing_id,address,maps_url,grab_url,is_public";

export const rentalDirectionsSchema = z.object({
  address: z.string().trim().max(250),
  maps_url: z.string().trim().max(2048).refine(value => !value || !!safeRentalMapsLink(value)),
  grab_url: z.string().trim().max(2048).refine(value => !value || !!safeGrabMapsLink(value)),
  is_public: z.boolean(),
});

export type RentalDirections = z.infer<typeof rentalDirectionsSchema>;

export function rentalDirectionLinks(directions: RentalDirections) {
  const { address } = directions;
  const map = safeRentalMapsLink(directions.maps_url) || (address
    ? "https://www.google.com/maps/search/?" + new URLSearchParams({ api: "1", query: address })
    : null);
  const grab = safeGrabMapsLink(directions.grab_url);
  return { address, map, grab };
}
