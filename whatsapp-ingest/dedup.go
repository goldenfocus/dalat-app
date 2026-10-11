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
		"select": {"id,slug,title,status,starts_at,location_name,venue_id,source_metadata"},
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
