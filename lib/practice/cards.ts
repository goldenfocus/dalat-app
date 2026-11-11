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
  // Level 1: greetings and survival phrases.
  ...deck(1, [
    ["Xin chào!", "Hello!"],
    ["Bạn tên là gì?", "What is your name?"],
    ["Tôi tên là …", "My name is …"],
    ["Rất vui được gặp bạn.", "Nice to meet you."],
    ["Bạn khỏe không?", "How are you?"],
    ["Tôi khỏe, cảm ơn bạn.", "I'm fine, thank you."],
    ["Xin lỗi.", "Sorry. / Excuse me."],
    ["Không sao đâu.", "It's okay. / No problem."],
    ["Bạn đến từ đâu?", "Where are you from?"],
    ["Tôi không hiểu.", "I don't understand."],
    ["Bạn nói chậm lại được không?", "Could you speak more slowly?"],
    ["Hẹn gặp lại!", "See you again!"],
  ]),
  // Level 2: short everyday sentences.
  ...deck(2, [
    ["Cho tôi một ly cà phê sữa đá.", "One iced milk coffee, please."],
    ["Cái này bao nhiêu tiền?", "How much is this?"],
    ["Nhà vệ sinh ở đâu?", "Where is the restroom?"],
    ["Bạn sống ở Đà Lạt bao lâu rồi?", "How long have you lived in Da Lat?"],
    ["Hôm nay trời lạnh quá!", "It's so cold today!"],
    ["Tôi đang học tiếng Việt.", "I'm learning Vietnamese."],
    ["Bạn làm nghề gì?", "What do you do for work?"],
    ["Tôi thích cà phê Đà Lạt.", "I like Da Lat coffee."],
    ["Chợ Đà Lạt cách đây bao xa?", "How far is Da Lat market from here?"],
    ["Đi thẳng rồi rẽ trái.", "Go straight, then turn left."],
    ["Tính tiền giúp tôi nhé.", "The bill, please."],
    ["Tôi ăn chay.", "I'm vegetarian."],
  ]),
  // Level 3: longer conversation starters and opinion questions.
  ...deck(3, [
    ["Bạn thích điều gì nhất ở Đà Lạt?", "What do you like most about Da Lat?"],
    ["Cuối tuần này bạn định làm gì?", "What are you planning to do this weekend?"],
    ["Tại sao bạn muốn học tiếng Anh?", "Why do you want to learn English?"],
    ["Món ăn Việt Nam nào bạn thích nhất?", "Which Vietnamese dish do you like best?"],
    ["Bạn có thể giới thiệu một quán cà phê yên tĩnh không?", "Can you recommend a quiet café?"],
    ["Theo bạn, học một ngôn ngữ mới khó nhất ở điểm nào?", "In your opinion, what is the hardest part of learning a new language?"],
    ["Nếu được đi du lịch bất cứ đâu, bạn sẽ đi đâu?", "If you could travel anywhere, where would you go?"],
    ["Hãy kể cho tôi nghe về quê của bạn.", "Tell me about your hometown."],
    ["Lần đầu đến Đà Lạt, bạn ấn tượng điều gì nhất?", "What impressed you most the first time you came to Da Lat?"],
    ["Bạn thường làm gì vào buổi tối?", "What do you usually do in the evening?"],
    ["Tôi nghĩ thời tiết Đà Lạt rất dễ chịu, còn bạn thì sao?", "I think the weather in Da Lat is very pleasant. What about you?"],
    ["Bạn có lời khuyên nào cho người mới học tiếng Việt không?", "Do you have any advice for someone who has just started learning Vietnamese?"],
  ]),
];

export function cardsForLevel(level: CardLevel): PracticeCard[] {
  return PRACTICE_CARDS.filter(card => card.level === level);
}

/** Same seed, same first card; neighbouring tables tend to start somewhere else. */
export function cardStartOffset(seed: number, length: number): number {
  if (!Number.isInteger(length) || length <= 0) return 0;
  const value = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return (Math.imul(value + 1, 2654435761) >>> 0) % length;
}

/** A self-reported learning level only picks the opening deck; the table can change it. */
export function startingCardLevel(learningLevel?: string | null): CardLevel {
  return learningLevel === "fluent" || learningLevel === "native" ? 3 : learningLevel === "intermediate" ? 2 : 1;
}
