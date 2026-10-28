package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type repostCandidate struct {
	ID             string         `json:"id"`
	Slug           string         `json:"slug"`
	Title          string         `json:"title"`
	Status         string         `json:"status"`
	StartsAt       time.Time      `json:"starts_at"`
	LocationName   string         `json:"location_name"`
	VenueID        string         `json:"venue_id"`
	SourceMetadata map[string]any `json:"source_metadata"`
	EndsAt         *time.Time     `json:"ends_at"`
	SeriesID       string         `json:"series_id"`
	ImageURL       string         `json:"image_url"`
	Venue          *struct {
		Name string `json:"name"`
	} `json:"venue"`
}

// seriesInstanceSlotTolerance: a post's start within this distance of a
// published series instance (or an overlapping window) is the same slot.
const seriesInstanceSlotTolerance = 60 * time.Minute

// venueGenericWords never distinguish one venue from another.
var venueGenericWords = map[string]bool{
	"coffee": true, "cafe": true, "caphe": true, "ca": true, "phe": true, "quan": true,
	"the": true, "dalat": true, "da": true, "lat": true, "bar": true, "restaurant": true,
	"tea": true, "studio": true, "vietnam": true, "lam": true, "dong": true,
}

// seriesVenueKey folds a venue name to its distinctive letters: "Socialhouse
// Coffee" and "Social House Dalat" both become "socialhouse".
func seriesVenueKey(name string) string {
	var b strings.Builder
	for _, word := range strings.Fields(normalizeTitleKey(normalizeVenueName(name))) {
		if venueGenericWords[word] {
			continue
		}
		b.WriteString(word)
	}
	return b.String()
}

func sameVenueKey(a, b string) bool {
	if len(a) < 4 || len(b) < 4 {
		return false
	}
	if a == b {
		return true
	}
	short, long := a, b
	if len(short) > len(long) {
		short, long = long, short
	}
	return len(short) >= 6 && strings.Contains(long, short)
}

// matchSeriesInstance returns the published recurring-series instance a
// WhatsApp post announces: same ICT date, same venue, and the same slot
// (start within an hour or overlapping windows). Titles are not compared:
// posts like "Event at Socialhouse Coffee" rarely repeat the series title.
func matchSeriesInstance(d *eventDraft, rows []repostCandidate) *repostCandidate {
	if d == nil || d.Cancelled || d.StartsAt.IsZero() {
		return nil
	}
	loc := mustLoc()
	day := d.StartsAt.In(loc).Format("2006-01-02")
	draftEnd := d.StartsAt.Add(2 * time.Hour)
	if d.EndsAt != nil && d.EndsAt.After(d.StartsAt) {
		draftEnd = *d.EndsAt
	}
	draftVenue := seriesVenueKey(d.Location)
	for i := range rows {
		r := &rows[i]
		if r.Status != "published" || r.SeriesID == "" || r.Slug == d.Slug {
			continue
		}
		if r.StartsAt.In(loc).Format("2006-01-02") != day {
			continue
		}
		rowEnd := r.StartsAt.Add(2 * time.Hour)
		if r.EndsAt != nil && r.EndsAt.After(r.StartsAt) {
			rowEnd = *r.EndsAt
		}
		delta := d.StartsAt.Sub(r.StartsAt)
		if delta < 0 {
			delta = -delta
		}
		overlap := d.StartsAt.Before(rowEnd) && r.StartsAt.Before(draftEnd)
		if delta > seriesInstanceSlotTolerance && !overlap {
			continue
		}
		if !sameSeriesVenue(d, draftVenue, r) {
			continue
		}
		return r
	}
	return nil
}

func sameSeriesVenue(d *eventDraft, draftVenue string, r *repostCandidate) bool {
	if d.VenueID != "" && r.VenueID != "" {
		return d.VenueID == r.VenueID
	}
	if draftVenue == "" {
		return false
	}
	names := []string{r.LocationName}
	if r.Venue != nil {
		names = append(names, r.Venue.Name)
	}
	for _, name := range names {
		if sameVenueKey(draftVenue, seriesVenueKey(name)) {
			return true
		}
	}
	return false
}

// matchRepost returns the existing event a new draft repeats: same normalized
// title, same start date in ICT, and the same venue when both sides know one.
// Only published events and open (not rejected) drafts count, and never the
// draft's own slug, so edits and follow-ups still update their row.
func matchRepost(d *eventDraft, rows []repostCandidate) *repostCandidate {
	if d == nil || d.Cancelled {
		return nil
	}
	key := normalizeTitleKey(d.Title)
	if key == "" {
		return nil
	}
	loc := mustLoc()
	day := d.StartsAt.In(loc).Format("2006-01-02")
	venue := normalizeTitleKey(normalizeVenueName(d.Location))
	for i := range rows {
		r := &rows[i]
		if r.Slug == d.Slug {
			continue
		}
		switch r.Status {
		case "published":
		case "draft":
			if reviewResult(&storedEvent{SourceMetadata: r.SourceMetadata}) == "rejected" {
				continue
			}
		default:
			continue
		}
		if normalizeTitleKey(r.Title) != key || r.StartsAt.In(loc).Format("2006-01-02") != day {
			continue
		}
		if d.VenueID != "" && r.VenueID != "" {
			if d.VenueID != r.VenueID {
				continue
			}
		} else if other := normalizeTitleKey(normalizeVenueName(r.LocationName)); venue != "" && other != "" && venue != other {
			continue
		}
		return r
	}
	return nil
}

// sameDayEvents lists published and draft events starting on the draft's ICT day.
func (s *supabaseClient) sameDayEvents(ctx context.Context, start time.Time) ([]repostCandidate, error) {
	loc := mustLoc()
	local := start.In(loc)
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	q := url.Values{
		"select": {"id,slug,title,status,starts_at,ends_at,series_id,image_url,location_name,venue_id,source_metadata,venue:venues(name)"},
		"status": {"in.(published,draft)"},
		"and":    {fmt.Sprintf("(starts_at.gte.%s,starts_at.lt.%s)", dayStart.UTC().Format(time.RFC3339), dayStart.Add(24*time.Hour).UTC().Format(time.RFC3339))},
		"limit":  {"500"},
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
		return nil, fmt.Errorf("same-day lookup: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	var rows []repostCandidate
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].Title = strings.TrimSpace(rows[i].Title)
	}
	return rows, nil
}
