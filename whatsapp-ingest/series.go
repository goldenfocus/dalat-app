package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
)

// seriesEvent is an earlier event from the same WhatsApp sender, used to keep
// the name of a recurring event ("Weekend Sketch Club" every Sunday at Vui Vá).
type seriesEvent struct {
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	StartsAt     time.Time `json:"starts_at"`
	LocationName string    `json:"location_name"`
	VenueID      string    `json:"venue_id"`
	Evidence     string    `json:"evidence"`
}

// senderSeries lists the sender's published events from the last 120 days,
// newest first.
func (s *supabaseClient) senderSeries(ctx context.Context, sender string, before time.Time) ([]seriesEvent, error) {
	if strings.TrimSpace(sender) == "" {
		return nil, nil
	}
	q := url.Values{
		"select":                   {"slug,title,starts_at,location_name,venue_id,evidence:source_metadata->>source_text_evidence"},
		"status":                   {"eq.published"},
		"source_metadata->>sender": {"eq." + sender},
		"and":                      {fmt.Sprintf("(starts_at.gte.%s,starts_at.lt.%s)", before.Add(-120*24*time.Hour).UTC().Format(time.RFC3339), before.UTC().Format(time.RFC3339))},
		"order":                    {"starts_at.desc"},
		"limit":                    {"30"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+"/rest/v1/events?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	s.authHeaders(req)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("series lookup: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	var rows []seriesEvent
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// applySeriesTitle reuses the name of the sender's recurring event when
//   - the caption or flyer text names it, or
//   - the caption is the same announcement as last time with only the date
//     changed, or
//   - the title still needs review and the event repeats at the same venue on
//     the same weekday and clock time.
//
// It returns the series slug it matched.
func applySeriesTitle(d *eventDraft, priors []seriesEvent) string {
	text := sourceCaption(d.Description) + "\n" + d.ReadableText
	normText := normalizeSeriesText(text)
	needsReview := d.Meta["title_needs_review"] == true || isChatSentenceTitle(d.Title)
	loc := mustLoc()
	for _, p := range priors {
		title := strings.TrimSpace(p.Title)
		if title == "" || isChatSentenceTitle(title) || weakTitle(title) || strings.HasPrefix(strings.ToLower(title), "event at ") {
			continue
		}
		named := len(strings.Fields(title)) >= 2 && strings.Contains(normText, normalizeSeriesText(title))
		sameText := p.Evidence != "" && seriesSimilarity(normText, normalizeSeriesText(p.Evidence)) >= 0.8
		sameSlot := needsReview && seriesSameVenue(d, p) && sameWeeklySlot(d.StartsAt.In(loc), p.StartsAt.In(loc))
		if named || sameText || sameSlot {
			d.Title = title
			delete(d.Meta, "title_needs_review")
			d.Meta["series_of"] = p.Slug
			linkSeriesVenue(d, p, sameText)
			return p.Slug
		}
	}
	return ""
}

// linkSeriesVenue gives a series match the venue of the earlier event when the
// draft has none, as long as the draft's own location does not point elsewhere.
func linkSeriesVenue(d *eventDraft, p seriesEvent, sameText bool) {
	if d.VenueID != "" || strings.TrimSpace(p.VenueID) == "" {
		return
	}
	if strings.TrimSpace(d.Location) != "" && !sameText && !seriesSameVenue(d, p) {
		return
	}
	d.VenueID = p.VenueID
	if strings.TrimSpace(d.Location) == "" {
		d.Location = p.LocationName
	}
}

// normalizeSeriesText lowercases, drops digits, punctuation and emoji, and
// folds Vietnamese diacritics so "Vui Vá" == "Vui Va".
func normalizeSeriesText(s string) string {
	s = foldDiacritics(strings.ToLower(s))
	var b strings.Builder
	space := true
	for _, r := range s {
		if unicode.IsLetter(r) {
			b.WriteRune(r)
			space = false
		} else if !space {
			b.WriteByte(' ')
			space = true
		}
	}
	return strings.TrimSpace(b.String())
}

func foldDiacritics(s string) string {
	const from = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ"
	const to = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd"
	fr, tr := []rune(from), []rune(to)
	m := make(map[rune]rune, len(fr))
	for i, r := range fr {
		m[r] = tr[i]
	}
	return strings.Map(func(r rune) rune {
		if v, ok := m[r]; ok {
			return v
		}
		return r
	}, s)
}

// seriesSimilarity is the word-set Jaccard index of two normalized texts.
func seriesSimilarity(a, b string) float64 {
	wa, wb := map[string]bool{}, map[string]bool{}
	for _, w := range strings.Fields(a) {
		wa[w] = true
	}
	for _, w := range strings.Fields(b) {
		wb[w] = true
	}
	if len(wa) < 5 || len(wb) < 5 {
		return 0
	}
	inter := 0
	for w := range wa {
		if wb[w] {
			inter++
		}
	}
	return float64(inter) / float64(len(wa)+len(wb)-inter)
}

func seriesSameVenue(d *eventDraft, p seriesEvent) bool {
	if d.VenueID != "" && p.VenueID != "" {
		return d.VenueID == p.VenueID
	}
	a, b := normalizeSeriesText(d.Location), normalizeSeriesText(p.LocationName)
	if a == "" || b == "" {
		return false
	}
	return strings.HasPrefix(b, a) || strings.HasPrefix(a, b)
}

func sameWeeklySlot(a, b time.Time) bool {
	return a.Weekday() == b.Weekday() && a.Hour() == b.Hour() && a.Minute() == b.Minute()
}
