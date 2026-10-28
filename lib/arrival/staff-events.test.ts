import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), admin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("./server", () => ({ arrivalAdmin: mocks.admin }));
import { staffEvents } from "./staff-events";

function query(data: unknown) {
  const builder = {
    select: vi.fn(), eq: vi.fn(), not: vi.fn(), in: vi.fn(), or: vi.fn(),
    gte: vi.fn(), order: vi.fn(), limit: vi.fn(), single: vi.fn(),
    then: (resolve: (result: { data: unknown; error: null }) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
  for (const method of [builder.select, builder.eq, builder.not, builder.in, builder.or,
    builder.gte, builder.order, builder.limit, builder.single]) method.mockReturnValue(builder);
  return builder;
}

const assignedEvent = { id: "assigned-event", slug: "exchange", title: "Exchange", starts_at: "2026-10-28T11:00:00Z" };
const otherEvent = { ...assignedEvent, id: "other-event", slug: "other" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer-account" } } });
  mocks.admin.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.from.mockImplementation((table: string) => query({
    profiles: { role: "user" }, event_staff: [{ event_id: "assigned-event" }],
    venues: [], venue_managers: [], events: [assignedEvent, otherEvent],
  }[table]));
  mocks.rpc.mockImplementation((_name: string, args: { p_event_id: string }) => Promise.resolve({
    data: { canWelcome: args.p_event_id === "assigned-event", canOrder: false, canManage: false }, error: null,
  }));
});

describe("staff event discovery", () => {
  it("rejects anonymous requests before reading privileged data", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(staffEvents()).rejects.toThrow("not_authenticated");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("uses the authenticated target and excludes every unauthorized candidate", async () => {
    expect(await staffEvents()).toEqual([assignedEvent]);
    expect(mocks.rpc).toHaveBeenCalledWith("arrival_access", {
      p_actor_id: "viewer-account", p_event_id: "assigned-event",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("arrival_access", {
      p_actor_id: "viewer-account", p_event_id: "other-event",
    });
  });

  it("requires arrival opt-in, published and public events even for privileged scopes", async () => {
    const events = query([assignedEvent]);
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => table === "events" ? events : original(table));
    await staffEvents();
    expect(events.eq).toHaveBeenCalledWith("arrival_enabled", true);
    expect(events.eq).toHaveBeenCalledWith("status", "published");
    expect(events.or).toHaveBeenCalledWith("tribe_id.is.null,tribe_visibility.eq.public");
    expect(events.or).toHaveBeenCalledWith("created_by.eq.viewer-account,id.in.(assigned-event)");
  });

  it("fails closed if access checks fail", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("permissions unavailable") });
    await expect(staffEvents()).rejects.toThrow("permissions unavailable");
  });
});
