package main

import (
	"context"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// venueCandidate is a venue name and street address read from one source.
// Either field may be empty; nothing here is ever guessed from prose.
type venueCandidate struct {
	Name    string
	Address string
	Source  string // label, at, flyer, maps
}

var (
	leadingTheRe     = regexp.MustCompile(`(?i)^the\s+`)
	trailingFillerRe = regexp.MustCompile(`(?i)[\s,]+(tonight|today|tomorrow|everyone|guys|folks|please|pls|anyone|y'all|this|next|from|on|at|in)$`)
	// "Venue: …", "Location: …", "Địa điểm: …" with optional leading emoji/bullets.
	venueLabelRe   = regexp.MustCompile(`(?i)^(location|venue|địa điểm|dia diem|where|place|address|địa chỉ|dia chi)\s*[:：]\s*(.*)$`)
	houseNumberRe  = regexp.MustCompile(`^\d{1,4}[A-Za-z]?(?:/\d{1,4}[A-Za-z]?)*[,.]?\s+\S`)
	nameThenNumRe  = regexp.MustCompile(`^(.*?\p{L}.*?)[\s,–—-]+(\d{1,4}[A-Za-z]?(?:/\d{1,4}[A-Za-z]?)*[,.]?\s+\S.*)$`)
	ocrStreetDRe   = regexp.MustCompile(`^(\d{1,4}[A-Za-z]?(?:/\d{1,4}[A-Za-z]?)*)\s+D\.\s*`)
	postalTailRe   = regexp.MustCompile(`[\s,]+\d{5,6}$`)
	commaSpaceRe   = regexp.MustCompile(`\s*,\s*`)
	addressNoiseRe = regexp.MustCompile(`(?i)\b(vnd|usd|k|pax|people|persons?|guests?|seats?|reservations?|am|pm|minutes?|mins?|hours?|km|years?|stars?)\b`)
	streetCueRe    = regexp.MustCompile(`(?i)(^|\s)(đ\.|d\.|đường|duong|street|st\.?|road|rd\.?|hẻm|hem|kiệt|ngõ|phường|phuong|ward)(\s|$)`)
	// Words that only show up in sentences, never in a venue name.
	sentenceWordRe = regexp.MustCompile(`(?i)(^|\s)(we|you|i|our|your|that|which|have|has|had|is|are|was|were|will|can|could|should|would|remain|remains|there|their|they|me|my|let's|lets|join|come|anyone|who)(\s|$)`)
	// "at the Socialhouse", "tại Quảng trường Lâm Viên": a capitalised name
	// right after the preposition. Lower-case words end the name, so prose like
	// "look at several traditional forms" never becomes a venue.
	atVenueRe = regexp.MustCompile(`(?:^|[\s(,])(?:at|At|AT|tại|Tại|TẠI)\s+(?:(?:the|The|THE)\s+)?(\p{Lu}[\p{L}\p{N}'’&.\-]*(?:[ \t]+(?:\p{Lu}[\p{L}\p{N}'’&.\-]*|&|of|de|du|la|le|và))*)`)
)

// Capitalised words that end or disqualify an "at …" name.
var atStopWords = map[string]bool{
	"on": true, "in": true, "this": true, "next": true, "from": true, "every": true, "at": true,
	"tonight": true, "today": true, "tomorrow": true, "noon": true, "midnight": true, "night": true,
	"monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": true, "sunday": true,
	"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": true, "sun": true,
	"january": true, "february": true, "march": true, "april": true, "may": true, "june": true, "july": true,
	"august": true, "september": true, "october": true, "november": true, "december": true,
	"jan": true, "feb": true, "mar": true, "apr": true, "jun": true, "jul": true, "aug": true, "sep": true, "sept": true, "oct": true, "nov": true, "dec": true,
	"life": true, "home": true, "least": true, "first": true, "last": true, "all": true, "once": true,
}

// stripEmoji drops pictographs, dingbats, variation selectors and ZWJ.
func stripEmoji(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r == 0xFE0F || r == 0xFE0E || r == 0x200D || r == 0x20E3:
			return -1
		case r >= 0x1F000 && r <= 0x1FAFF, r >= 0x2600 && r <= 0x27BF, r >= 0x2B00 && r <= 0x2BFF, r >= 0x2190 && r <= 0x21FF:
			return -1
		case unicode.Is(unicode.So, r):
			return -1
		}
		return r
	}, s)
}

