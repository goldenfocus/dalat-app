package main

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/araddon/dateparse"
	"go.mau.fi/whatsmeow/types/events"
)

// eventDraft is a parsed event announcement ready to become an events row.
type eventDraft struct {
	Slug         string
	Title        string
	Description  string
	Location     string
	Address      string
	ExternalURL  string
	ImageURL     string
	ImageAlt     string
	StartsAt     time.Time
	EndsAt       *time.Time
	TimeInferred bool
	PriceText    string
	Organizer    string
	Cancelled    bool
	Latitude     *float64
	Longitude    *float64
	Extraction   string
	MergedIDs    []string
	Native       bool
	Meta         map[string]any
}

var (
	// Numeric dates: 15/9, 15-09-2026, 15.09.26 — day-first (Vietnam convention).
	dateRe = regexp.MustCompile(`\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b`)
	// Times: 19:30, 19h30, 19h, 7pm, 9am, 8 pm.
	timeRe = regexp.MustCompile(`(?i)\b((?:[01]?\d|2[0-3])[:hH]([0-5]\d)?|([1-9]|1[0-2])\s*(am|pm))\b`)
	// "8 giờ", "8 giờ tối", "20 giờ".
	vietHourRe = regexp.MustCompile(`(?i)\b(\d{1,2})\s*(?:g|giờ)\s*(tối|sáng|chiều|trưa|đêm)?\b`)
	// Venue cues that already appear in the source text — never invent a place.
	locationRe      = regexp.MustCompile(`(?i)(?:tại\s+|at\s+|venue\s*:\s*|địa điểm\s*:\s*|location\s*:\s*|địa chỉ\s*:\s*|where\s*:\s*)([^\n]{2,120})`)
	monthDateRe     = regexp.MustCompile(`(?i)\b(?:(?:(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?)|(?:(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?))\b`)
	vietDayMonthRe  = regexp.MustCompile(`(?i)\b(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2}|một|hai|ba|tư|năm|sáu|bảy|tám|chín|mười|mười một|mười hai)\b`)
	weekdayPhraseRe = regexp.MustCompile(`(?i)\b(?:(this|next|weekly|every|hàng tuần|tới|tuần này|tuần tới|tuần sau)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|thứ hai|thứ ba|thứ tư|thứ năm|thứ sáu|thứ bảy|thứ bay|chủ nhật|chu nhat|thứ\s*[2-7]|thu\s*[2-7])\b`)
)

const defaultEventLocation = "Asia/Ho_Chi_Minh"

var monthIndex = map[string]time.Month{
	"january": time.January, "jan": time.January,
	"february": time.February, "feb": time.February,
	"march": time.March, "mar": time.March,
	"april": time.April, "apr": time.April,
	"may":  time.May,
	"june": time.June, "jun": time.June,
	"july": time.July, "jul": time.July,
	"august": time.August, "aug": time.August,
	"september": time.September, "sep": time.September, "sept": time.September,
	"october": time.October, "oct": time.October,
	"november": time.November, "nov": time.November,
	"december": time.December, "dec": time.December,
}

var vietMonthIndex = map[string]time.Month{
	"1": time.January, "một": time.January,
	"2": time.February, "hai": time.February,
	"3": time.March, "ba": time.March,
	"4": time.April, "tư": time.April, "tu": time.April,
	"5": time.May, "năm": time.May, "nam": time.May,
	"6": time.June, "sáu": time.June, "sau": time.June,
	"7": time.July, "bảy": time.July, "bay": time.July,
	"8": time.August, "tám": time.August, "tam": time.August,
	"9": time.September, "chín": time.September, "chin": time.September,
	"10": time.October, "mười": time.October, "muoi": time.October,
	"11": time.November, "mười một": time.November, "muoi mot": time.November,
	"12": time.December, "mười hai": time.December, "muoi hai": time.December,
}

