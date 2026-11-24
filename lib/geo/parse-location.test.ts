import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl, isShortGoogleMapsUrl, parseLocationInput } from "./parse-location";

describe("pasted Maps locations without paid APIs", () => {
  it("chooses the place pin over a different camera center", () => {
    expect(parseLocationInput("https://www.google.com/maps/place/Social+House/@11.99,108.49,15z/data=!4m2!3d11.9467648!4d108.4341887"))
      .toMatchObject({ latitude: 11.9467648, longitude: 108.4341887 });
  });
  it.each(["query=11.9467648%2C108.4341887", "q=11.9467648%2C+108.4341887", "destination=11.9467648,108.4341887", "ll=11.9467648,108.4341887"])("reads coordinate parameter %s", query => {
    expect(parseLocationInput(`https://www.google.com/maps/search/?api=1&${query}`)).toMatchObject({ latitude: 11.9467648, longitude: 108.4341887 });
  });
  it("still accepts raw coordinates and map camera-only URLs", () => {
    expect(parseLocationInput("11.9467648, 108.4341887")).toMatchObject({ latitude: 11.9467648 });
    expect(parseLocationInput("https://www.google.com/maps/@11.9467648,108.4341887,15z")).toMatchObject({ longitude: 108.4341887 });
  });
  it("recognizes short links without mistaking arbitrary hosts for Google", () => {
    expect(isShortGoogleMapsUrl("https://maps.app.goo.gl/2XHcfUNDzv4Da24L6")).toBe(true);
    for (const url of ["https://evil.example/maps.app.goo.gl/id", "https://maps.app.goo.gl.evil.example/id", "https://google.com@evil.example/maps", "http://maps.app.goo.gl/id"]) {
      expect(isGoogleMapsUrl(url)).toBe(false);
      expect(parseLocationInput(url)).toBeNull();
    }
  });
});

it("does not use the camera or route origin as the destination", () => {
  expect(parseLocationInput("https://www.google.com/maps/place/Somewhere/@11.99,108.49,15z")).toBeNull();
  expect(parseLocationInput("https://maps.google.com/?q=Socialhouse&ll=11.99,108.49")).toBeNull();
  const route = "https://www.google.com/maps/dir/11.99,108.49/11.9467648,108.4341887/@11.98,108.47,15z";
  expect(parseLocationInput(route)).toMatchObject({ latitude: 11.9467648, longitude: 108.4341887 });
  expect(parseLocationInput("https://www.google.com/maps/dir/11.99,108.49/11.95,108.45/11.9467648,108.4341887/@11.98,108.47,15z"))
    .toMatchObject({ latitude: 11.9467648, longitude: 108.4341887 });
  expect(parseLocationInput("https://www.google.com/maps/dir/11.99,108.49/11.95,108.45/Final+Stop/@11.98,108.47,15z")).toBeNull();
  expect(parseLocationInput("https://www.google.com/maps/dir/Socialhouse/Named+Destination/@11,108,15z/data=!3d11.1!4d108.1")).toBeNull();
});
