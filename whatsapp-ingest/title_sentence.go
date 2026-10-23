package main

import (
	"regexp"
	"strings"
)

// chatClauseCues are phrases that only occur in chat sentences, never in an
// event name: "Sunday is coming soon, which means it's time to …",
// "Looking forward to seeing everyone tomorrow!".
var chatClauseCues = []string{
	"which means", "it's time", "it is time", "coming soon", "don't miss", "dont miss",
	"do not miss", "join us", "see you", "thank you", "thanks for", "looking forward",
	"can't wait", "cant wait", "we'll", "we will", "i'll", "i will", "i'd", "i'm ",
	"we're", "hope to", "hope you", "dm me", "message me", "let us know",
}

var (
	pronounRe   = regexp.MustCompile(`(^|[^\p{L}'])(i|we|us|you|my|our|your|it's|they|everyone)([^\p{L}']|$)`)
	weekdayIsRe = regexp.MustCompile(`(?i)^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|this weekend|the weekend)('s|\s+is)\b`)
	// Words a title never ends on: a sentence was cut ("… to rustle some").
	danglingEnd = map[string]bool{
		"and": true, "or": true, "but": true, "so": true, "to": true, "some": true, "the": true,
		"a": true, "an": true, "of": true, "with": true, "for": true, "which": true, "that": true,
		"because": true, "if": true, "my": true, "your": true, "our": true, "their": true,
		"is": true, "are": true, "will": true, "was": true, "were": true, "be": true, "it": true,
		"we": true, "you": true, "i": true, "very": true, "really": true, "as": true, "than": true,
		"và": true, "hoặc": true, "nhưng": true, "của": true, "để": true, "với": true,
	}
)

// isChatSentenceTitle reports a line that reads as chat copy rather than an
// event name. Such a line must never become a title.
func isChatSentenceTitle(line string) bool {
	core := strings.TrimSpace(trimLeadingSymbols(stripEmoji(cleanLine(line))))
	if core == "" {
		return false
	}
	low := strings.ToLower(strings.NewReplacer("’", "'", "‘", "'").Replace(core))
	for _, cue := range chatClauseCues {
		if strings.Contains(low, cue) {
			return true
		}
	}
	if weekdayIsRe.MatchString(low) {
		return true
	}
	words := strings.Fields(core)
	limit := 8
	if detectLocale(core) == "vi" {
		limit = 14 // Vietnamese words are syllables
	}
	// A long line is a sentence when it reads like one: sentence punctuation
	// or a personal pronoun, and no title separators ("Live in Dalat | 24.10").
	if len(words) > limit && !strings.ContainsAny(core, "|:–—") &&
		(strings.ContainsAny(core, ",.!?;") || pronounRe.MatchString(low)) {
		return true
	}
	if strings.HasSuffix(core, ",") || strings.HasSuffix(core, ";") {
		return true
	}
	last := strings.ToLower(strings.Trim(words[len(words)-1], ".,;:!?'\"’…"))
	return len(words) >= 3 && danglingEnd[last]
}
