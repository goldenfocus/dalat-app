import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { tableTurn } from "@/lib/practice/cards";
import type { Person } from "@/lib/practice/model";
function tr(key: string, args: Record<string, unknown> = {}) { return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), (en.eventPractice as Record<string, string>)[key] ?? key); }
vi.mock("next-intl", () => ({ useTranslations: () => tr }));
import { PracticeCards } from "./practice-cards";
const people: Person[] = [
  { id: "sam", name: "Sam", speaks: ["en"], learns: "vi", learningLevel: "beginner" },
  { id: "an", name: "An", speaks: ["vi"], learns: "en", learningLevel: "fluent" },
];
const play = vi.fn().mockResolvedValue(undefined), pause = vi.fn();
beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  play.mockClear(); pause.mockClear();
  vi.stubGlobal("Audio", vi.fn(function (this: Record<string, unknown>, src: string) { this.src = src; this.play = play; this.pause = pause; }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("shared phone game", () => {
  it("shows just the two players and bilingual text with play buttons; no level or mission controls", () => {
    const { container } = render(<PracticeCards people={people} seed={125} />);
    const { card } = tableTurn(people, 0, 125);
    expect(screen.getByText("Sam")).toBeVisible(); expect(screen.getByText("An")).toBeVisible();
    expect(screen.getByText(card.vi)).toHaveAttribute("lang", "vi");
    expect(screen.getByText(card.en)).toHaveAttribute("lang", "en");
    expect(screen.getByRole("button", { name: tr("playAudio", { text: card.vi }) })).toBeVisible();
    expect(container.querySelector("select, summary, input")).toBeNull();
    expect(screen.queryByText(/Mission|Café Chaos|Your turn/)).toBeNull();
  });
  it("changes speaker, partner, and difficulty together and can return to the previous turn", () => {
    render(<PracticeCards people={people} />);
    expect(screen.getByLabelText(tr("turnPlayer", { name: "Sam" }))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: tr("cardsNext") }));
    expect(screen.getByLabelText(tr("turnPlayer", { name: "An" }))).toBeVisible();
    expect(screen.getByText(tableTurn(people, 1).card.vi)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: tr("cardsPrevious") }));
    expect(screen.getByText(tableTurn(people, 0).card.vi)).toBeVisible();
    expect(screen.getByRole("button", { name: tr("cardsPrevious") })).toBeDisabled();
  });
  it("plays the exact displayed recording, stops before the next turn, and resumes after reload", async () => {
    const { unmount } = render(<PracticeCards people={people} seed={5} storageKey="test-table" />);
    const { card } = tableTurn(people, 0, 5);
    fireEvent.click(screen.getByRole("button", { name: tr("playAudio", { text: card.vi }) }));
    expect(play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: tr("cardsNext") }));
    expect(pause).toHaveBeenCalledOnce();
    await waitFor(() => expect(localStorage.getItem("test-table")).toBe("1"));
    unmount(); render(<PracticeCards people={people} seed={5} storageKey="test-table" />);
    expect(screen.getByLabelText(tr("turnPlayer", { name: "An" }))).toBeVisible();
  });
});
