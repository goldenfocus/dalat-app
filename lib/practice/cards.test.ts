import { describe, expect, it } from "vitest";
import { CARD_LEVELS, PRACTICE_CARDS, cardsForLevel, cardStartOffset, startingCardLevel } from "./cards";

describe("practice cards", () => {
  it("offers a full bilingual deck at every level", () => {
    expect(new Set(PRACTICE_CARDS.map(card => card.id)).size).toBe(PRACTICE_CARDS.length);
    for (const level of CARD_LEVELS) {
      const cards = cardsForLevel(level);
      expect(cards.length).toBeGreaterThanOrEqual(12);
      for (const card of cards) {
        expect(card.level).toBe(level);
        expect(card.vi.trim()).toBe(card.vi);
        expect(card.en.trim()).toBe(card.en);
        expect(card.vi.length).toBeGreaterThan(2);
        expect(card.en.length).toBeGreaterThan(2);
        expect(card.vi).toBe(card.vi.normalize("NFC"));
      }
    }
    expect(new Set(PRACTICE_CARDS.map(card => card.vi)).size).toBe(PRACTICE_CARDS.length);
  });
  it("gets longer as the level rises", () => {
    const average = (level: 1 | 2 | 3) => cardsForLevel(level).reduce((sum, card) => sum + card.vi.length, 0) / cardsForLevel(level).length;
    expect(average(1)).toBeLessThan(average(2));
    expect(average(2)).toBeLessThan(average(3));
  });
  it("picks a stable, in-range start that differs between neighbouring tables", () => {
    for (let seed = -3; seed < 400; seed++) {
      const offset = cardStartOffset(seed, 12);
      expect(Number.isInteger(offset)).toBe(true);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(12);
      expect(cardStartOffset(seed, 12)).toBe(offset);
    }
    // Seeds are table * 31 + round: neighbours in the same round must not all share a card.
    const starts = [1, 2, 3, 4, 6, 7, 13, 14].map(table => cardStartOffset(table * 31 + 1, 12));
    expect(new Set(starts).size).toBeGreaterThanOrEqual(5);
    expect(cardStartOffset(4 * 31 + 1, 12)).not.toBe(cardStartOffset(4 * 31 + 2, 12));
    expect(cardStartOffset(Number.NaN, 12)).toBe(cardStartOffset(0, 12));
    expect(cardStartOffset(5, 0)).toBe(0);
  });
  it("opens on an easy deck unless the learner reported more experience", () => {
    expect(startingCardLevel(undefined)).toBe(1);
    expect(startingCardLevel(null)).toBe(1);
    expect(startingCardLevel("new")).toBe(1);
    expect(startingCardLevel("beginner")).toBe(1);
    expect(startingCardLevel("intermediate")).toBe(2);
    expect(startingCardLevel("fluent")).toBe(3);
  });
});
