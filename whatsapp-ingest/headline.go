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
		line = cleanLine(line)
		if skipTitleLine(line) || len([]rune(line)) < 4 {
			continue
		}
		return truncateTitle(line, 100)
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

const shortTitle = 60

var invisibleRe = regexp.MustCompile("[\u200b\u200c\u200d\u2060\ufeff\u00ad]")

// cleanLine strips zero-width characters WhatsApp/Telegram copy-paste leaves in.
func cleanLine(s string) string { return strings.TrimSpace(invisibleRe.ReplaceAllString(s, "")) }

// labelRe matches "Price: …", "When - …", "Giá: …", "Địa điểm: …" detail lines.
var labelRe = regexp.MustCompile(`(?i)^\s*(price|prices|time|times|when|where|date|dates|venue|location|address|entry|admission|fee|fees|cost|ticket|tickets|rsvp|contact|booking|register|registration|dress code|age|ages|giá|giá vé|vé|phí|thời gian|địa điểm|địa chỉ|ngày|giờ|liên hệ|đăng ký)\s*[:：–-]`)

func isLabelLine(line string) bool {
	return labelRe.MatchString(trimLeadingSymbols(stripEmoji(cleanLine(line))))
}

// truncateTitle cuts at a word boundary, never mid-word, and drops a dangling
// separator.
func truncateTitle(s string, max int) string {
	s = cleanLine(s)
	if len([]rune(s)) <= max {
		return s
	}
	r := []rune(s)[:max+1]
	cut := strings.LastIndexFunc(string(r), unicode.IsSpace)
	out := string(r)
	if cut > 0 {
		out = out[:cut]
	} else {
		out = string(r[:max])
	}
	return strings.TrimRightFunc(out, func(r rune) bool { return unicode.IsSpace(r) || strings.ContainsRune(",;:-–—·|/&(", r) })
}

// dateWordRe covers weekday/month names (en + vi) and clock words that,
// with digits and separators, make up a schedule line.
var dateWordRe = regexp.MustCompile(`(?i)(^|[^\p{L}])(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|am|pm|a\.m\.|p\.m\.|st|nd|rd|th|from|to|until|till|tonight|today|tomorrow|thứ|chủ nhật|cn|hai|ba|tư|năm|sáu|bảy|tháng|ngày|giờ|lúc|đến|sáng|chiều|tối|h)([^\p{L}]|$)`)

// isDateLine: a line made only of dates, times, weekday/month names and
// separators ("📅 Sunday, October 25 | 10:00–11:30 AM"). Never a title.
func isDateLine(line string) bool {
	core := cleanLine(stripEmoji(line))
	if core == "" || !strings.ContainsFunc(core, unicode.IsDigit) && !dateWordRe.MatchString(core) {
		return false
	}
	rest := core
	for i := 0; i < 3; i++ { // adjacent words share a boundary rune
		rest = dateWordRe.ReplaceAllString(rest, "$1 $3")
	}
	rest = strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) || unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) {
			return -1
		}
		return r
	}, rest)
	return rest == ""
}

func isSentence(line string) bool {
	core := cleanLine(stripEmoji(line))
	// A Title-Case heading with a colon or commas is still a heading.
	if !strings.ContainsAny(core, ".!?") && len([]rune(core)) <= 90 && isHeadlineCase(core) {
		return false
	}
	if len([]rune(core)) > shortTitle {
		return true
	}
	return len(strings.Fields(core)) >= 7 && strings.ContainsAny(core, ".?!,")
}

// isHeadlineCase: ALL CAPS ("THURSDAY GAME NIGHT") or Title Case ("Weekend Sketch Club").
func isHeadlineCase(line string) bool {
	words := strings.Fields(line)
	if len(words) == 0 || len(words) > 12 {
		return false
	}
	letters, upper, capWords, lexical := 0, 0, 0, 0
	small := map[string]bool{"a": true, "an": true, "the": true, "and": true, "of": true, "at": true, "in": true, "on": true, "for": true, "with": true, "to": true, "&": true, "x": true, "by": true}
	for _, w := range words {
		rs := []rune(w)
		first := -1
		for i, r := range rs {
			if unicode.IsLetter(r) {
				letters++
				if unicode.IsUpper(r) {
					upper++
				}
				if first < 0 {
					first = i
				}
			}
		}
		if first < 0 {
			continue
		}
		if small[strings.ToLower(w)] {
			continue
		}
		lexical++
		if unicode.IsUpper(rs[first]) {
			capWords++
		}
	}
	if letters == 0 || lexical == 0 {
		return false
	}
	if float64(upper)/float64(letters) > 0.8 {
		return true
	}
	return lexical >= 2 && capWords == lexical
}