var weekdayIndex = map[string]time.Weekday{
	"sunday": time.Sunday, "sun": time.Sunday, "chủ nhật": time.Sunday, "chu nhat": time.Sunday,
	"monday": time.Monday, "mon": time.Monday, "thứ hai": time.Monday, "thứ 2": time.Monday, "thu 2": time.Monday,
	"tuesday": time.Tuesday, "tue": time.Tuesday, "tues": time.Tuesday, "thứ ba": time.Tuesday, "thứ 3": time.Tuesday, "thu 3": time.Tuesday,
	"wednesday": time.Wednesday, "wed": time.Wednesday, "thứ tư": time.Wednesday, "thứ 4": time.Wednesday, "thu 4": time.Wednesday,
	"thursday": time.Thursday, "thu": time.Thursday, "thur": time.Thursday, "thurs": time.Thursday, "thứ năm": time.Thursday, "thứ 5": time.Thursday, "thu 5": time.Thursday,
	"friday": time.Friday, "fri": time.Friday, "thứ sáu": time.Friday, "thứ 6": time.Friday, "thu 6": time.Friday,
	"saturday": time.Saturday, "sat": time.Saturday, "thứ bảy": time.Saturday, "thứ bay": time.Saturday, "thứ 7": time.Saturday, "thu 7": time.Saturday,
}

// buildDraft extracts an eventDraft from a group message. Native WhatsApp
// event messages carry structured fields; plain text and flyer captions fall
// back to heuristic date extraction. The live pipeline uses decide() so it
// can merge context and vision; buildDraft remains the single-message path.
func buildDraft(msg *events.Message, text, groupName string) (*eventDraft, error) {
	loc, err := time.LoadLocation(defaultEventLocation)
	if err != nil {
		return nil, err
	}
	in := inboundFromEvent(msg, text, groupName)
	if native, ok := nativeFromInbound(in); ok {
		return native, nil
	}
	start, timeInferred, err := extractStartTime(text, loc, msg.Info.Timestamp)
	if err != nil {
		return nil, err
	}
	draft := baseDraft(in)
	draft.StartsAt = start
	draft.TimeInferred = timeInferred
	draft.Title = firstLine(text)
	draft.Location, draft.Address = extractLocation(text)
	draft.Extraction = "heuristic"
	if draft.Title == "" {
		return nil, fmt.Errorf("no title extractable")
	}
	return draft, nil
}

// extractStartTime finds a date in text, combines it with the first clock
// time, and interprets the calendar day-first in loc. Year-less dates roll
// forward to their next future occurrence relative to ref. A missing clock
// is midnight except for "tonight" / "tối nay", which use 20:00. Both
// defaults are flagged as inferred.
func extractStartTime(text string, loc *time.Location, ref time.Time) (time.Time, bool, error) {
	ref = ref.In(loc)
	hour, min, timeFound := parseClock(text)
	eveningHint := hasEveningHint(text)

	if y, mo, d, ok := explicitCalendarDate(text, ref); ok {
		if !timeFound && eveningHint {
			hour, min = 20, 0
			t := time.Date(y, mo, d, hour, min, 0, 0, loc)
			return rollYear(t, ref, yearWasExplicit(text)), true, nil
		}
		t := time.Date(y, mo, d, hour, min, 0, 0, loc)
		inferred := !timeFound
		return rollYear(t, ref, yearWasExplicit(text)), inferred, nil
	}

	if rel, ok := relativeDay(text, ref, loc); ok {
		h, m := hour, min
		inferred := !timeFound
		if !timeFound && (eveningHint || rel.evening) {
			h, m = 20, 0
			inferred = true
		}
		t := time.Date(rel.year, rel.month, rel.day, h, m, 0, 0, loc)
		return t, inferred, nil
	}

	if wd, mode, ok := weekdayMention(text); ok {
		day := upcomingWeekday(ref, wd, mode)
		inferred := !timeFound
		h, m := hour, min
		if !timeFound && eveningHint {
			h, m = 20, 0
			inferred = true
		}
		t := time.Date(day.Year(), day.Month(), day.Day(), h, m, 0, 0, loc)
		if t.Before(ref.Add(-6 * time.Hour)) {
			t = t.AddDate(0, 0, 7)
		}
		return t, inferred, nil
	}

	return time.Time{}, false, fmt.Errorf("no date found in message")
}

func yearWasExplicit(text string) bool {
	return regexp.MustCompile(`\b20\d{2}\b`).MatchString(text) ||
		regexp.MustCompile(`\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b`).MatchString(text)
}

func rollYear(t, ref time.Time, yearExplicit bool) time.Time {
	if yearExplicit {
		return t
	}
	for t.Before(ref.Add(-6 * time.Hour)) {
		t = t.AddDate(1, 0, 0)
		if t.After(ref.AddDate(2, 0, 0)) {
			break
		}
	}
	return t
}

