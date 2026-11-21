import { expect, it } from "vitest";
import { automaticRentalTour, buildRentalTour, rentalTourFrames } from "./tour";
import { sourceFields, TRANSLATION_SOURCES } from "@/lib/translations/registry";

const first = { kind: "photo", src: "/first.webp", label: "First" } as const;
const second = { kind: "photo", src: "/second.webp", label: "Second" } as const;
const clip = { kind: "video", src: "/tour.mp4", label: "Clip" } as const;

it("opens the automatic tour with video when present and updates with the listing media", () => {
  expect(automaticRentalTour([first, second, clip, first]).map(frame => frame.src)).toEqual([clip.src, first.src, second.src]);
  expect(buildRentalTour([second, first], null).map(slide => slide.media)).toEqual([second, first]);
});

it("preserves a curator's selection and aligns translations after a missing frame", () => {
  const frames = [
    { src: clip.src, caption: "House walkthrough" },
    { src: first.src, caption: "" },
    { src: second.src, caption: "Kitchen" },
  ];
  const translated = JSON.stringify(["Visite de la maison", "Cuisine"]);
  expect(buildRentalTour([second, first], frames, translated)).toEqual([
    { media: first, caption: "", original: undefined },
    { media: second, caption: "Cuisine", original: "Kitchen" },
  ]);
});

it("returns to the current automatic tour when no curated media survives", () => {
  expect(buildRentalTour([first], [{ src: second.src, caption: "Old photo" }])[0].media).toEqual(first);
  expect(rentalTourFrames.safeParse([{ src: first.src, caption: "" }, { src: first.src, caption: "" }]).success).toBe(false);
});

it("queues caption prose without including listing media identifiers", () => {
  expect(sourceFields(TRANSLATION_SOURCES[0], { tour_frames: [{ src: first.src, caption: "Kitchen" }], tour_captions: ["Kitchen"] }))
    .toEqual({ tour_captions: '["Kitchen"]' });
});