func skipTitleLine(line string) bool {
	return line == "" || isDateOrTimeOnly(line) || isDateLine(line) || isLabelLine(line) || isFluffTitle(line) || isFragmentTitle(line)
}

var fragmentLead = map[string]bool{
	"the": true, "a": true, "an": true, "this": true, "that": true, "these": true, "those": true,
	"it": true, "its": true, "he": true, "she": true, "they": true, "we": true, "our": true,
	"you": true, "your": true, "his": true, "her": true, "their": true, "my": true, "i": true,
	"there": true, "here": true, "which": true, "who": true,
}

// isFragmentTitle refuses "The performance", "It", "Our event": under three
// meaningful words led by an article or pronoun.
func isFragmentTitle(line string) bool {
	words := strings.Fields(strings.TrimSpace(trimLeadingSymbols(stripEmoji(cleanLine(line)))))
	if len(words) == 0 {
		return false
	}
	if !fragmentLead[strings.ToLower(strings.Trim(words[0], ".,:;!?'’\""))] {
		return false
	}
	// "The Symbiotic Circle: …" is a heading, not a fragment.
	if strings.Contains(strings.Join(words, " "), ":") {
		return false
	}
	meaningful := 0
	for _, w := range words {
		w = strings.ToLower(strings.Trim(w, ".,:;!?'’\""))
		if w == "" || fragmentLead[w] {
			continue
		}
		meaningful++
	}
	return meaningful < 3
}

// chooseTitle picks the event title: the flyer's own title/headline first,
// then a short caption first line, then the caption heuristics.
func chooseTitle(caption, llmTitle, readable string, flyer bool) string {
	llmTitle = cleanLine(llmTitle)
	if flyer && llmTitle != "" && !isFluffTitle(llmTitle) && !isLabelLine(llmTitle) && !isFragmentTitle(llmTitle) {
		return truncateTitle(llmTitle, 100)
	}
	if flyer {
		if h := flyerHeadline(readable); h != "" {
			return h
		}
	}
	first := cleanLine(firstLine(caption))
	if first != "" && !skipTitleLine(first) && !isSentence(first) {
		return truncateTitle(strings.TrimSpace(stripEmoji(first)), 100)
	}
	if s := heuristicTitle(caption); s != "" {
		return s
	}
	if llmTitle != "" {
		return truncateTitle(llmTitle, 100)
	}
	return truncateTitle(first, shortTitle)
}

// heuristicTitle picks a title from caption text alone (no vision), skipping
// greeting, promo, emoji and label lines. Preference: a short line naming
// the event; a capitalised event phrase inside a sentence ("Kids’ Dance
// Workshop"); a short ALL-CAPS / Title-Case line; any short line; then the first
// substantive line cut at a word boundary.
func heuristicTitle(text string) string {
	var lines []string
	for line := range strings.Lines(text) {
		line = cleanLine(line)
		if skipTitleLine(line) {
			continue
		}
		lines = append(lines, strings.TrimSpace(trimLeadingSymbols(stripEmoji(line))))
	}
	for _, l := range lines {
		if hasEventNoun(l) && !isSentence(l) && !strings.ContainsAny(l, "📅⏰📍") {
			return l
		}
	}
	for line := range strings.Lines(text) {
		line = cleanLine(line)
		if isGreeting(line) || isLabelLine(line) {
			continue
		}
		if m := eventPhraseRe.FindStringSubmatch(stripEmoji(line)); m != nil {
			phrase := strings.TrimSpace(m[1])
			if len(strings.Fields(phrase)) >= 2 && !isFragmentTitle(phrase) {
				return phrase
			}
		}
	}
	for _, l := range lines {
		if !isSentence(l) && isHeadlineCase(l) {
			return l
		}
	}
	for _, l := range lines {
		if !isSentence(l) && len(strings.Fields(l)) >= 2 {
			return l
		}
	}
	if len(lines) > 0 {
		return truncateTitle(lines[0], shortTitle)
	}
	return ""
}

// detectLocale guesses the post's language from its text: Vietnamese when
// Vietnamese-only letters/diacritics make up a meaningful share, else English.
func detectLocale(text string) string {
	text = stripCommunity(text)
	letters, vi := 0, 0
	for _, r := range text {
		if !unicode.IsLetter(r) {
			continue
		}
		letters++
		if strings.ContainsRune("ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ", r) {
			vi++
		}
	}
	if letters == 0 {
		return "vi"
	}
	// Vietnamese prose runs ~20–40% marked letters; an English post that names
	// "Đà Lạt" or a venue stays below 15%.
	if float64(vi)/float64(letters) >= 0.15 {
		return "vi"
	}
	return "en"
}
