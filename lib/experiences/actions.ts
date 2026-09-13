// A discovery link is useful for a described gathering even when its broad
// category is Other. This never asserts public access or a future occurrence.
export function suggestsEventDiscovery(category: string, text: string) {
  return category === "culture" || /\b(event|gathering|concert|workshop|festival|club|meetup|rencontre|atelier|événement)\b|sự kiện|buổi gặp|câu lạc bộ|hội thảo/i.test(text);
}
