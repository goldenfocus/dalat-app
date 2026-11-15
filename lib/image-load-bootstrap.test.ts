import { afterEach, describe, expect, it } from "vitest";
import { imageLoadBootstrap } from "./image-load-bootstrap";

const reveal = new Function(imageLoadBootstrap);
afterEach(() => { document.body.innerHTML = ""; });

describe("server image first paint", () => {
  it("reveals a downloaded image without waiting for React hydration", () => {
    reveal();
    const image = document.createElement("img");
    image.setAttribute("data-resilient-image", "");
    image.style.visibility = "hidden";
    document.body.append(image);
    image.dispatchEvent(new Event("load"));
    expect(image.style.visibility).toBe("");
  });
  it("does not reveal broken images or change unrelated hidden images", () => {
    const broken = document.createElement("img");
    broken.setAttribute("data-resilient-image", "");
    broken.style.visibility = "hidden";
    const unrelated = document.createElement("img");
    unrelated.style.visibility = "hidden";
    document.body.append(broken, unrelated);
    broken.dispatchEvent(new Event("error"));
    unrelated.dispatchEvent(new Event("load"));
    expect(broken.style.visibility).toBe("hidden");
    expect(unrelated.style.visibility).toBe("hidden");
  });
});
