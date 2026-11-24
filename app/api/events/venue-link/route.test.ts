import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { client, admin, matchPlace, revalidate } = vi.hoisted(() => ({
  client: vi.fn(), admin: vi.fn(), matchPlace: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: revalidate }));
vi.mock("@/lib/cache/server-cache", () => ({ CACHE_TAGS: { events: "events" } }));
vi.mock("@/lib/experiences/server", () => ({
  experienceAdmin: admin,
  safeMutation: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/lib/venues/public-event-places", () => ({ matchPublicEventPlace: matchPlace }));

const eventId = "eb413733-29a3-4800-89ef-a4645b277866";
const place = {
  id: "node/1234", name: "Public Cafe", address: "55 Example Street",
  latitude: 11.94, longitude: 108.44, venueType: "cafe",
};
const published = {
  id: eventId, slug: "coffee-meetup", series_id: null, venue_id: null,
  location_name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude,
};

function request() {
  return new Request("https://dalat.app/api/events/venue-link", {
    method: "POST", body: JSON.stringify({ eventId }),
  });
}
function query(data: unknown = null) {
  const result = { data, error: null };
  const filters = {
    eq: vi.fn(() => filters), is: vi.fn(() => filters), not: vi.fn(() => filters),
    or: vi.fn(() => filters), gte: vi.fn(() => filters), lte: vi.fn(() => filters),
    select: vi.fn(() => filters), limit: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return filters;
}
function signedIn(...queries: ReturnType<typeof query>[]) {
  const from = vi.fn();
  queries.forEach((item) => from.mockReturnValueOnce(item));
  const rpc = vi.fn().mockResolvedValue({ data: { allowed: true }, error: null });
  client.mockResolvedValue({ from, rpc, auth: { getUser: async () => ({ data: { user: { id: "host" } } }) } });
  return { from, rpc };
}

describe("published event venue linking", () => {
  beforeEach(() => vi.resetAllMocks());

  it("leaves an unpublished, private, online, or other creator's event outside venue discovery", async () => {
    const read = query();
    const { rpc } = signedIn(read);
    expect(await (await POST(request())).json()).toEqual({ claimSlug: null });
    expect(read.eq).toHaveBeenCalledWith("created_by", "host");
    expect(read.eq).toHaveBeenCalledWith("status", "published");
    expect(read.not).toHaveBeenCalledWith("is_online", "is", true);
    expect(read.not).toHaveBeenCalledWith("has_private_details", "is", true);
    expect(read.or).toHaveBeenCalledWith("tribe_id.is.null,tribe_visibility.eq.public");
    expect(rpc).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });

  it("shares an existing unclaimed venue without creating another", async () => {
    signedIn(query({ ...published, venue_id: "venue" }), query({ slug: "old-cafe", owner_id: null }));
    expect(await (await POST(request())).json()).toEqual({ eventSlug: published.slug, claimSlug: "old-cafe" });
    expect(admin).not.toHaveBeenCalled();
  });

  it("creates and links an independently mapped public venue with a stable identity", async () => {
    const update = vi.fn(() => query({ id: eventId }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const sponsor = { id: "venue", slug: "public-cafe-osm-node-1234", owner_id: null, name: place.name };
    const { from } = signedIn(query(published));
    from.mockReturnValueOnce({ update });
    matchPlace.mockReturnValue(place);
    const privileged = vi.fn().mockReturnValueOnce(query([])).mockReturnValueOnce({ upsert })
      .mockReturnValueOnce(query(sponsor));
    admin.mockReturnValue({ from: privileged });

    expect(await (await POST(request())).json()).toEqual({ eventSlug: published.slug, claimSlug: sponsor.slug });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), geocode_source: "osm_event_venue", name: place.name,
    }), { onConflict: "id", ignoreDuplicates: true });
    expect(update).toHaveBeenCalledWith({ venue_id: sponsor.id });
  });
});
