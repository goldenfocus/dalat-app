/**
 * Test data for karaoke development
 *
 * Use this to test the karaoke UI before the backend pipeline is ready.
 */

/**
 * Sample Vietnamese lyrics in LRC format.
 * A simple greeting/introduction suitable for testing sync.
 */
export const TEST_LRC_VIETNAMESE = `[ti:Chào Đà Lạt]
[ar:Test Artist]
[al:Test Album]
[la:vi]

[00:00.00]Xin chào các bạn
[00:03.50]Chào mừng đến với Đà Lạt
[00:07.20]Thành phố ngàn hoa
[00:10.80]Nơi tình yêu bắt đầu
[00:14.50]Với những đồi thông xanh mướt
[00:18.30]Và sương mù buổi sáng
[00:22.00]Hãy cùng khám phá
[00:25.50]Những điều tuyệt vời
[00:29.20]Của thành phố mộng mơ
[00:33.00]Đà Lạt ơi, tôi yêu em`;

/**
 * Sample lyrics with word-level timing (simulating Whisper output).
 * Each line has word timestamps for word-by-word highlighting.
 */
export const TEST_LRC_WITH_WORDS = {
  lines: [
    {
      time: 0,
      text: "Xin chào các bạn",
      words: [
        { text: "Xin", startTime: 0, endTime: 0.8 },
        { text: "chào", startTime: 0.8, endTime: 1.5 },
        { text: "các", startTime: 1.5, endTime: 2.2 },
        { text: "bạn", startTime: 2.2, endTime: 3.0 },
      ],
    },
    {
      time: 3.5,
      text: "Chào mừng đến với Đà Lạt",
      words: [
        { text: "Chào", startTime: 3.5, endTime: 4.0 },
        { text: "mừng", startTime: 4.0, endTime: 4.5 },
        { text: "đến", startTime: 4.5, endTime: 5.0 },
        { text: "với", startTime: 5.0, endTime: 5.5 },
        { text: "Đà", startTime: 5.5, endTime: 6.0 },
        { text: "Lạt", startTime: 6.0, endTime: 7.0 },
      ],
    },
    {
      time: 7.2,
      text: "Thành phố ngàn hoa",
      words: [
        { text: "Thành", startTime: 7.2, endTime: 7.8 },
        { text: "phố", startTime: 7.8, endTime: 8.4 },
        { text: "ngàn", startTime: 8.4, endTime: 9.2 },
        { text: "hoa", startTime: 9.2, endTime: 10.5 },
      ],
    },
    {
      time: 10.8,
      text: "Nơi tình yêu bắt đầu",
      words: [
        { text: "Nơi", startTime: 10.8, endTime: 11.3 },
        { text: "tình", startTime: 11.3, endTime: 11.8 },
        { text: "yêu", startTime: 11.8, endTime: 12.4 },
        { text: "bắt", startTime: 12.4, endTime: 13.0 },
        { text: "đầu", startTime: 13.0, endTime: 14.2 },
      ],
    },
    {
      time: 14.5,
      text: "Với những đồi thông xanh mướt",
      words: [
        { text: "Với", startTime: 14.5, endTime: 15.0 },
        { text: "những", startTime: 15.0, endTime: 15.5 },
        { text: "đồi", startTime: 15.5, endTime: 16.0 },
        { text: "thông", startTime: 16.0, endTime: 16.6 },
        { text: "xanh", startTime: 16.6, endTime: 17.2 },
        { text: "mướt", startTime: 17.2, endTime: 18.0 },
      ],
    },
  ],
  syncLevel: "word" as const,
  metadata: {
    title: "Chào Đà Lạt",
    artist: "Test Artist",
    language: "vi",
    duration: 35,
  },
};

/**
 * Translations for the test lyrics.
 * Map of line text to English translation.
 */
export const TEST_TRANSLATIONS: Record<string, string> = {
  "Xin chào các bạn": "Hello everyone",
  "Chào mừng đến với Đà Lạt": "Welcome to Da Lat",
  "Thành phố ngàn hoa": "The city of a thousand flowers",
  "Nơi tình yêu bắt đầu": "Where love begins",
  "Với những đồi thông xanh mướt": "With lush green pine hills",
  "Và sương mù buổi sáng": "And morning mist",
  "Hãy cùng khám phá": "Let's explore together",
  "Những điều tuyệt vời": "The wonderful things",
  "Của thành phố mộng mơ": "Of this dreamy city",
  "Đà Lạt ơi, tôi yêu em": "Da Lat, I love you",
};

/**
 * Helper function to get translation for a line.
 */
export function getTranslation(text: string): string | undefined {
  return TEST_TRANSLATIONS[text];
}