// normalizeVenueName strips emoji, a leading "the", trailing punctuation and
// filler, and calms an ALL-CAPS flyer name ("SOCIALHOUSE" -> "Socialhouse").
func normalizeVenueName(raw string) string {
	s := strings.Join(strings.Fields(stripEmoji(raw)), " ")
	for {
		prev := s
		s = strings.TrimLeft(s, "-–—•*·:|>~ \"'“”‘’[")
		s = strings.TrimRight(s, ".,;:!?-–—~*/|…\"'“”‘’ ]")
		s = leadingTheRe.ReplaceAllString(s, "")
		s = trailingFillerRe.ReplaceAllString(s, "")
		s = strings.TrimSpace(s)
		if s == prev {
			break
		}
	}
	if strings.Count(s, "(") > strings.Count(s, ")") {
		if i := strings.LastIndex(s, "("); i > 0 {
			s = strings.TrimSpace(s[:i])
		}
	}
	return calmShouting(s)
}

func calmShouting(s string) string {
	letters, lower := 0, 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
			if unicode.IsLower(r) {
				lower++
			}
		}
	}
	if letters < 4 || lower > 0 {
		return s
	}
	words := strings.Fields(s)
	for i, w := range words {
		if utf8.RuneCountInString(w) <= 2 {
			continue
		}
		rs := []rune(strings.ToLower(w))
		rs[0] = unicode.ToUpper(rs[0])
		words[i] = string(rs)
	}
	return strings.Join(words, " ")
}

// plausibleVenueName rejects description fragments, sentences, times and
// anything too long to be a place name.
func plausibleVenueName(name string) bool {
	name = strings.TrimSpace(name)
	if !publicVenue(name) {
		return false
	}
	n := utf8.RuneCountInString(name)
	if n < 2 || n > 60 || len(strings.Fields(name)) > 8 {
		return false
	}
	if strings.ContainsAny(name, ":?!\n") || strings.Count(name, ",") > 1 {
		return false
	}
	if sentenceWordRe.MatchString(name) || timeRe.MatchString(name) || dateRe.MatchString(name) {
		return false
	}
	return strings.IndexFunc(name, unicode.IsLetter) >= 0
}

// looksLikeStreetAddress accepts "184 Tô Ngọc Vân, Đà Lạt" or
// "305 Đ. Tô Ngọc Vân" and refuses prices, head counts, years and times.
func looksLikeStreetAddress(s string) bool {
	s = strings.TrimSpace(s)
	if !houseNumberRe.MatchString(s) {
		return false
	}
	fields := strings.Fields(s)
	if len(fields) < 2 {
		return false
	}
	num := strings.TrimRight(fields[0], ",.")
	if len(num) == 4 && (strings.HasPrefix(num, "19") || strings.HasPrefix(num, "20")) {
		return false
	}
	head := strings.Join(fields[1:min(4, len(fields))], " ")
	if addressNoiseRe.MatchString(head) || timeRe.MatchString(head) {
		return false
	}
	street := fields[1]
	if (strings.EqualFold(street, "Đ.") || strings.EqualFold(street, "D.")) && len(fields) > 2 {
		street = fields[2]
	}
	first, _ := utf8.DecodeRuneInString(street)
	if !unicode.IsUpper(first) {
		return false
	}
	return strings.Contains(s, ",") || streetCueRe.MatchString(s) ||
		mentionsLocality(s, "đà lạt", "da lat", "dalat", "lâm đồng", "lam dong")
}

