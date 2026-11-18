/**
 * Table cards for the language exchange: read aloud together, no microphone.
 * The sentences are bilingual learning content, not interface copy, so they
 * stay here in both languages instead of the UI translation catalogs.
 */
export const CARD_LEVELS = [1, 2, 3] as const;
export type CardLevel = typeof CARD_LEVELS[number];
export type PracticeCard = { id: string; level: CardLevel; vi: string; en: string };

const deck = (level: CardLevel, cards: [vi: string, en: string][]): PracticeCard[] =>
  cards.map(([vi, en], index) => ({ id: `l${level}-${index + 1}`, level, vi, en }));

export const PRACTICE_CARDS: PracticeCard[] = [
  ...deck(1, [
    ["Xin chào!", "Hello"],
    ["cà phê", "coffee"],
    ["giúp", "help"],
    ["ngày mai", "Tomorrow"],
    ["Quán cà phê", "Café"],
  ]),
  ...deck(2, [
    ["Bạn giúp tôi được không?", "Could you help me?"],
    ["Ngày mai mình gặp nhau nhé.", "Let's meet tomorrow."],
    ["Chúng ta nên đi bây giờ.", "We should leave now."],
    ["Bạn phải đội mũ bảo hiểm.", "You must wear a helmet."],
    ["Tôi muốn thử món này.", "I would like to try this."],
    ["Tôi sẽ gọi bạn sau.", "I will call you later."],
  ]),
  ...deck(3, [
    ["Chúng tôi định đi Đà Lạt.", "We plan to visit Da Lat."],
    ["Tôi không tìm được quán cà phê.", "I couldn't find the café."],
    ["Tôi quyết định gọi cho bạn tôi.", "I decided to call my friend."],
    ["Chúng tôi muốn ngồi bên ngoài.", "We wanted to sit outside."],
    ["Lần sau chúng ta có thể đi cùng nhau.", "Next time, we can go together."],
  ]),
];

export function cardsForLevel(level: CardLevel): PracticeCard[] {
  return PRACTICE_CARDS.filter(card => card.level === level);
}

/** Same seed, same first card; neighbouring tables tend to start somewhere else. */
export function cardStartOffset(seed: number, length: number): number {
  if (!Number.isInteger(length) || length <= 0) return 0;
  const value = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return value % length;
}

/** Use the current player's self-reported level for each turn. */
export function startingCardLevel(learningLevel?: string | null): CardLevel {
  return learningLevel === "fluent" || learningLevel === "native" ? 3 : learningLevel === "intermediate" ? 2 : 1;
}

/** Rotate speakers, choose a partner who speaks their target language, and adapt every turn. */
export function tableTurn(people: import("./model").Person[], step: number, seed = 0) {
  const index = Math.max(0, Math.trunc(step));
  const speaker = people.length ? people[index % people.length] : undefined;
  const others = people.filter(person => person.id !== speaker?.id);
  const partner = others.find(person => !!speaker?.learns && person.speaks.includes(speaker.learns)) || others[0];
  const level = startingCardLevel(speaker?.learningLevel);
  const cards = cardsForLevel(level);
  const lap = Math.floor(index / Math.max(1, people.length));
  const card = cards[(cardStartOffset(seed + level, cards.length) + lap) % cards.length];
  return { speaker, partner, card, level };
}