func explicitCalendarDate(text string, ref time.Time) (year int, month time.Month, day int, ok bool) {
	if m := monthDateRe.FindStringSubmatch(text); m != nil {
		var mon string
		if m[1] != "" {
			mon = strings.ToLower(strings.TrimSuffix(m[1], "."))
			fmt.Sscanf(m[2], "%d", &day)
		} else {
			fmt.Sscanf(m[3], "%d", &day)
			mon = strings.ToLower(strings.TrimSuffix(m[4], "."))
		}
		month = monthIndex[mon]
		if month == 0 || day < 1 || day > 31 {
			return 0, 0, 0, false
		}
		year = ref.Year()
		if y := explicitYear(text); y != 0 {
			year = y
		}
		return year, month, day, true
	}
	if m := vietDayMonthRe.FindStringSubmatch(strings.ToLower(text)); m != nil {
		fmt.Sscanf(m[1], "%d", &day)
		month = vietMonthIndex[strings.TrimSpace(m[2])]
		if month == 0 || day < 1 || day > 31 {
			return 0, 0, 0, false
		}
		year = ref.Year()
		if y := explicitYear(text); y != 0 {
			year = y
		}
		return year, month, day, true
	}
	dateTok := dateRe.FindString(text)
	if dateTok == "" {
		return 0, 0, 0, false
	}
	parsed, err := dateparse.ParseIn(dateTok, ref.Location(), dateparse.PreferMonthFirst(false))
	if err != nil {
		return 0, 0, 0, false
	}
	year = parsed.Year()
	if !yearWasExplicit(dateTok) {
		year = ref.Year()
	}
	return year, parsed.Month(), parsed.Day(), true
}

func explicitYear(text string) int {
	m := regexp.MustCompile(`\b(20\d{2})\b`).FindStringSubmatch(text)
	if m == nil {
		return 0
	}
	var y int
	fmt.Sscanf(m[1], "%d", &y)
	return y
}

type relDay struct {
	year, day int
	month     time.Month
	evening   bool
}

func relativeDay(text string, ref time.Time, loc *time.Location) (relDay, bool) {
	low := strings.ToLower(text)
	ref = ref.In(loc)
	switch {
	case containsWord(low, "ngày mai") || containsWord(low, "ngay mai") || containsWord(low, "tomorrow"):
		n := ref.AddDate(0, 0, 1)
		return relDay{n.Year(), n.Day(), n.Month(), containsWord(low, "tomorrow night") || containsWord(low, "tối mai") || containsWord(low, "toi mai")}, true
	case containsWord(low, "tối nay") || containsWord(low, "toi nay") || containsWord(low, "tonight") || containsWord(low, "this evening"):
		return relDay{ref.Year(), ref.Day(), ref.Month(), true}, true
	case containsWord(low, "hôm nay") || containsWord(low, "hom nay") || containsWord(low, "today"):
		return relDay{ref.Year(), ref.Day(), ref.Month(), false}, true
	default:
		return relDay{}, false
	}
}

func containsWord(text, phrase string) bool {
	return strings.Contains(text, phrase)
}

func weekdayMention(text string) (time.Weekday, string, bool) {
	m := weekdayPhraseRe.FindStringSubmatch(strings.ToLower(text))
	if m == nil {
		return 0, "", false
	}
	mode := strings.TrimSpace(m[1])
	name := strings.Join(strings.Fields(m[2]), " ")
	wd, ok := weekdayIndex[name]
	if !ok {
		return 0, "", false
	}
	switch mode {
	case "next", "tới", "tuần tới", "tuần sau":
		return wd, "next", true
	case "weekly", "every", "hàng tuần":
		return wd, "weekly", true
	default:
		// Bare weekday only counts when the message is clearly recurring or
		// says "this <day>". A lone "sat" inside other words is already
		// bounded by the regex.
		if mode == "" && !hasRecurringCue(text) && !strings.Contains(strings.ToLower(text), "this "+name) {
			// Allow a bare weekday when it is the whole point of a short
			// announcement ("SATURDAY COFFEE MEETUP") — the caller still
			// has to pass the event filter. Returning it here lets the
			// date resolve; chit-chat never gets this far.
			if !regexp.MustCompile(`(?i)\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|thứ hai|thứ ba|thứ tư|thứ năm|thứ sáu|thứ bảy|chủ nhật)\b`).MatchString(text) {
				return 0, "", false
			}
		}
		return wd, "upcoming", true
	}
}