// normalizeStreetAddress cleans an address copied from a caption, flyer or
// Maps link. The city and province are added later by ensureLocalityAddress.
func normalizeStreetAddress(raw string) string {
	s := strings.Join(strings.Fields(stripEmoji(raw)), " ")
	s = strings.Trim(s, "() .,;:-–—")
	s = strings.ReplaceAll(s, " - ", ", ")
	s = strings.ReplaceAll(s, " – ", ", ")
	s = ocrStreetDRe.ReplaceAllString(s, "$1 Đ. ")
	s = postalTailRe.ReplaceAllString(s, "")
	s = commaSpaceRe.ReplaceAllString(s, ", ")
	for _, tail := range []string{", Vietnam", ", Việt Nam", ", Viet Nam"} {
		if strings.HasSuffix(strings.ToLower(s), strings.ToLower(tail)) {
			s = s[:len(s)-len(tail)]
		}
	}
	s = strings.Trim(s, " ,")
	if s == "" || isCityOnly(s) || looksLikeURL(s) {
		return ""
	}
	return s
}

// splitVenueValue separates "Name 305 Street, Ward" / "Name, 12 Street" /
// "Name (12 Street)" into a name and a street address.
func splitVenueValue(raw string) (string, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ""
	}
	if i := strings.Index(raw, "("); i > 0 {
		inner := strings.TrimSpace(strings.Trim(raw[i:], "() .,"))
		if looksLikeStreetAddress(inner) {
			return strings.TrimSpace(raw[:i]), inner
		}
	}
	if looksLikeStreetAddress(raw) {
		return "", raw
	}
	if m := nameThenNumRe.FindStringSubmatch(raw); m != nil && looksLikeStreetAddress(m[2]) {
		return strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
	}
	if name, rest, ok := strings.Cut(raw, ","); ok && looksLikeStreetAddress(strings.TrimSpace(rest)) {
		return strings.TrimSpace(name), strings.TrimSpace(rest)
	}
	return raw, ""
}

func hasCapital(s string) bool {
	return strings.IndexFunc(s, unicode.IsUpper) >= 0
}

func trimLeadingSymbols(s string) string {
	return strings.TrimLeftFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

func isAddressLabel(label string) bool {
	switch label {
	case "address", "địa chỉ", "dia chi":
		return true
	}
	return false
}

// labeledVenue reads a "Venue:" / "Location:" / "📍" line. The value may sit
// on the next line, and the address may follow in parentheses.
func labeledVenue(text string) (venueCandidate, bool) {
	lines := strings.Split(text, "\n")
	var found venueCandidate
	ok := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		pinned := strings.HasPrefix(trimmed, "📍")
		trimmed = strings.TrimSpace(trimLeadingSymbols(trimmed))
		label, value := "", ""
		if m := venueLabelRe.FindStringSubmatch(trimmed); m != nil {
			label, value = strings.ToLower(m[1]), strings.TrimSpace(m[2])
		} else if pinned {
			value = trimmed
		} else {
			continue
		}
		valueIdx := i
		if value == "" {
			for j := i + 1; j < len(lines); j++ {
				if next := strings.TrimSpace(lines[j]); next != "" {
					value, valueIdx = next, j
					break
				}
			}
		}
		if looksLikeURL(value) {
			continue
		}
		name, address := splitVenueValue(value)
		if address == "" {
			for _, next := range lines[valueIdx+1:] {
				next = strings.TrimSpace(next)
				if next == "" {
					continue
				}
				if strings.HasPrefix(next, "(") || looksLikeStreetAddress(trimLeadingSymbols(next)) {
					address = strings.Trim(trimLeadingSymbols(next), "() ")
				}
				break
			}
		}
		name = normalizeVenueName(name)
		if !plausibleVenueName(name) {
			name = ""
		}
		address = normalizeStreetAddress(address)
		if name == "" && address == "" {
			continue
		}
		if found.Name == "" && name != "" {
			found.Name = name
		}
		if found.Address == "" && address != "" {
			found.Address = address
		}
		found.Source = "label"
		ok = true
		if found.Name != "" && (found.Address != "" || !isAddressLabel(label)) {
			break
		}
	}
	return found, ok
}

