package main

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// clockHit is one clock time (and optional range end) found in text.
type clockHit struct {
	pos          int
	hour, minute int
	hasEnd       bool
	endHour      int
	endMinute    int
}

const clockPart = `(\d{1,2})(?:(:)([0-5]\d)|([hH])([0-5]\d)?)?\s*(am\b|pm\b|a\.m\.|p\.m\.)?`

var (
	// "6pm–10pm", "6-10pm", "18h-22h", "10:00–11:30 AM", "từ 18h đến 22h".
	clockRangeRe = regexp.MustCompile(`(?i)\b` + clockPart + `\s*(?:-|–|—|~|\bto\b|\buntil\b|\btill\b|đến|tới)\s*` + clockPart + `(?:$|[^\d])`)
	// "18:00", "6:30pm", "10:00 AM".
	clockColonRe = regexp.MustCompile(`(?i)\b(\d{1,2}):([0-5]\d)(?:\s*(am\b|pm\b|a\.m\.|p\.m\.))?`)
	// "18h", "18h30", "từ 18h".
	clockHRe = regexp.MustCompile(`\b(\d{1,2})[hH]([0-5]\d)?\b`)
	// "6PM", "6 PM", "FROM 6PM", "8 p.m.".
	clockMeridiemRe = regexp.MustCompile(`(?i)\b(\d{1,2})\s*(am\b|pm\b|a\.m\.|p\.m\.)`)
)

func meridiem(raw string) string {
	switch strings.ToLower(strings.ReplaceAll(raw, ".", "")) {
	case "am":
		return "am"
	case "pm":
		return "pm"
	}
	return ""
}

// to24 applies am/pm to a 12-hour clock. ok is false for impossible times.
func to24(hour int, mer string) (int, bool) {
	switch mer {
	case "am":
		if hour < 1 || hour > 12 {
			return 0, false
		}
		if hour == 12 {
			return 0, true
		}
		return hour, true
	case "pm":
		if hour < 1 || hour > 12 {
			return 0, false
		}
		if hour == 12 {
			return 12, true
		}
		return hour + 12, true
	}
	return hour, hour >= 0 && hour <= 23
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// dateSeparatorBefore is true when the match continues a date such as
// "05/09" or "9.10", so "09 - 10pm" inside "05/09 - 10pm" is not a range.
func dateSeparatorBefore(text string, pos int) bool {
	if pos == 0 {
		return false
	}
	return strings.ContainsRune("/.-:", rune(text[pos-1]))
}

// findClock returns the first clock time in text, with a range end when the
// text gives one. Bare numbers never count: a clock needs ":", "h", am/pm or
// "giờ".
func findClock(text string) (clockHit, bool) {
	var hits []clockHit
	for _, m := range clockRangeRe.FindAllStringSubmatchIndex(text, -1) {
		if dateSeparatorBefore(text, m[0]) {
			continue
		}
		g := func(i int) string {
			if m[2*i] < 0 {
				return ""
			}
			return text[m[2*i]:m[2*i+1]]
		}
		// groups: 1 h, 2 ":", 3 mm, 4 "h", 5 mm, 6 mer | 7 h, 8 ":", 9 mm, 10 "h", 11 mm, 12 mer
		startMarked := g(2) != "" || g(4) != "" || g(6) != ""
		endMarked := g(8) != "" || g(10) != "" || g(12) != ""
		if !endMarked {
			continue // "7-9", "07:30 - 150.000đ": the end must look like a clock
		}
		sm := atoi(firstNonEmpty(g(3), g(5)))
		em := atoi(firstNonEmpty(g(9), g(11)))
		startMer, endMer := meridiem(g(6)), meridiem(g(12))
		eh, ok := to24(atoi(g(7)), endMer)
		if !ok {
			continue
		}
		sh := atoi(g(1))
		switch {
		case startMer != "":
			v, ok := to24(sh, startMer)
			if !ok {
				continue
			}
			sh = v
		case endMer != "":
			// "6-10pm", "10:00–11:30 AM": the end's am/pm covers the start
			// unless that would put the start after the end ("11-1pm").
			if h, ok := to24(sh, endMer); ok && (h < eh || (h == eh && sm < em)) {
				sh = h
			} else if h, ok := to24(sh, "am"); ok {
				sh = h
			} else {
				continue
			}
		case !startMarked && sh >= eh:
			continue // "18-14h" is not a range
		}
		if sh > 23 || eh > 23 {
			continue
		}
		hits = append(hits, clockHit{pos: m[0], hour: sh, minute: sm, hasEnd: true, endHour: eh, endMinute: em})
	}
	for _, m := range clockColonRe.FindAllStringSubmatchIndex(text, -1) {
		if dateSeparatorBefore(text, m[0]) {
			continue
		}
		mer := ""
		if m[6] >= 0 {
			mer = meridiem(text[m[6]:m[7]])
		}
		h, ok := to24(atoi(text[m[2]:m[3]]), mer)
		if !ok {
			continue
		}
		hits = append(hits, clockHit{pos: m[0], hour: h, minute: atoi(text[m[4]:m[5]])})
	}
	for _, m := range clockHRe.FindAllStringSubmatchIndex(text, -1) {
		if dateSeparatorBefore(text, m[0]) {
			continue
		}
		h := atoi(text[m[2]:m[3]])
		if h > 23 {
			continue
		}
		mm := 0
		if m[4] >= 0 {
			mm = atoi(text[m[4]:m[5]])
		}
		hits = append(hits, clockHit{pos: m[0], hour: h, minute: mm})
	}
	for _, m := range clockMeridiemRe.FindAllStringSubmatchIndex(text, -1) {
		if dateSeparatorBefore(text, m[0]) {
			continue
		}
		h, ok := to24(atoi(text[m[2]:m[3]]), meridiem(text[m[4]:m[5]]))
		if !ok {
			continue
		}
		hits = append(hits, clockHit{pos: m[0], hour: h})
	}
	for _, m := range vietHourRe.FindAllStringSubmatchIndex(text, -1) {
		h := atoi(text[m[2]:m[3]])
		if m[4] >= 0 {
			switch strings.ToLower(text[m[4]:m[5]]) {
			case "tối", "đêm", "chiều":
				if h < 12 {
					h += 12
				}
			case "sáng":
				if h == 12 {
					h = 0
				}
			}
		}
		if h > 23 {
			continue
		}
		hits = append(hits, clockHit{pos: m[0], hour: h})
	}
	if len(hits) == 0 {
		return clockHit{}, false
	}
	// Earliest position wins; at the same position a range beats a single time.
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].pos < hits[j].pos })
	return hits[0], true
}