func hasRecurringCue(text string) bool {
	low := strings.ToLower(text)
	return strings.Contains(low, "weekly") || strings.Contains(low, "every ") || strings.Contains(low, "hàng tuần") || strings.Contains(low, "hang tuan")
}

func upcomingWeekday(ref time.Time, wd time.Weekday, mode string) time.Time {
	delta := (int(wd) - int(ref.Weekday()) + 7) % 7
	if mode == "next" {
		if delta == 0 {
			delta = 7
		} else {
			delta += 7
		}
	}
	return time.Date(ref.Year(), ref.Month(), ref.Day(), 0, 0, 0, 0, ref.Location()).AddDate(0, 0, delta)
}

func parseClock(text string) (hour, min int, ok bool) {
	if m := timeRe.FindStringSubmatch(text); m != nil {
		if m[3] != "" {
			fmt.Sscanf(m[3], "%d", &hour)
			if strings.EqualFold(m[4], "pm") && hour != 12 {
				hour += 12
			}
			if strings.EqualFold(m[4], "am") && hour == 12 {
				hour = 0
			}
			return hour, 0, true
		}
		fmt.Sscanf(m[1], "%d", &hour)
		if m[2] != "" {
			fmt.Sscanf(m[2], "%d", &min)
		}
		return hour, min, true
	}
	if m := vietHourRe.FindStringSubmatch(text); m != nil {
		fmt.Sscanf(m[1], "%d", &hour)
		switch strings.ToLower(m[2]) {
		case "tối", "đêm", "chiều":
			if hour < 12 {
				hour += 12
			}
		case "sáng":
			if hour == 12 {
				hour = 0
			}
		}
		if hour >= 0 && hour <= 23 {
			return hour, 0, true
		}
	}
	return 0, 0, false
}

func hasEveningHint(text string) bool {
	low := strings.ToLower(text)
	return strings.Contains(low, "tonight") || strings.Contains(low, "this evening") ||
		strings.Contains(low, "tối nay") || strings.Contains(low, "toi nay") ||
		strings.Contains(low, "tomorrow night") || strings.Contains(low, "tối mai")
}

func firstLine(text string) string {
	for line := range strings.Lines(text) {
		line = strings.TrimSpace(line)
		if line == "" || isDateOrTimeOnly(line) {
			continue
		}
		const maxTitle = 100
		if len(line) > maxTitle {
			line = strings.TrimSpace(line[:maxTitle])
		}
		return line
	}
	return ""
}

func isDateOrTimeOnly(line string) bool {
	stripped := dateRe.ReplaceAllString(line, "")
	stripped = monthDateRe.ReplaceAllString(stripped, "")
	stripped = timeRe.ReplaceAllString(stripped, "")
	stripped = vietHourRe.ReplaceAllString(stripped, "")
	stripped = strings.TrimFunc(stripped, func(r rune) bool {
		return unicode.IsSpace(r) || strings.ContainsRune(".,:-/()", r)
	})
	low := strings.ToLower(stripped)
	switch low {
	case "", "from", "at", "lúc", "luc", "vào", "vao", "ngày", "ngay":
		return true
	default:
		return false
	}
}

// extractLocation returns a venue already written in the message. Empty when
// the announcement does not name a place — callers must not invent Đà Lạt.
func extractLocation(text string) (name, address string) {
	// Prefer an explicit label, whose value may sit on the next line.
	if name, address, ok := labeledLocation(text); ok {
		return name, address
	}
	m := locationRe.FindStringSubmatch(text)
	if m == nil {
		return "", ""
	}
	return cleanVenue(m[1])
}

func labeledLocation(text string) (string, string, bool) {
	lines := strings.Split(text, "\n")
	labelRe := regexp.MustCompile(`(?i)^(location|venue|địa điểm|dia diem|địa chỉ|dia chi|where)\s*:\s*(.*)$`)
	for i, line := range lines {
		m := labelRe.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		value := strings.TrimSpace(m[2])
		valueIdx := i
		if value == "" {
			for j := i + 1; j < len(lines); j++ {
				next := strings.TrimSpace(lines[j])
				if next == "" {
					continue
				}
				value = next
				valueIdx = j
				break
			}
		}
		name, address := cleanVenue(value)
		if name == "" {
			continue
		}
		if address == "" {
			for _, next := range lines[valueIdx+1:] {
				next = strings.TrimSpace(next)
				if next == "" {
					continue
				}
				if strings.HasPrefix(next, "(") {
					address = strings.Trim(next, "() ")
				}
				break
			}
		}
		return name, address, true
	}
	return "", "", false
}

