import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMaterialsForEvent } from "@/components/events/event-materials-input";
import type { DraftMaterial } from "@/lib/types";

const uploadFileMock = vi.fn();
vi.mock("@/lib/storage/client", () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

function makeDraft(overrides: Partial<DraftMaterial>): DraftMaterial {
  return {
    id: `draft-${Math.random()}`,
    material_type: "image",
    file_url: "blob:http://localhost/preview",
    original_filename: "file.jpeg",
    file_size: 1000,
    mime_type: "image/jpeg",
    youtube_url: null,
    youtube_video_id: null,
    title: null,
    artist: null,
    album: null,
    duration_seconds: null,
    thumbnail_url: null,
    track_number: null,
    release_year: null,
    genre: null,
    pending_file: new File(["x"], "file.jpeg", { type: "image/jpeg" }),
    ...overrides,
  } as DraftMaterial;
}

describe("createMaterialsForEvent", () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
  });

  it("returns the uploaded URL of the first image material", async () => {
    uploadFileMock
      .mockResolvedValueOnce({ publicUrl: "https://cdn.dalat.app/event-materials/e1/doc.pdf" })
      .mockResolvedValueOnce({ publicUrl: "https://cdn.dalat.app/event-materials/e1/flyer.jpeg" })
      .mockResolvedValueOnce({ publicUrl: "https://cdn.dalat.app/event-materials/e1/second.png" });

    const drafts = [
      makeDraft({ material_type: "document", mime_type: "application/pdf" }),
      makeDraft({ original_filename: "flyer.jpeg" }),
      makeDraft({ original_filename: "second.png" }),
    ];

    const firstImageUrl = await createMaterialsForEvent("e1", drafts);
    expect(firstImageUrl).toBe("https://cdn.dalat.app/event-materials/e1/flyer.jpeg");
  });

  it("returns null when there are no image materials", async () => {
    uploadFileMock.mockResolvedValue({ publicUrl: "https://cdn.dalat.app/event-materials/e1/doc.pdf" });

    const drafts = [makeDraft({ material_type: "document", mime_type: "application/pdf" })];
    const firstImageUrl = await createMaterialsForEvent("e1", drafts);
    expect(firstImageUrl).toBeNull();
  });

  it("returns null when the image upload fails", async () => {
    uploadFileMock.mockRejectedValue(new Error("WAF 403"));

    const drafts = [makeDraft({})];
    const firstImageUrl = await createMaterialsForEvent("e1", drafts);
    expect(firstImageUrl).toBeNull();
  });

  it("returns null for an empty draft list", async () => {
    const firstImageUrl = await createMaterialsForEvent("e1", []);
    expect(firstImageUrl).toBeNull();
  });
});
