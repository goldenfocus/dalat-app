import { render, fireEvent, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromoMediaActions } from "./promo-media-actions";
import type { EventPromoMedia } from "@/lib/types";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/i18n/routing", () => ({ Link: "a" }));
vi.mock("@/lib/hooks/use-share", () => ({ useShare: () => ({ share: vi.fn(), copied: false }) }));
const item = {id:"p",media_type:"youtube",media_url:"https://chicoman.com/downloads/videos/a.mp4",source_moment_id:"m"} as EventPromoMedia;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function ios() { vi.spyOn(navigator,"userAgent","get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"); }
describe("mobile promo saving", () => {
  it("shows a persistent fallback immediately when the iPhone host cannot share files", () => {
    ios();
    Object.defineProperty(navigator,"canShare",{configurable:true,value:undefined});
    render(<PromoMediaActions item={item} eventSlug="event" />);
    fireEvent.click(screen.getByRole("link",{name:"saveFile"}));
    expect(screen.getByRole("link",{name:"openFile"}).getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("textbox",{name:"copyDownloadLink"})).toBeTruthy();
  });
  it("prepares once and shares the actual video only from a fresh save tap", async () => {
    ios();
    const share=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:share});
    let complete: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch",vi.fn(()=>new Promise(resolve=>{complete=resolve;})));
    render(<PromoMediaActions item={item} eventSlug="event" />);
    fireEvent.click(screen.getByRole("link",{name:"saveFile"}));
    expect(screen.getByRole("status").textContent).toBe("download.albumStarted");
    expect(share).not.toHaveBeenCalled();
    complete({ok:true,blob:async()=>new Blob(["video"],{type:"video/mp4"})});
    await waitFor(()=>expect(screen.getByRole("button",{name:"saveFile"})).toBeTruthy());
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"saveFile"}));
    await waitFor(()=>expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0][0].files[0].type).toBe("video/mp4");
  });
  it("keeps the open-file fallback and reports preparation errors", async () => {
    ios();
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:vi.fn()});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false}));
    render(<PromoMediaActions item={item} eventSlug="event" />);
    fireEvent.click(screen.getByRole("link",{name:"saveFile"}));
    await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("download.failed"));
    expect(screen.getByRole("link",{name:"openFile"})).toBeTruthy();
  });
});
