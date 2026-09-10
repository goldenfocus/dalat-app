import { describe, expect, it } from "vitest";
import { emptyMeeting, readMeeting } from "./workshop-state";
import en from "@/messages/thu/en.json";
import vi from "@/messages/thu/vi.json";

describe("meeting storage", () => {
  it("round trips choices and Vietnamese notes", () => {
    const meeting = {
      ...emptyMeeting(),
      experiment: "Tìm ba ban tổ chức",
      owner: "Thu",
      roles: { 0: 0, 14: 2 },
      level: 2,
    };
    expect(readMeeting(JSON.stringify(meeting))).toEqual(meeting);
  });
  it("recovers damaged, missing and primitive storage", () => {
    for (const raw of [null, "{", "null", "42", '"text"'])
      expect(readMeeting(raw)).toEqual(emptyMeeting());
  });
  it("rejects out-of-range roles and limits untrusted notes", () => {
    const result = readMeeting(
      JSON.stringify({
        roles: { 0: 3, 1: -1, 2: 1, 15: 0 },
        level: 8,
        owner: "Someone else",
        experiment: "a".repeat(4000),
      }),
    );
    expect(result.roles).toEqual({ 2: 1 });
    expect(result.level).toBeNull();
    expect(result.owner).toBe("");
    expect(result.experiment).toHaveLength(3000);
  });
});
describe("bilingual meeting coverage", () => {
  it("has matching keys and all selectable roles and decisions", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
    for (const copy of [en, vi]) {
      expect(copy.roles).toHaveLength(15);
      expect(copy.fields).toHaveLength(7);
      expect(copy.choices).toHaveLength(3);
      expect(copy.levels).toHaveLength(6);
    }
    for (const key of Object.keys(en) as (keyof typeof en)[])
      if (Array.isArray(en[key])) expect(vi[key]).toHaveLength(en[key].length);
  });
});
