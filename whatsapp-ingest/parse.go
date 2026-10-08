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
	Slug          string
	Title         string
	Description   string
	Location      string
	Address       string
	VenueID       string
	ExternalURL   string
	ImageURL      string
	ImageAlt      string
	Hero          []byte
	HeroMIME      string
	MapsURL       string
	StartsAt      time.Time
	EndsAt        *time.Time
	TimeInferred  bool
	PriceInferred bool
	PriceText     string
	Organizer     string
	Cancelled     bool
	Latitude      *float64
	Longitude     *float64
	Extraction    string
	MergedIDs     []string
	Native        bool
	IsEventFlyer  bool
	ImageKind     string
	ReadableText  string
	PersonalPhoto bool
	Meta          map[string]any
}

var (
	// Numeric dates: 15/9, 15-09-2026, 15.09.26 — day-first (Vietnam convention).
	dateRe = regexp.MustCompile(`\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b`)
	// Times: 19:30, 19h30, 19h, 7pm, 9am, 8 pm.
	timeRe = regexp.MustCompile(`(?i)\b((?:[01]?\d|2[0-3])[:hH]([0-5]\d)?|([1-9]|1[0-2])\s*(am|pm))\b`)
	// "8 giờ", "8 giờ tối", "20 giờ".
	vietHourRe  = regexp.MustCompile(`(?i)\b(\d{1,2})\s*(?:g|giờ)\s*(tối|sáng|chiều|trưa|đêm)?\b`)
	monthDateRe = regexp.MustCompile(`(?i)\b(?:(?:(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?)|(?:(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?))\b`)
	// Longer month names must come first. `mười` is a prefix of `mười một`
	// and `mười hai`, and a word boundary sits on the space between them.
	vietDayMonthRe  = regexp.MustCompile(`(?i)\b(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2}|mười hai|mười một|một|hai|ba|tư|năm|sáu|bảy|tám|chín|mười)\b`)
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

// extractLocation returns a venue already written in the message: a labelled
// "Venue:" / "Location:" / "📍" line, or a capitalised name after "at" /
// "tại". Empty when the announcement does not name a place — callers must not
// invent Đà Lạt or fall back to description text.
func extractLocation(text string) (name, address string) {
	c := venueFromText(text)
	if c.Name == "" {
		return "", ""
	}
	return c.Name, c.Address
}

func isCityOnly(name string) bool {
	switch strings.ToLower(strings.Trim(strings.TrimSpace(name), ".,")) {
	case "đà lạt", "da lat", "dalat", "lâm đồng", "lam dong":
		return true
	default:
		return false
	}
}

// sourceCaption returns the user-authored description without the Life in
// Đà Lạt community attribution line. Empty when the draft has no real caption.
func sourceCaption(desc string) string {
	caption := strings.TrimSpace(stripCommunity(desc))
	if caption == "" || strings.HasPrefix(caption, "Shared in the ") {
		return ""
	}
	return caption
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
	if d.VenueID != "" {
		row["venue_id"] = d.VenueID
	}
	if d.Address != "" || publicVenue(d.Location) {
		row["address"] = ensureLocalityAddress(d.Address)
	}
	if maps := d.googleMapsURL(); maps != "" {
		row["google_maps_url"] = maps
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
		alt := strings.TrimSpace(d.ImageAlt)
		if alt == "" {
			if d.IsEventFlyer {
				alt = flyerHeroAlt
			} else if d.PersonalPhoto {
				alt = personalPhotoAlt
			} else {
				alt = ownerHeroAlt
			}
		}
		row["image_alt"] = alt
		meta["visual_provenance"] = "owner_authorized_source"
		meta["hero_present"] = true
		gapReason := "WhatsApp shared a single image; no additional images were posted"
		if d.IsEventFlyer {
			gapReason = "WhatsApp organizer shared a single flyer; no additional images were posted"
		}
		meta["visual_gap"] = map[string]any{
			"reason":        gapReason,
			"covers":        []string{"promo"},
			"documented_at": time.Now().UTC().Format(time.RFC3339),
		}
	}
	meta["city"] = dalatCity
	meta["province"] = lamDongProvince
	meta["time_inferred"] = d.TimeInferred
	meta["price_inferred"] = d.PriceInferred
	if d.ImageKind != "" {
		meta["image_kind"] = d.ImageKind
	}
	if d.IsEventFlyer {
		meta["is_event_flyer"] = true
	} else if d.Extraction == "vision" {
		meta["is_event_flyer"] = false
	}
	if d.ReadableText != "" {
		meta["readable_text"] = d.ReadableText
		meta["source_text_evidence"] = d.ReadableText
	}
	if caption := sourceCaption(d.Description); caption != "" {
		meta["source_text_evidence"] = caption
	}
	if d.PersonalPhoto {
		meta["personal_photo_hero"] = true
	}
	// A rejected draft is reopened by sending the full metadata again:
	// needs_review goes back to true and the previous rejection is cleared.
	meta["needs_review"] = reviewableDraft(d)
	meta["review_result"] = nil
	meta["rejected_at"] = nil
	meta["reject_reasons"] = nil
	meta["ingest_lane"] = "scout-review"
	if chat, _ := row["external_chat_url"].(string); chat != "" {
		meta["source_url"] = chat
	}
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
