package main

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/araddon/dateparse"
	"go.mau.fi/whatsmeow/types/events"
)

// eventDraft is a parsed event announcement ready to become an events row.
type eventDraft struct {
	Slug        string
	Title       string
	Description string
	Location    string
	ExternalURL string
	ImageURL    string
	ImageAlt    string
	StartsAt    time.Time
	EndsAt      *time.Time
	TimeInferred bool
	Meta        map[string]any
}

var (
	// Numeric dates: 15/9, 15-09-2026, 15.09.26 — day-first (Vietnam convention).
	dateRe = regexp.MustCompile(`\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b`)
	// Times: 19:30, 19h30, 19h, 7pm, 9am.
	timeRe = regexp.MustCompile(`(?i)\b((?:[01]?\d|2[0-3])[:hH]([0-5]\d)?|([1-9]|1[0-2])\s*(am|pm))\b`)
	// Venue cues that already appear in the source text — never invent a place.
	locationRe = regexp.MustCompile(`(?i)(?:tại\s+|at\s+|venue:\s*|địa điểm:\s*)([^,\n.]{3,80})`)
)

const defaultEventLocation = "Asia/Ho_Chi_Minh"

// buildDraft extracts an eventDraft from a group message. Native WhatsApp
// event messages carry structured fields; plain text and flyer captions fall
// back to heuristic date extraction.
func buildDraft(msg *events.Message, text, groupName string) (*eventDraft, error) {
	loc, err := time.LoadLocation(defaultEventLocation)
	if err != nil {
		return nil, err
	}

	draft := &eventDraft{
		Slug:        "wa-" + strings.ToLower(string(msg.Info.ID)),
		Description: strings.TrimSpace(text),
		Meta: map[string]any{
			"channel":    "whatsapp-group",
			"group_jid":  msg.Info.Chat.String(),
			"group_name": groupName,
			"sender":     msg.Info.Sender.String(),
			"message_id": string(msg.Info.ID),
			"shared_at":  msg.Info.Timestamp.UTC().Format(time.RFC3339),
		},
	}

	if em := msg.Message.GetEventMessage(); em != nil {
		draft.Title = strings.TrimSpace(em.GetName())
		if em.GetStartTime() > 0 {
			draft.StartsAt = time.Unix(em.GetStartTime(), 0)
		}
		if em.GetEndTime() > 0 {
			end := time.Unix(em.GetEndTime(), 0)
			draft.EndsAt = &end
		}
		if locMsg := em.GetLocation(); locMsg != nil {
			draft.Location = strings.TrimSpace(strings.Join(
				[]string{locMsg.GetName(), locMsg.GetAddress()}, ", "))
			draft.Location = strings.Trim(draft.Location, ", ")
		}
		draft.ExternalURL = em.GetJoinLink()
		if draft.StartsAt.IsZero() {
			return nil, fmt.Errorf("event message %q has no start time", draft.Title)
		}
	} else {
		start, timeInferred, err := extractStartTime(text, loc, msg.Info.Timestamp)
		if err != nil {
			return nil, err
		}
		draft.StartsAt = start
		draft.TimeInferred = timeInferred
		draft.Title = firstLine(text)
		draft.Location = extractLocation(text)
	}

	if draft.Title == "" {
		return nil, fmt.Errorf("no title extractable")
	}
	return draft, nil
}

// extractStartTime finds the first date-like token in text, combines it with
// the first time-like token if present, and parses the date day-first in loc.
// Dates without a year roll forward to their next future occurrence relative
// to ref. A missing time defaults to midnight and is flagged as inferred.
func extractStartTime(text string, loc *time.Location, ref time.Time) (time.Time, bool, error) {
	dateTok := dateRe.FindString(text)
	if dateTok == "" {
		return time.Time{}, false, fmt.Errorf("no date found in message")
	}

	day, err := dateparse.ParseIn(dateTok, loc, dateparse.PreferMonthFirst(false))
	if err != nil {
		return time.Time{}, false, fmt.Errorf("unparseable date %q: %v", dateTok, err)
	}

	hour, min, timeInferred := 0, 0, true
	if m := timeRe.FindStringSubmatch(text); m != nil {
		if m[3] != "" { // 7pm / 9am
			fmt.Sscanf(m[3], "%d", &hour)
			if strings.EqualFold(m[4], "pm") && hour != 12 {
				hour += 12
			}
			if strings.EqualFold(m[4], "am") && hour == 12 {
				hour = 0
			}
		} else { // 19:30 / 19h30 / 19h
			fmt.Sscanf(m[1], "%d", &hour)
			if m[2] != "" {
				fmt.Sscanf(m[2], "%d", &min)
			}
		}
		timeInferred = false
	}

	t := time.Date(day.Year(), day.Month(), day.Day(), hour, min, 0, 0, loc)
	// Roll year-less dates forward to their next future occurrence.
	for t.Before(ref.Add(-6 * time.Hour)) {
		t = t.AddDate(1, 0, 0)
		if t.After(ref.AddDate(2, 0, 0)) {
			break
		}
	}
	return t, timeInferred, nil
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
	stripped = timeRe.ReplaceAllString(stripped, "")
	stripped = strings.TrimSpace(stripped)
	return stripped == ""
}

// extractLocation returns a venue already written in the message. Empty when
// the announcement does not name a place — callers must not invent Đà Lạt.
func extractLocation(text string) string {
	m := locationRe.FindStringSubmatch(text)
	if m == nil {
		return ""
	}
	loc := strings.TrimSpace(m[1])
	if loc == "" || isDateOrTimeOnly(loc) || timeRe.MatchString(loc) {
		return ""
	}
	return loc
}

// toRow maps the draft onto the events table columns.
func (d *eventDraft) toRow(createdBy string) map[string]any {
	row := map[string]any{
		"slug":            d.Slug,
		"title":           d.Title,
		"description":     d.Description,
		"status":          "draft",
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
	meta := d.Meta
	if meta == nil {
		meta = map[string]any{}
	}
	if d.ExternalURL != "" {
		row["external_chat_url"] = d.ExternalURL
	} else if groupJID, _ := meta["group_jid"].(string); groupJID != "" {
		if msgID, _ := meta["message_id"].(string); msgID != "" {
			row["external_chat_url"] = "whatsapp:" + groupJID + "/" + msgID
		}
	}
	if d.ImageURL != "" {
		row["image_url"] = d.ImageURL
		row["image_alt"] = d.ImageAlt
	}
	meta["time_inferred"] = d.TimeInferred
	meta["needs_review"] = true
	meta["ingest_lane"] = "scout-review"
	row["source_metadata"] = meta
	return row
}
