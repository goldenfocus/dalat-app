// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  PREVIEW_FLAG,
  innerPath,
  parsePreviewPath,
  previewBootstrapScript,
  splitLocale,
  stripChannel,
  withChannel,
} from "./preview-channel";

describe("preview channel paths", () => {
  it.each([
    ["/v3", { locale: "", channel: "v3", rest: "" }],
    ["/v3/", { locale: "", channel: "v3", rest: "" }],
    ["/v3/calendar", { locale: "", channel: "v3", rest: "/calendar" }],
    ["/vi/v4/events/tea", { locale: "/vi", channel: "v4", rest: "/events/tea" }],
  ])("reads %s", (path, expected) => {
    expect(parsePreviewPath(path)).toEqual(expected);
  });

  it.each(["/", "/calendar", "/vi", "/v10/x", "/v3x", "/vanessa", "/xx/v3", "/events/v3"])(
    "leaves %s alone",
    (path) => expect(parsePreviewPath(path)).toBeNull(),
  );

  it("serves the channel root from the preview homepage route", () => {
    expect(innerPath(parsePreviewPath("/v3")!)).toBe("/preview-home");
    expect(innerPath(parsePreviewPath("/vi/v3/")!)).toBe("/vi/preview-home");
    expect(innerPath(parsePreviewPath("/vi/v3/map")!)).toBe("/vi/map");
  });

  it("puts plain paths back under the channel", () => {
    expect(withChannel("/calendar", "v3")).toBe("/v3/calendar");
    expect(withChannel("/vi/events/tea", "v3")).toBe("/vi/v3/events/tea");
    expect(withChannel("/", "v3")).toBe("/v3");
    expect(withChannel("/vi", "v4")).toBe("/vi/v4");
    expect(withChannel("/vi/preview-home", "v3")).toBe("/vi/v3");
    expect(withChannel("/v3/calendar", "v3")).toBe("/v3/calendar");
  });

  it("reads the plain path behind a channel URL", () => {
    expect(stripChannel("/v3/moments")).toBe("/moments");
    expect(stripChannel("/vi/v3/map")).toBe("/vi/map");
    expect(stripChannel("/v3")).toBe("/");
    expect(stripChannel("/vi/v3")).toBe("/vi");
    expect(stripChannel("/moments")).toBe("/moments");
  });

  it("splits a locale prefix only when it is a whole segment", () => {
    expect(splitLocale("/vi/map")).toEqual({ locale: "/vi", rest: "/map" });
    expect(splitLocale("/vietnam")).toEqual({ locale: "", rest: "/vietnam" });
    expect(splitLocale("/ko")).toEqual({ locale: "/ko", rest: "/" });
  });
});

/** Run the inline bootstrap against a fake browser. */
function boot(url: string, stored: string | null = null) {
  const parsed = new URL(url, "https://dalat.app");
  const store = new Map<string, string>(stored ? [[PREVIEW_FLAG, stored]] : []);
  const classes = new Set<string>();
  const replaceState = vi.fn();
  const location = {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    replace: vi.fn(),
  };
  new Function("location", "sessionStorage", "document", "history", "History", previewBootstrapScript)(
    location,
    {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    { documentElement: { classList: { add: (name: string) => classes.add(name) } } },
    { state: { tree: 1 } },
    { prototype: { replaceState } },
  );
  return { flag: store.get(PREVIEW_FLAG) ?? null, fog: classes.has("fog"), replaceState, location };
}

describe("preview bootstrap script", () => {
  it("does nothing in a normal tab", () => {
    const result = boot("/calendar");
    expect(result).toMatchObject({ flag: null, fog: false });
    expect(result.replaceState).not.toHaveBeenCalled();
  });

  it("turns the skin on and remembers the channel on a channel URL", () => {
    expect(boot("/v3/calendar?view=week")).toMatchObject({ flag: "v3", fog: true });
    expect(boot("/vi/v4")).toMatchObject({ flag: "v4", fog: true });
  });

  it("puts a plain URL back under the prefix inside a preview tab", () => {
    const result = boot("/vi/events/tea?x=1#top", "v3");
    expect(result.fog).toBe(true);
    expect(result.replaceState).toHaveBeenCalledWith({ tree: 1 }, "", "/vi/v3/events/tea?x=1#top");
  });

  it("sends the plain homepage to the preview homepage", () => {
    const result = boot("/vi", "v3");
    expect(result.location.replace).toHaveBeenCalledWith("/vi/v3");
    expect(result.replaceState).not.toHaveBeenCalled();
  });

  it("does not mistake a username for a channel", () => {
    expect(boot("/v3x")).toMatchObject({ flag: null, fog: false });
  });
});
