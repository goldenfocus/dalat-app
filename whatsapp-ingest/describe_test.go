package main

import (
	"strings"
	"testing"
	"time"
)

func TestCleanFactsDropsContacts(t *testing.T) {
	got := cleanFacts("Fire & Beer Night\nFRI OCT 9 FROM 6PM\nEntry 50k\nContact Minh: 0912 345 678\nCall +84 912345678 to book @minh_dl\nDM me")
	for _, bad := range []string{"0912", "84 912", "Minh", "@minh", "DM me"} {
		if strings.Contains(got, bad) {
			t.Fatalf("kept %q in %q", bad, got)
		}
	}
	for _, want := range []string{"FRI OCT 9 FROM 6PM", "Entry 50k", "Fire & Beer Night"} {
		if !strings.Contains(got, want) {
			t.Fatalf("lost %q in %q", want, got)
		}
	}
}

func TestComposeDescriptionAddsFlyer(t *testing.T) {
	got := composeDescription("Ride this Tuesday!", "RIDING TUESDAY\n13 OCTOBER 7AM\nMeet at Lam Vien Square\nHotline 0909 111 222")
	if !strings.Contains(got, "13 OCTOBER 7AM") || strings.Contains(got, "0909") {
		t.Fatalf("got %q", got)
	}
}

func TestMatchRepost(t *testing.T) {
	loc := mustLoc()
	start := time.Date(2026, 10, 9, 18, 0, 0, 0, loc)
	d := &eventDraft{Slug: "wa-new", Title: "FIRE & BEER NIGHTS 🔥", StartsAt: start, Location: "Nghiêm Brewing Đà Lạt"}
	rows := []repostCandidate{
		{Slug: "wa-old-rejected", Title: "Fire & Beer Nights", Status: "draft", StartsAt: start, SourceMetadata: map[string]any{"review_result": "rejected"}},
		{Slug: "wa-other-day", Title: "Fire & Beer Nights", Status: "published", StartsAt: start.Add(24 * time.Hour)},
		{Slug: "wa-other-venue", Title: "Fire & Beer Nights", Status: "published", StartsAt: start, LocationName: "Somewhere Else"},
	}
	if m := matchRepost(d, rows); m != nil {
		t.Fatalf("unexpected match %s", m.Slug)
	}
	rows = append(rows, repostCandidate{Slug: "wa-a55", Title: "Fire & Beer Nights", Status: "published", StartsAt: start.Add(-time.Hour), LocationName: "Nghiêm Brewing Đà Lạt"})
	if m := matchRepost(d, rows); m == nil || m.Slug != "wa-a55" {
		t.Fatalf("want wa-a55, got %v", m)
	}
	d.Slug = "wa-a55"
	if m := matchRepost(d, rows); m != nil {
		t.Fatal("own slug must not match")
	}
}

func TestCleanFactsKeepsFromLine(t *testing.T) {
	if got := cleanFacts("From 6PM\nPrice: 100.000đ"); got != "From 6PM\nPrice: 100.000đ" {
		t.Fatalf("got %q", got)
	}
}
