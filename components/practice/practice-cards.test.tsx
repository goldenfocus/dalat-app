import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { cardsForLevel, cardStartOffset } from "@/lib/practice/cards";
// Falls back to the key so new strings resolve before and after the catalogs are merged.
function tr(key: string, args: Record<string, unknown> = {}) { return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), (en.eventPractice as Record<string, string>)[key] ?? key); }
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, args: Record<string, unknown> = {}) => tr(key, args) }));
import { PracticeCards } from "./practice-cards";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const cardAt = (level: 1 | 2 | 3, seed: number, step: number) => { const cards = cardsForLevel(level); return cards[(cardStartOffset(seed + level, cards.length) + step) % cards.length]; };

describe("practice table cards", () => {
  it("shows one bilingual card with semantic language tags and no network or microphone use", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PracticeCards seed={125} />);
    const card = cardAt(1, 125, 0);
    expect(screen.getByRole("heading", { name: tr("cardsTitle") })).toBeVisible();
    expect(screen.getByText(tr("cardsHint"))).toBeVisible();
    expect(screen.queryByText("Tiếng Việt")).toBeNull();
    expect(screen.queryByText("English")).toBeNull();
    expect(screen.getByText(card.vi)).toHaveAttribute("lang", "vi");
    expect(screen.getByText(card.en)).toHaveAttribute("lang", "en");
    expect(screen.getByText(tr("cardsCounter", { current: 1, total: 12 }))).toBeVisible();
    expect(container.querySelector("audio, video, input, a")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("moves forward and back through the deck and wraps around", () => {
    render(<PracticeCards seed={7} />);
    fireEvent.click(screen.getByRole("button", { name: tr("cardsNext") }));
    expect(screen.getByText(cardAt(1, 7, 1).vi)).toBeVisible();
    expect(screen.getByText(tr("cardsCounter", { current: 2, total: 12 }))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: tr("cardsPrevious") }));
    fireEvent.click(screen.getByRole("button", { name: tr("cardsPrevious") }));
    expect(screen.getByText(cardAt(1, 7, 11).vi)).toBeVisible();
    expect(screen.getByText(tr("cardsCounter", { current: 12, total: 12 }))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: tr("cardsNext") }));
    expect(screen.getByText(cardAt(1, 7, 0).vi)).toBeVisible();
  });
  it("steps between three levels and stops at both ends", () => {
    render(<PracticeCards seed={3} />);
    fireEvent.click(screen.getByText(tr("cardsLevel", { level: 1 })));
    const easier = screen.getByRole("button", { name: tr("cardsEasier") });
    const harder = screen.getByRole("button", { name: tr("cardsHarder") });
    expect(easier).toBeDisabled();
    expect(screen.getByText(tr("cardsLevel", { level: 1 }))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: tr("cardsNext") }));
    fireEvent.click(harder);
    expect(screen.getByText(tr("cardsLevel", { level: 2 }))).toBeVisible();
    expect(screen.getByText(cardAt(2, 3, 0).vi)).toBeVisible();
    expect(screen.getByText(tr("cardsCounter", { current: 1, total: 12 }))).toBeVisible();
    expect(easier).toBeEnabled();
    fireEvent.click(harder);
    expect(screen.getByText(cardAt(3, 3, 0).vi)).toBeVisible();
    expect(harder).toBeDisabled();
    fireEvent.click(easier);
    expect(screen.getByText(cardAt(2, 3, 0).vi)).toBeVisible();
  });
  it("can open on the level a learner reported", () => {
    render(<PracticeCards seed={0} initialLevel={3} />);
    expect(screen.getByText(cardAt(3, 0, 0).vi)).toBeVisible();
    fireEvent.click(screen.getByText(tr("cardsLevel", { level: 3 })));
    expect(screen.getByRole("button", { name: tr("cardsHarder") })).toBeDisabled();
  });
  it("keeps every control at a comfortable touch height", () => {
    render(<PracticeCards />);
    for (const button of screen.getAllByRole("button")) expect(button.className).toMatch(/min-h-(12|16)/);
  });
});
