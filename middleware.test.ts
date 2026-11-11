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

describe("preview channel", () => {
  const inner = () => vi.mocked(updateSession).mock.lastCall![0].nextUrl;

  it.each([
    ["/v3/calendar?view=week&date=2026-11-09", "/calendar?view=week&date=2026-11-09"],
    ["/vi/v4/events/tea", "/vi/events/tea"],
    ["/v3", "/preview-home"],
    ["/vi/v3/", "/vi/preview-home"],
  ])("serves %s from %s on any host", async (path, served) => {
    for (const origin of ["https://dalat.app", "https://preview.example"]) {
      const response = await middleware(new NextRequest(`${origin}${path}`));
      expect(inner().pathname + inner().search).toBe(served);
      expect(response.headers.get("x-middleware-rewrite")).toBe(`${origin}${served}`);
      expect(response.headers.has("x-middleware-next")).toBe(false);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });

  it("keeps a locale rewrite chosen by the session middleware", async () => {
    vi.mocked(updateSession).mockReturnValueOnce(
      NextResponse.rewrite("https://dalat.app/en/calendar") as never,
    );
    const response = await middleware(new NextRequest("https://dalat.app/v3/calendar"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://dalat.app/en/calendar");
  });

  it.each([
    ["https://dalat.app/vi/calendar", "https://dalat.app/vi/v3/calendar"],
    ["https://dalat.app/en/auth/login", "https://dalat.app/en/v3/auth/login"],
    ["https://dalat.app/auth/callback?code=1", "https://dalat.app/auth/callback?code=1"],
    ["https://accounts.example/start", "https://accounts.example/start"],
  ])("puts a redirect to %s back under the prefix where it applies", async (to, expected) => {
    vi.mocked(updateSession).mockReturnValueOnce(NextResponse.redirect(to) as never);
    const response = await middleware(new NextRequest("https://dalat.app/v3/settings"));
    expect(response.headers.get("location")).toBe(expected);
  });

  it.each([
    ["/vi/v3/calendar?view=week&preview=off", "/vi/calendar?view=week"],
    ["/v3?preview=off", "/"],
    ["/calendar?preview=off", "/calendar"],
  ])("leaves the preview from %s", async (path, destination) => {
    vi.mocked(updateSession).mockClear();
    const response = await middleware(new NextRequest(`https://dalat.app${path}`));
    const body = await response.text();
    expect(body).toContain(`sessionStorage.removeItem("fog-preview")`);
    expect(body).toContain(`location.replace(${JSON.stringify(destination)})`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("keeps the exit destination inert inside the script", async () => {
    const response = await middleware(
      new NextRequest("https://dalat.app/calendar?preview=off&x=%3C/script%3E%3Cb%3E"),
    );
    expect(await response.text()).not.toContain("</script><b>");
  });

  it.each(["/v10/calendar", "/v3x", "/events/v3", "/vanessa"])("does not treat %s as a channel", async (path) => {
    const request = new NextRequest(`https://dalat.app${path}`);
    await middleware(request);
    expect(updateSession).toHaveBeenCalledWith(request);
  });
});
