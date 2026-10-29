import { describe, expect, it } from "vitest";
import { SOURCE, captureTime, datesInName, matchPhoto, type PhotoEvent } from "./matching";
const event: PhotoEvent = { id:"event",slug:"language-exchange",starts_at:"2026-10-28T11:00:00Z",ends_at:"2026-10-28T13:00:00Z",venue_id:SOURCE.venueId,series_id:SOURCE.seriesId,created_by:"owner",status:"published" };
const now = new Date("2026-10-29T00:00:00Z");
describe("dated owner folder matching", () => {
  it.each(["2026-10-28 Language Exchange","28.10.2026","20261028","28/10/2026","2026_10_28"])("recognizes %s", name => expect(datesInName(name)).toEqual(["2026-10-28"]));
  it.each(["28 October","28/10","IMG_1028.jpg","2026-02-30","2026-13-01","20261028123000"])("does not invent a date from %s", name => expect(datesInName(name)).toEqual([]));
  it("matches a dated nested folder even without EXIF", () => expect(matchPhoto(["2026","2026-10-28","jpgs","DSC_002.jpg"],null,[event],now)).toMatchObject({event:{id:"event"},day:"2026-10-28",capturedAt:null}));
  it("uses capture time when folder has no date", () => expect(matchPhoto(["uploads","IMG.jpg"],captureTime("2026:10:28 18:25:00"),[event],now)).toHaveProperty("event"));
  it("holds conflicting folder and capture dates", () => expect(matchPhoto(["2026-10-21","IMG.jpg"],captureTime("2026:10:28 18:25:00"),[event],now)).toHaveProperty("reason","Conflicting dates; manual review required"));
  it("holds ambiguous day/month dates", () => expect(matchPhoto(["01/02/2026"],null,[event],now)).toHaveProperty("reason", "Conflicting dates; manual review required"));
  it("holds contradictory ancestor and child folders", () => expect(matchPhoto(["2026-10-21","2026-10-28"],null,[event],now)).toHaveProperty("reason"));
  it("does not match other venues or other event series", () => expect(matchPhoto(["2026-10-28"],null,[{...event,venue_id:"other"},{...event,series_id:"other"}],now)).toHaveProperty("reason"));
  it("holds more than one event on a date", () => expect(matchPhoto(["2026-10-28"],null,[event,{...event,id:"second"}],now)).toHaveProperty("reason","Multiple events on this date"));
  it("holds events that have not ended", () => expect(matchPhoto(["2026-10-28"],null,[event],new Date("2026-10-28T12:00:00Z"))).toHaveProperty("reason","Event has not ended yet"));
  it("does not attach photos to cancelled events", () => expect(matchPhoto(["2026-10-28"],null,[{...event,status:"cancelled"}],now)).toHaveProperty("reason"));
});
describe("capture timestamps", () => {
  it("interprets offset-less camera timestamps as Vietnam time", () => expect(captureTime("2026:10:28 00:30:00")).toBe("2026-10-27T17:30:00.000Z"));
  it("preserves explicit offset", () => expect(captureTime("2026-10-28T18:30:00+07:00")).toBe("2026-10-28T11:30:00.000Z"));
  it("converts UTC into the Vietnam calendar before matching", () => {
    const midnight = {...event,starts_at:"2026-10-27T17:00:00Z",ends_at:"2026-10-27T19:00:00Z"};
    expect(matchPhoto([],"2026-10-27T18:30:00Z",[midnight],now)).toMatchObject({day:"2026-10-28"});
  });
  it.each(["2026:02:30 18:00:00","2026-10-28T99:00:00","yesterday",""])("rejects invalid %s", input => expect(captureTime(input)).toBeNull());
});
