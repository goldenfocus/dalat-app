import { it, expect } from "vitest";
import { needsPeopleReminder } from "./sensitive-media";
it("targets event/people context instead of every restaurant photo", () => {
  expect(needsPeopleReminder("University club gathering with students")).toBe(
    true,
  );
  expect(needsPeopleReminder("A room full of people")).toBe(true);
  expect(needsPeopleReminder("Một sự kiện sinh viên")).toBe(true);
  expect(needsPeopleReminder("Soup and a vegetarian menu")).toBe(false);
});
