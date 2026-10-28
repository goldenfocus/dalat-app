package main

import (
	"testing"
	"time"
)

// Review found wa-3a1ed7fe81ad8773c956 ("Event at Socialhouse Coffee", Wed 28
// Oct 18:00-20:00 ICT) drafted beside the published weekly series instance
// language-exchange-social-house-z8oc-20261028.
func TestMatchSeriesInstanceSocialhouse(t *testing.T) {
	loc := mustLoc()
	start := time.Date(2026, 10, 28, 18, 0, 0, 0, loc)
	end := start.Add(2 * time.Hour)
	d := &eventDraft{Slug: "wa-3a1ed7fe81ad8773c956", Title: "Event at Socialhouse Coffee", StartsAt: start, EndsAt: &end, Location: "Socialhouse Coffee"}
	instance := repostCandidate{
		Slug:         "language-exchange-social-house-z8oc-20261028",
		Title:        "Language Exchange @ Social House",
		Status:       "published",
		SeriesID:     "ad0a0c5e-f718-447c-89f1-6fa3b78e3c52",
		StartsAt:     start,
		EndsAt:       &end,
		LocationName: "184 Đ. Tô Ngọc Vân, Xuân Hương - Đà Lạt, Lâm Đồng 66122, Vietnam",
		VenueID:      "436f8b46-d5fe-41ef-8245-e8ffb9ee7980",
		Venue: &struct {
			Name string `json:"name"`
		}{Name: "Social House Dalat"},
	}
	if m := matchRepost(d, []repostCandidate{instance}); m != nil {
		t.Fatalf("title-based repost check should not be what matches this; got %s", m.Slug)
	}
	if m := matchSeriesInstance(d, []repostCandidate{instance}); m == nil || m.Slug != instance.Slug {
		t.Fatalf("want series instance match, got %v", m)
	}

	// Same venue id wins even with an unrelated location string.
	d2 := *d
	d2.VenueID = instance.VenueID
	d2.Location = "Tô Ngọc Vân"
	if m := matchSeriesInstance(&d2, []repostCandidate{instance}); m == nil {
		t.Fatal("same venue id should match")
	}
}

func TestMatchSeriesInstanceRejectsDifferentSlotVenueOrNonSeries(t *testing.T) {
	loc := mustLoc()
	start := time.Date(2026, 10, 28, 18, 0, 0, 0, loc)
	end := start.Add(2 * time.Hour)
	base := repostCandidate{Slug: "inst", Status: "published", SeriesID: "s1", StartsAt: start, EndsAt: &end, LocationName: "Social House Dalat"}
	d := &eventDraft{Slug: "wa-x", Title: "Event at Socialhouse Coffee", StartsAt: start, Location: "Socialhouse Coffee"}

	cases := map[string]repostCandidate{}
	notSeries := base
	notSeries.SeriesID = ""
	cases["not a series instance"] = notSeries
	draft := base
	draft.Status = "draft"
	cases["unpublished instance"] = draft
	later := base
	later.StartsAt = start.Add(3 * time.Hour)
	laterEnd := later.StartsAt.Add(2 * time.Hour)
	later.EndsAt = &laterEnd
	cases["different slot"] = later
	other := base
	other.LocationName = "Nghiêm Brewing Đà Lạt"
	cases["different venue"] = other
	nextDay := base
	nextDay.StartsAt = start.Add(24 * time.Hour)
	cases["different date"] = nextDay
	for name, row := range cases {
		if m := matchSeriesInstance(d, []repostCandidate{row}); m != nil {
			t.Errorf("%s: unexpected match %s", name, m.Slug)
		}
	}

	// A 30-minute offset still counts as the same slot (18:00 post vs 18:30 instance).
	shifted := base
	shifted.StartsAt = start.Add(30 * time.Minute)
	if m := matchSeriesInstance(d, []repostCandidate{shifted}); m == nil {
		t.Error("30-minute offset should match")
	}
}

func TestSeriesVenueKey(t *testing.T) {
	for _, c := range [][2]string{
		{"Socialhouse Coffee", "socialhouse"},
		{"Social House Dalat", "socialhouse"},
		{"The Married Beans Cafe", "marriedbeans"},
	} {
		if got := seriesVenueKey(c[0]); got != c[1] {
			t.Errorf("seriesVenueKey(%q) = %q, want %q", c[0], got, c[1])
		}
	}
	if sameVenueKey("bar", "bar") {
		t.Error("too-short keys must not match")
	}
}
