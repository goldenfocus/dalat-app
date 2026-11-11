// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
vi.mock("next-intl/navigation", () => ({ createNavigation: () => ({}) }));
vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(() => NextResponse.next()),
}));
import { middleware } from "./middleware";
import { updateSession } from "@/lib/supabase/proxy";

describe("workshop subdomain", () => {
  it("uses the incoming host when the server URL is internal", async () => {
    const response = await middleware(new NextRequest("http://localhost:3021/vi", { headers: { host: "phuong.dalat.app" } }));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3021/vi/collaborate/phuong");
  });
  it.each([["/", "en"], ["/vi", "vi"], ["/en", "en"]])("rewrites %s in the same application", async (path, locale) => {
    const response = await middleware(new NextRequest(`https://phuong.dalat.app${path}`));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`https://phuong.dalat.app/${locale}/collaborate/phuong`);
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe(locale);
  });
  it.each(["/en/auth/login", "/vi/auth/login", "/auth/forgot-password", "/vi/onboarding"])("keeps %s authentication on the workshop host", async path => {
    const request = new NextRequest(`https://phuong.dalat.app${path}`);
    await middleware(request);
    expect(updateSession).toHaveBeenCalledWith(request);
  });
  it.each([["/archive/v1","en"],["/vi/archive/v1","vi"],["/fr/archive/v1","fr"]])("preserves archived workshop %s",async(path,locale)=>{
    const response=await middleware(new NextRequest(`https://phuong.dalat.app${path}`));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`https://phuong.dalat.app/${locale}/collaborate/phuong/archive/v1`);
  });
  it("keeps public content on the main domain", async () => {
    const response = await middleware(new NextRequest("https://phuong.dalat.app/vi/venues?view=map"));
    expect(response.headers.get("location")).toBe("https://dalat.app/vi/venues?view=map");
  });
  it.each(["/thu", "/vi/thu", "/phuong", "/"]) ("leaves main-domain %s to existing routing", async (path) => {
    const request = new NextRequest(`https://dalat.app${path}`);
    await middleware(request);
    expect(updateSession).toHaveBeenCalledWith(request);
  });
});

describe("retired preview links", () => {
  it.each([
    ["/v3/calendar?view=week&date=2026-11-09", "/calendar?view=week&date=2026-11-09"],
    ["/vi/v4/events/tea", "/vi/events/tea"],
    ["/v3", "/"],
    ["/vi/v3/", "/vi"],
    ["/v3/map?preview=off", "/map"],
  ])("redirects %s to %s on any host", async (path, destination) => {
    for (const origin of ["https://dalat.app", "https://preview.example"]) {
      vi.mocked(updateSession).mockClear();
      const response = await middleware(new NextRequest(`${origin}${path}`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`${origin}${destination}`);
      expect(updateSession).not.toHaveBeenCalled();
    }
  });

  it.each(["/v10/calendar", "/v3x", "/events/v3", "/vanessa"])("does not treat %s as a preview link", async (path) => {
    const request = new NextRequest(`https://dalat.app${path}`);
    await middleware(request);
    expect(updateSession).toHaveBeenCalledWith(request);
  });
});
