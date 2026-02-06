import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useImageUpload } from "@/hooks/use-image-upload";

// Mock the Supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://storage.example.com/test.jpg" },
        }),
      }),
    },
  }),
}));

describe("useImageUpload", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => useImageUpload());

    expect(result.current.imageUrl).toBeNull();
    expect(result.current.pendingFile).toBeNull();
    expect(result.current.imageFit).toBe("cover");
    expect(result.current.focalPoint).toBeNull();
  });

  it("initializes with provided values", () => {
    const { result } = renderHook(() =>
      useImageUpload({
        initialImageUrl: "https://example.com/image.jpg",
        initialImageFit: "contain",
        initialFocalPoint: "50 30",
      })
    );

    expect(result.current.imageUrl).toBe("https://example.com/image.jpg");
    expect(result.current.imageFit).toBe("contain");
    expect(result.current.focalPoint).toBe("50 30");
  });

  describe("setImageUrl", () => {
    it("updates image URL", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.setImageUrl("https://example.com/new-image.jpg");
      });

      expect(result.current.imageUrl).toBe("https://example.com/new-image.jpg");
    });

    it("can set URL to null", () => {
      const { result } = renderHook(() =>
        useImageUpload({ initialImageUrl: "https://example.com/image.jpg" })
      );

      act(() => {
        result.current.setImageUrl(null);
      });

      expect(result.current.imageUrl).toBeNull();
    });
  });

  describe("setImageFit", () => {
    it("updates image fit to contain", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.setImageFit("contain");
      });

      expect(result.current.imageFit).toBe("contain");
    });

    it("updates image fit to cover", () => {
      const { result } = renderHook(() =>
        useImageUpload({ initialImageFit: "contain" })
      );

      act(() => {
        result.current.setImageFit("cover");
      });

      expect(result.current.imageFit).toBe("cover");
    });
  });

  describe("setFocalPoint", () => {
    it("updates focal point", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.setFocalPoint("25 75");
      });

      expect(result.current.focalPoint).toBe("25 75");
    });

    it("can clear focal point", () => {
      const { result } = renderHook(() =>
        useImageUpload({ initialFocalPoint: "50 50" })
      );

      act(() => {
        result.current.setFocalPoint(null);
      });

      expect(result.current.focalPoint).toBeNull();
    });
  });

  describe("handleImageChange", () => {
    it("updates image URL without file", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.handleImageChange("https://example.com/uploaded.jpg");
      });

      expect(result.current.imageUrl).toBe("https://example.com/uploaded.jpg");
      expect(result.current.pendingFile).toBeNull();
    });

    it("updates image URL and pending file", () => {
      const { result } = renderHook(() => useImageUpload());

      const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
      const previewUrl = "blob:https://example.com/preview";

      act(() => {
        result.current.handleImageChange(previewUrl, mockFile);
      });

      expect(result.current.imageUrl).toBe(previewUrl);
      expect(result.current.pendingFile).toBe(mockFile);
    });

    it("clears pending file when no file provided", () => {
      const { result } = renderHook(() => useImageUpload());

      // First set a file
      const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
      act(() => {
        result.current.handleImageChange("blob:preview", mockFile);
      });

      // Then change without file
      act(() => {
        result.current.handleImageChange("https://example.com/external.jpg");
      });

      expect(result.current.imageUrl).toBe("https://example.com/external.jpg");
      expect(result.current.pendingFile).toBeNull();
    });
  });

  describe("uploadImage", () => {
    it("returns existing URL when no pending file or data URL", async () => {
      const { result } = renderHook(() =>
        useImageUpload({ initialImageUrl: "https://example.com/existing.jpg" })
      );

      const uploadedUrl = await result.current.uploadImage("event-123");

      expect(uploadedUrl).toBe("https://example.com/existing.jpg");
    });

    it("returns null when no image", async () => {
      const { result } = renderHook(() => useImageUpload());

      const uploadedUrl = await result.current.uploadImage("event-123");

      expect(uploadedUrl).toBeNull();
    });
  });
});