// parseClock returns the first clock time in text.
func parseClock(text string) (hour, min int, ok bool) {
	c, ok := findClock(text)
	return c.hour, c.minute, ok
}

// extractStartTime finds a date in text, combines it with the first clock
// time, and interprets the calendar day-first in loc. See extractSchedule.
func extractStartTime(text string, loc *time.Location, ref time.Time) (time.Time, bool, error) {
	start, _, inferred, err := extractSchedule([]string{text}, loc, ref)
	return start, inferred, err
}

// extractSchedule combines the date and the clock time from several texts
// (the caption first, then the flyer's readable text). "Tomorrow" in the
// caption and "FROM 6PM" on the flyer give tomorrow 18:00, not midnight.
//
// Date order: a calendar date or today/tonight/tomorrow in any source (in
// source order), then a weekday. Relative days resolve against ref in loc.
// Year-less dates roll forward to their next occurrence. The clock is the
// first one found in any source; a range sets the end. Without any clock the
// start is midnight (20:00 for "tonight") and flagged as inferred.
func extractSchedule(sources []string, loc *time.Location, ref time.Time) (time.Time, *time.Time, bool, error) {
	ref = ref.In(loc)
	joined := strings.Join(sources, "\n")

	var clock *clockHit
	for _, src := range sources {
		if c, ok := findClock(src); ok {
			clock = &c
			break
		}
	}

	var day time.Time
	found, evening, kind, yearExplicit := false, false, "", false
	for _, src := range sources {
		if strings.TrimSpace(src) == "" {
			continue
		}
		if y, mo, d, ok := explicitCalendarDate(src, ref); ok {
			day = time.Date(y, mo, d, 0, 0, 0, 0, loc)
			found, kind, yearExplicit = true, "calendar", yearWasExplicit(src)
			break
		}
		if rel, ok := relativeDay(src, ref, loc); ok {
			day = time.Date(rel.year, rel.month, rel.day, 0, 0, 0, 0, loc)
			found, kind, evening = true, "relative", rel.evening
			break
		}
	}
	if !found {
		for _, src := range sources {
			if wd, mode, ok := weekdayMention(src); ok {
				day = upcomingWeekday(ref, wd, mode)
				found, kind = true, "weekday"
				break
			}
		}
	}
	if !found {
		return time.Time{}, nil, false, fmt.Errorf("no date found in message")
	}

	hour, minute, inferred := 0, 0, true
	switch {
	case clock != nil:
		hour, minute, inferred = clock.hour, clock.minute, false
	case hasEveningHint(joined) || evening:
		hour = 20
	}
	start := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, loc)
	switch kind {
	case "calendar":
		start = rollYear(start, ref, yearExplicit)
	case "weekday":
		if start.Before(ref.Add(-6 * time.Hour)) {
			start = start.AddDate(0, 0, 7)
		}
	}
	var end *time.Time
	if clock != nil && clock.hasEnd {
		e := time.Date(start.Year(), start.Month(), start.Day(), clock.endHour, clock.endMinute, 0, 0, loc)
		if !e.After(start) {
			e = e.AddDate(0, 0, 1)
		}
		end = &e
	}
	return start, end, inferred, nil
}