// atVenue returns the first capitalised name after "at" / "tại".
func atVenue(text string) string {
	for _, m := range atVenueRe.FindAllStringSubmatch(text, -1) {
		words := strings.Fields(m[1])
		kept := words[:0:0]
		for _, w := range words {
			if atStopWords[strings.ToLower(strings.Trim(w, ".,'’"))] {
				break
			}
			kept = append(kept, w)
		}
		for len(kept) > 0 {
			last := strings.ToLower(kept[len(kept)-1])
			if last == "&" || last == "of" || last == "de" || last == "du" || last == "la" || last == "le" || last == "và" {
				kept = kept[:len(kept)-1]
				continue
			}
			break
		}
		if len(kept) == 0 {
			continue
		}
		name := normalizeVenueName(strings.Join(kept, " "))
		if plausibleVenueName(name) {
			return name
		}
	}
	return ""
}

// streetAddressIn finds a stand-alone street address line in text.
func streetAddressIn(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(trimLeadingSymbols(strings.TrimSpace(line)))
		if m := venueLabelRe.FindStringSubmatch(line); m != nil {
			line = strings.TrimSpace(m[2])
		}
		if looksLikeStreetAddress(line) {
			if addr := normalizeStreetAddress(line); addr != "" {
				return addr
			}
		}
	}
	return ""
}

// venueFromText reads a venue written in a caption or flyer text: a labelled
// line first, then "at <Name>". The address comes from the same line or a
// stand-alone street line. Never falls back to description text.
func venueFromText(text string) venueCandidate {
	if strings.TrimSpace(text) == "" {
		return venueCandidate{}
	}
	label, ok := labeledVenue(text)
	if ok && label.Name != "" {
		if label.Address == "" {
			label.Address = streetAddressIn(text)
		}
		return label
	}
	if name := atVenue(text); name != "" {
		addr := label.Address
		if addr == "" {
			addr = streetAddressIn(text)
		}
		return venueCandidate{Name: name, Address: addr, Source: "at"}
	}
	if ok {
		return label
	}
	return venueCandidate{Address: streetAddressIn(text)}
}

// llmVenue takes venue_name / street_address from the vision or text model
// when they are grounded in the caption or the flyer's readable text, then
// falls back to the flyer's own "Venue:" line.
func llmVenue(llm extractResult, corpus string, hasImage bool) venueCandidate {
	readable := strings.TrimSpace(llm.ReadableText)
	imageFact := hasImage && llm.FromImage && llm.IsEventFlyer && readable != ""
	evidence := corpus
	if readable != "" {
		evidence = corpus + "\n" + readable
	}
	out := venueCandidate{Source: "flyer"}
	if raw, ok := groundedText(firstNonEmpty(llm.VenueName, llm.Location), llm.LocationEvidence, evidence, imageFact, readable); ok {
		name, addr := splitVenueValue(raw)
		// A model-picked name must look like a proper name: an all
		// lower-case phrase ("coffee meetups") is prose it lifted.
		if name = normalizeVenueName(name); plausibleVenueName(name) && hasCapital(name) {
			out.Name = name
		}
		out.Address = normalizeStreetAddress(addr)
	}
	if raw, ok := groundedText(firstNonEmpty(llm.StreetAddress, llm.Address), llm.LocationEvidence, evidence, imageFact, readable); ok && !isCityOnly(raw) {
		if addr := normalizeStreetAddress(raw); addr != "" {
			out.Address = addr
		}
	}
	if hasImage && llm.IsEventFlyer && readable != "" && (out.Name == "" || out.Address == "") {
		flyer := venueFromText(readable)
		if out.Name == "" {
			out.Name = flyer.Name
		}
		if out.Address == "" {
			out.Address = flyer.Address
		}
	}
	return out
}

// chooseVenue merges the venue typed in the message with the one read from
// the flyer / model. The same place written two ways keeps the cleaner
// spelling; a different explicit "Venue:" line in the caption wins.
func chooseVenue(msg, flyer venueCandidate) venueCandidate {
	var out venueCandidate
	switch {
	case flyer.Name == "":
		out = msg
	case msg.Name == "":
		out = flyer
	case sameVenue(msg.Name, flyer.Name):
		out = flyer
		mk, fk := venueKey(msg.Name), venueKey(flyer.Name)
		if mk != fk && trimCityKey(fk) == mk {
			out.Name = msg.Name
		}
	case msg.Source == "label":
		out = msg
	default:
		out = flyer
	}
	if out.Address == "" {
		out.Address = firstNonEmpty(flyer.Address, msg.Address)
	}
	return out
}

