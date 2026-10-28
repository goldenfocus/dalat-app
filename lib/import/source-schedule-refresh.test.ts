import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshPublishedSourceSchedules,
  refreshSourceUrl,
  type RefreshableEvent,
} from "./source-schedule-refresh";

const NOW = new Date("2026-10-28T10:00:00.000Z");

function page(start: string, end: string, extra = "") {
  return `<html><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Event",
    name: "TĂNG PHÚC - ĐÀ LẠT",
    url: "https://maylangthang.com.vn/shows/tp-2011",
    startDate: start,
    endDate: end,
    location: {
      "@type": "Place",
      name: "Mây Lang Thang",
      address: "519 Măng Lin, Đà Lạt",
    },
    ...(extra ? { eventStatus: extra } : {}),
  })}</script></html>`;
}

function event(overrides: Partial<RefreshableEvent> = {}): RefreshableEvent {
  return {
    id: "e1",
    slug: "tang-phuc-da-lat",
    title: "TĂNG PHÚC - ĐÀ LẠT",
    description: "Chương trình diễn ra vào ngày 20 tháng 11 năm 2026.",
    starts_at: "2026-11-20T10:00:00+00:00",
    ends_at: "2026-11-20T12:00:00+00:00",
    status: "published",
    external_chat_url: "https://maylangthang.com.vn/shows/tp-2011",
    source_metadata: {
      source_url: "https://maylangthang.com.vn/shows/tp-2011",
    },
    ...overrides,
  };
}

function db(rows: RefreshableEvent[]) {
  const updates: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];
  const listQuery: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "or", "gt", "lt", "order"]) {
    listQuery[method] = vi.fn(() => listQuery);
  }
  listQuery.limit = vi.fn(async () => ({ data: rows, error: null }));
  const client = {
    from: vi.fn((table: string) => {
      if (table === "content_translations") {
        const chain: Record<string, unknown> = {};
        chain.delete = vi.fn(() => chain);
        chain.eq = vi.fn((column: string, value: string) => {
          if (column === "content_id") {
            deletes.push(value);
            return Promise.resolve({ error: null });
          }
          return chain;
        });
        return chain;
      }
      return {
        ...listQuery,
        update: vi.fn((values: Record<string, unknown>) => {
          updates.push(values);
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.select = vi.fn(() => chain);
          chain.maybeSingle = vi.fn(async () => ({
            data: { id: "e1" },
            error: null,
          }));
          return chain;
        }),
      };
    }),
  };
  return { client: client as unknown as SupabaseClient, updates, deletes };
}

describe("published source schedule refresh", () => {
  it("moves a published event to the source's new date, keeps the dateless slug, logs and retranslates", async () => {
    const { client, updates, deletes } = db([event()]);
    const outcomes = await refreshPublishedSourceSchedules(client, {
      now: NOW,
      fetchHtml: async (url) => ({
        url,
        text: page("2026-11-22T17:00:00+07:00", "2026-11-22T19:00:00+07:00"),
      }),
    });
    expect(outcomes).toEqual([
      {
        eventId: "e1",
        status: "updated",
        from: "2026-11-20T10:00:00+00:00",
        to: "2026-11-22T10:00:00.000Z",
        slug: null,
      },
    ]);
    expect(updates[0]).toMatchObject({
      starts_at: "2026-11-22T10:00:00.000Z",
      ends_at: "2026-11-22T12:00:00.000Z",
      description: "Chương trình diễn ra vào ngày 22 tháng 11 năm 2026.",
    });
    expect(updates[0].slug).toBeUndefined();
    expect(updates[0].status).toBeUndefined();
    const metadata = updates[0].source_metadata as Record<string, unknown>;
    expect(metadata.translation_needed_at).toBe(NOW.toISOString());
    expect(metadata.post_publish_review).toMatchObject({
      reason: "source_schedule_changed",
    });
    expect(metadata.schedule_changes).toHaveLength(1);
    expect(deletes).toEqual(["e1"]);
  });

  it("rewrites a dated slug", async () => {
    const { client, updates } = db([event({ slug: "tang-phuc-20112026" })]);
    await refreshPublishedSourceSchedules(client, {
      now: NOW,
      fetchHtml: async (url) => ({
        url,
        text: page("2026-11-22T17:00:00+07:00", "2026-11-22T19:00:00+07:00"),
      }),
    });
    expect(updates[0].slug).toBe("tang-phuc-22112026");
  });

  it("leaves the event untouched when the source matches", async () => {
    const { client, updates } = db([event()]);
    const outcomes = await refreshPublishedSourceSchedules(client, {
      now: NOW,
      fetchHtml: async (url) => ({
        url,
        text: page("2026-11-20T17:00:00+07:00", "2026-11-20T19:00:00+07:00"),
      }),
    });
    expect(outcomes[0].status).toBe("unchanged");
    expect(updates).toHaveLength(0);
  });

  it("never edits or unpublishes on fetch errors, missing data, or cancellations", async () => {
    for (const fetchHtml of [
      async () => {
        throw new Error("Source returned HTTP 503");
      },
      async (url: string) => ({ url, text: "<html>no json-ld</html>" }),
      async (url: string) => ({
        url,
        text: page(
          "2026-11-22T17:00:00+07:00",
          "2026-11-22T19:00:00+07:00",
          "https://schema.org/EventCancelled",
        ),
      }),
      async (url: string) => ({
        url,
        text: page("2026-10-01T17:00:00+07:00", "2026-10-01T19:00:00+07:00"),
      }),
    ]) {
      const { client, updates, deletes } = db([event()]);
      const outcomes = await refreshPublishedSourceSchedules(client, {
        now: NOW,
        fetchHtml,
      });
      expect(["error", "skipped"]).toContain(outcomes[0].status);
      expect(updates).toHaveLength(0);
      expect(deletes).toHaveLength(0);
    }
  });

  it("only checks https pages that can carry structured event data", () => {
    expect(refreshSourceUrl(event())).toBe(
      "https://maylangthang.com.vn/shows/tp-2011",
    );
    expect(
      refreshSourceUrl(
        event({
          source_metadata: {},
          external_chat_url: "https://www.facebook.com/events/1",
        }),
      ),
    ).toBeNull();
    expect(
      refreshSourceUrl(
        event({
          source_metadata: { source_url: "whatsapp:123@g.us/ABC" },
          external_chat_url: null,
        }),
      ),
    ).toBeNull();
  });
});