func cleanVenue(raw string) (name, address string) {
	raw = strings.TrimSpace(raw)
	raw = trimVenueTail(raw)
	raw = strings.Trim(raw, ".,; ")
	if raw == "" || isDateOrTimeOnly(raw) || timeRe.MatchString(raw) && len(strings.Fields(raw)) < 3 {
		return "", ""
	}
	line, _, _ := strings.Cut(raw, "\n")
	line = strings.TrimSpace(line)
	if i := strings.Index(line, "("); i > 0 {
		name = strings.TrimSpace(line[:i])
		address = strings.Trim(line[i:], "() ")
		address = strings.Trim(address, "., ")
	} else {
		name = line
	}
	if isCityOnly(name) || name == "" {
		return "", ""
	}
	if len(name) > 80 {
		name = strings.TrimSpace(name[:80])
	}
	return name, address
}

func trimVenueTail(raw string) string {
	cutters := []*regexp.Regexp{
		timeRe,
		regexp.MustCompile(`(?i)\b(tomorrow|tonight|today|ngày mai|tối nay|hôm nay|this|next)\b.*$`),
	}
	for _, re := range cutters {
		if loc := re.FindStringIndex(raw); loc != nil && loc[0] > 0 {
			raw = strings.TrimSpace(raw[:loc[0]])
		}
	}
	return raw
}

func isCityOnly(name string) bool {
	switch strings.ToLower(strings.Trim(strings.TrimSpace(name), ".,")) {
	case "đà lạt", "da lat", "dalat", "lâm đồng", "lam dong":
		return true
	default:
		return false
	}
}

// toRow maps the draft onto the events table columns.
func (d *eventDraft) toRow(createdBy string) map[string]any {
	status := "draft"
	if d.Cancelled {
		status = "cancelled"
	}
	row := map[string]any{
		"slug":            d.Slug,
		"title":           d.Title,
		"description":     d.Description,
		"status":          status,
		"created_by":      createdBy,
		"starts_at":       d.StartsAt.UTC().Format(time.RFC3339),
		"timezone":        defaultEventLocation,
		"source_platform": "whatsapp",
		"source_locale":   "vi",
		"source_metadata": map[string]any{
			"channel":       "whatsapp-group",
			"time_inferred": d.TimeInferred,
		},
	}
	if d.EndsAt != nil {
		row["ends_at"] = d.EndsAt.UTC().Format(time.RFC3339)
	}
	if d.Location != "" {
		row["location_name"] = d.Location
	}
	if d.Address != "" {
		row["address"] = d.Address
	}
	if d.Latitude != nil && d.Longitude != nil {
		row["latitude"] = *d.Latitude
		row["longitude"] = *d.Longitude
	}
	meta := d.Meta
	if meta == nil {
		meta = map[string]any{}
	}
	anchorID, _ := meta["message_id"].(string)
	if d.ExternalURL != "" {
		row["external_chat_url"] = d.ExternalURL
	} else if groupJID, _ := meta["group_jid"].(string); groupJID != "" && anchorID != "" {
		row["external_chat_url"] = "whatsapp:" + groupJID + "/" + anchorID
	}
	if d.ImageURL != "" {
		row["image_url"] = d.ImageURL
		row["image_alt"] = d.ImageAlt
		meta["visual_gap"] = map[string]any{
			"reason": "WhatsApp organizer shared a single flyer; no additional images were posted",
			"covers": []string{"promo"},
		}
	}
	meta["time_inferred"] = d.TimeInferred
	meta["needs_review"] = !d.Cancelled
	meta["ingest_lane"] = "scout-review"
	if d.Extraction != "" {
		meta["extraction"] = d.Extraction
	}
	if d.PriceText != "" {
		meta["price_text"] = d.PriceText
	}
	if d.Organizer != "" {
		meta["organizer_name"] = d.Organizer
	}
	if d.Native {
		meta["native_event"] = true
	}
	if d.Cancelled {
		meta["event_canceled"] = true
	}
	if len(d.MergedIDs) > 0 {
		meta["merged_message_ids"] = d.MergedIDs
	}
	row["source_metadata"] = meta
	return row
}