var foldMarks = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// venueKey folds a venue name for matching: no case, accents, spaces,
// punctuation, emoji or leading "the".
func venueKey(name string) string {
	s := strings.ToLower(normalizeVenueName(name))
	s = strings.ReplaceAll(s, "đ", "d")
	if out, _, err := transform.String(foldMarks, s); err == nil {
		s = out
	}
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func trimCityKey(key string) string {
	for _, suffix := range []string{"dalat", "lamdong"} {
		if strings.HasSuffix(key, suffix) && len(key)-len(suffix) >= 3 {
			key = key[:len(key)-len(suffix)]
		}
	}
	return key
}

func sameVenue(a, b string) bool {
	ka, kb := venueKey(a), venueKey(b)
	if ka == "" || kb == "" {
		return false
	}
	return ka == kb || trimCityKey(ka) == trimCityKey(kb)
}

// venueRef is one row of the venues table.
type venueRef struct {
	ID        string   `json:"id"`
	Slug      string   `json:"slug"`
	Name      string   `json:"name"`
	Address   *string  `json:"address"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

func venueKeys(v venueRef) []string {
	keys := []string{venueKey(v.Name)}
	if i := strings.Index(v.Name, "("); i > 0 {
		keys = append(keys, venueKey(v.Name[:i]), venueKey(strings.Trim(v.Name[i:], "() ")))
	}
	if v.Slug != "" {
		keys = append(keys, venueKey(strings.ReplaceAll(v.Slug, "-", " ")))
	}
	return keys
}

// matchVenue finds an existing venue by normalized name. A trailing city tag
// ("… Dalat") is ignored on both sides.
func matchVenue(name string, venues []venueRef) *venueRef {
	key := venueKey(name)
	if len(key) < 3 {
		return nil
	}
	short := trimCityKey(key)
	for i := range venues {
		for _, vk := range venueKeys(venues[i]) {
			if len(vk) < 3 {
				continue
			}
			if vk == key || trimCityKey(vk) == short {
				return &venues[i]
			}
		}
	}
	return nil
}

// applyVenueMatch links venue_id and fills a missing street address or
// coordinates from the venues row.
func applyVenueMatch(d *eventDraft, venues []venueRef) {
	if d == nil || !publicVenue(d.Location) {
		return
	}
	v := matchVenue(d.Location, venues)
	if v == nil {
		return
	}
	d.VenueID = v.ID
	d.Location = v.Name
	if v.Address != nil && strings.TrimSpace(*v.Address) != "" {
		if addr := strings.TrimSpace(d.Address); addr == "" || isCityOnly(addr) || addr == dalatCity+", "+lamDongProvince {
			d.Address = strings.TrimSpace(*v.Address)
		}
	}
	if d.Latitude == nil && v.Latitude != nil && v.Longitude != nil {
		lat, lng := *v.Latitude, *v.Longitude
		d.Latitude, d.Longitude = &lat, &lng
	}
}

// venueCache keeps the venues table in memory and refreshes it every 30 min.
type venueCache struct {
	mu      sync.Mutex
	list    []venueRef
	fetched time.Time
	fetch   func(context.Context) ([]venueRef, error)
}

func (c *venueCache) get() []venueRef {
	if c == nil || c.fetch == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Since(c.fetched) > 30*time.Minute {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		list, err := c.fetch(ctx)
		cancel()
		if err != nil {
			logf("venues refresh failed: %v", err)
		} else {
			c.list = list
		}
		c.fetched = time.Now()
	}
	return c.list
}

// hasLiteralSchedule is true when the text itself states a clock time, a
// calendar date, or today/tonight/tomorrow. A bare weekday ("the Saturday
// coffee meetup") is not enough: it produced 00:00 starts for chatter.
func hasLiteralSchedule(text string) bool {
	if strings.TrimSpace(text) == "" {
		return false
	}
	if _, _, ok := parseClock(text); ok {
		return true
	}
	now := time.Now().In(mustLoc())
	if _, _, _, ok := explicitCalendarDate(text, now); ok {
		return true
	}
	_, ok := relativeDay(text, now, mustLoc())
	return ok
}
