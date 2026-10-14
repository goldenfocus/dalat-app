package main

import (
	"regexp"
	"strings"
	"unicode"
)

// greetingRe matches salutation lines ("Hey everyone!", "Hi all", "Xin chào",
// "Chào mọi người 👋") that open a post but are never the event name.
var greetingRe = regexp.MustCompile(`(?i)^(hey|hi|hello|hiya|howdy|greetings|good (morning|afternoon|evening)|dear|xin chào|xin chao|chào|chao|kính chào|alo|yo)\b[\s,!.]*((?:\p{L}+\s+){0,2}(every(one|body)|all|y'?all|guys|folks|friends|fam|family|lovely people|people|community|team|mọi người|moi nguoi|cả nhà|ca nha|các bạn|cac ban|bạn|ban|nhé|nhe)\b)?[\s,!.]*(of [\p{L} ]{0,30})?[\s!.,]*$`)

// isGreeting reports a salutation-only line, emoji ignored.
func isGreeting(line string) bool {
	core := strings.TrimSpace(stripEmoji(line))
	core = strings.TrimFunc(core, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsPunct(r) && r != '\'' })
	if core == "" {
		return false
	}
	return greetingRe.MatchString(core)
}

// eventNouns mark a line (or phrase) that names the event itself.
var eventNouns = `workshop|class|classes|night|festival|concert|party|session|show|meetup|meet-up|market|fair|tour|retreat|jam|exhibition|screening|talk|seminar|course|lesson|performance|gig|open mic|quiz|tournament|yoga|ceremony|celebration|đêm nhạc|lễ hội|hội chợ|triển lãm|lớp học|buổi`

var eventNounRe = regexp.MustCompile(`(?i)(^|[^\p{L}])(` + eventNouns + `)([^\p{L}]|$)`)

// eventPhraseRe pulls a capitalised name ending in an event noun out of a
// sentence: "Matt and I are hosting a Kids’ Dance Workshop tonight" → "Kids’ Dance Workshop".
var eventPhraseRe = regexp.MustCompile(`((?:\p{Lu}[\p{L}’'&.-]*\s+){1,5}(?i:` + eventNouns + `))\b`)

func hasEventNoun(line string) bool { return eventNounRe.MatchString(line) }

// promoCues are sentence openers and phrases that mark caption copy as
// promotional chatter rather than an event name.
var promoCues = []string{
	"bring your", "order another", "make your night", "make a night of it",
	"don't miss", "dont miss", "do not miss", "join us", "come and", "come join",
	"come along", "grab your", "treat yourself", "see you there", "see you",
	"tag your", "who's coming", "who is coming", "ready for", "are you ready",
	"let's", "lets ", "you won't want", "you wont want", "your favourite", "your favorite",
	"đừng bỏ lỡ", "hãy đến", "cùng nhau", "rủ ngay", "còn chờ gì",
}

// letterShare is the share of non-space runes that are letters or digits.
func letterShare(line string) float64 {
	total, letters := 0, 0
	for _, r := range line {
		if unicode.IsSpace(r) {
			continue
		}
		total++
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			letters++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(letters) / float64(total)
}

// isFluffTitle reports a caption line that should not be an event title:
// mostly emoji/symbols, or a promotional sentence ("Bring your favourite
// people, order another round and make your night of it!").
func isFluffTitle(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" {
		return true
	}
	if letterShare(line) < 0.6 || isGreeting(line) {
		return true
	}
	core := strings.TrimSpace(stripEmoji(line))
	low := strings.ToLower(core)
	for _, cue := range promoCues {
		if strings.Contains(low, cue) {
			return true
		}
	}
	words := len(strings.Fields(core))
	// A long sentence with a comma and an exclamation reads as copy, not a name.
	if words >= 10 && strings.Contains(core, ",") && strings.ContainsAny(core, "!?") {
		return true
	}
	return false
}

// flyerHeadline is the first plausible title line of the flyer's readable text.
func flyerHeadline(readable string) string {
	for line := range strings.Lines(readable) {
		line = strings.TrimSpace(line)
		if line == "" || isDateOrTimeOnly(line) || isFluffTitle(line) {
			continue
		}
		if len([]rune(line)) < 4 {
			continue
		}
		if len(line) > 100 {
			line = strings.TrimSpace(line[:100])
		}
		return line
	}
	return ""
}

// firstSubstantiveLine is firstLine but skips emoji/promo fluff lines.
func firstSubstantiveLine(text string) string {
	for line := range strings.Lines(text) {
		line = strings.TrimSpace(line)
		if line == "" || isDateOrTimeOnly(line) || isFluffTitle(line) {
			continue
		}
		if len(line) > 100 {
			line = strings.TrimSpace(line[:100])
		}
		return line
	}
	return ""
}

// chooseTitle picks the event title. The caption's first line wins unless it
// is fluff; then the flyer's headline (model title, else first readable line)
// wins, then the next substantive caption line, then the fluff line itself.
func chooseTitle(caption, llmTitle, readable string, flyer bool) string {
	first := firstLine(caption)
	llmTitle = strings.TrimSpace(llmTitle)
	if flyer && llmTitle != "" && !isFluffTitle(llmTitle) {
		return llmTitle
	}
	if first != "" && !isFluffTitle(first) {
		return first
	}
	if flyer {
		if h := flyerHeadline(readable); h != "" {
			return h
		}
	}
	if s := heuristicTitle(caption); s != "" {
		return s
	}
	if llmTitle != "" {
		return llmTitle
	}
	return first
}

// heuristicTitle picks a title from caption text alone (no vision). It skips
// greeting, promo and emoji lines; prefers a short line naming the event
// ("Move, Play & Dance Workshop"), then a capitalised event phrase inside a
// sentence ("Kids’ Dance Workshop"), then the first substantive line.
func heuristicTitle(text string) string {
	var lines []string
	for line := range strings.Lines(text) {
		line = strings.TrimSpace(line)
		if line == "" || isDateOrTimeOnly(line) || isFluffTitle(line) {
			continue
		}
		lines = append(lines, line)
	}
	for _, line := range lines {
		clean := strings.TrimSpace(trimLeadingSymbols(stripEmoji(line)))
		if hasEventNoun(clean) && len(strings.Fields(clean)) <= 8 && !strings.ContainsAny(clean, "📅⏰📍") {
			return clean
		}
	}
	// Phrase search also covers promo sentences: the name often sits inside one.
	for line := range strings.Lines(text) {
		if isGreeting(line) {
			continue
		}
		if m := eventPhraseRe.FindStringSubmatch(stripEmoji(line)); m != nil {
			phrase := strings.TrimSpace(m[1])
			if len(strings.Fields(phrase)) >= 2 {
				return phrase
			}
		}
	}
	if len(lines) > 0 {
		l := lines[0]
		if len(l) > 100 {
			l = strings.TrimSpace(l[:100])
		}
		return l
	}
	return ""
}
