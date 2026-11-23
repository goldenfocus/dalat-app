import { describe, expect, it } from "vitest";
import { getTikTokLink, splitVenueLinks } from "./social-links";

const profile = "https://www.tiktok.com/@dalathoavaem";
const video = `${profile}/video/7673525894392352020`;

describe("venue social links", () => {
  it("recognizes a legacy TikTok post and exposes its creator profile", () => {
    expect(splitVenueLinks(`${video}?_t=tracking`)).toEqual({
      website: null,
      tiktok: { profile, href: video },
    });
  });

  it("keeps an independent business website and its TikTok profile", () => {
    expect(splitVenueLinks("https://cafe.example", profile)).toEqual({
      website: "https://cafe.example/",
      tiktok: { profile, href: profile },
    });
  });

  it("keeps TikTok share links without guessing a creator", () => {
    expect(getTikTokLink("https://vt.tiktok.com/ZSs8uwovb/?utm_source=share")).toEqual({
      profile: null,
      href: "https://vt.tiktok.com/ZSs8uwovb/",
    });
  });

  it("rejects lookalikes, credentials, unsafe schemes, and unsupported paths", () => {
    for (const url of [
      "https://tiktok.com.example/@name",
      "https://person@www.tiktok.com/@name",
      "javascript:alert(1)",
      "https://www.tiktok.com/login",
      "https://www.tiktok.com:444/@name",
    ]) expect(getTikTokLink(url)).toBeNull();
  });
});
