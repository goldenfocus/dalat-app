package main

import (
	"strings"
	"unicode"
)

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
	if letterShare(line) < 0.6 {
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
	if s := firstSubstantiveLine(caption); s != "" {
		return s
	}
	if llmTitle != "" {
		return llmTitle
	}
	return first
}
