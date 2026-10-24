package main

import (
	"testing"
	"time"
)

const danceNightCaption = `Hey everyone! 😊
Just a reminder that we are hosting another Saturday Dance Night at INN tonight as it went so well last week.

🕕 6:00 PM — Drinks, music & social time
💃 6:30–7:30 PM — Dance class
🪩 7:30 PM onwards — Social dancing & party

Everyone is welcome!
No experience needed so just come along, have some fun, meet new people, and enjoy a bit of dancing! 🥳

📍 INN Đà Lạt
48/8 Hà Huy Tập, Da Lat

Hope to see some of you there tonight!`

func TestScheduleLines(t *testing.T) {
	for _, l := range []string{
		"6:30–7:30 PM — Dance class", "💃 6:30–7:30 PM — Dance class", "🕕 6:00 PM — Drinks, music & social time",
		"🪩 7:30 PM onwards — Social dancing & party", "18h-19h: Yoga", "7pm - Open mic", "19h30 • Live music",
		"From 8pm: DJ set", "10:00 - 12:00 Workshop: pottery", "Dance class — 6:30–7:30 PM: warmup",
	} {
		if !isScheduleLine(l) {
			t.Errorf("not caught: %q", l)
		}
	}
	for _, l := range []string{
		"Dance Night at INN Đà Lạt", "Dance Night with Jess & Matt", "Weekend Sketch Club", "TECH CIRCUS | Da Lat",
		"24/7 Hackathon", "Jazz Night", "Open Mic Night: Vol. 3", "Lễ hội 2026",
	} {
		if isScheduleLine(l) {
			t.Errorf("false positive: %q", l)
		}
	}
}

func TestDanceNightTitleFromSeries(t *testing.T) {
	sent := time.Date(2026, 10, 24, 15, 0, 0, 0, testLoc)
	d, _ := decide(inbound{ID: "AC793", GroupJID: "g", GroupName: "Events & Offers", Sender: "203809217372383@lid", Text: danceNightCaption, Timestamp: sent}, nil, nil, sent)
	if d == nil {
		t.Fatal("no draft")
	}
	if isScheduleLine(d.Title) {
		t.Fatalf("schedule line chosen as title: %q", d.Title)
	}
	d.Location, d.VenueID = "INN Đà Lạt", "0ce293dc-a0f0-4668-a234-09d191fe8534"
	// The picker settles on "Saturday Dance Night"; the series names it properly.
	last := seriesEvent{
		Slug: "dance-night-jess-matt-inn-da-lat-2026-10-17", Title: "Dance Night with Jess & Matt",
		StartsAt: time.Date(2026, 10, 17, 11, 30, 0, 0, time.UTC), LocationName: "INN Đà Lạt",
		VenueID: "0ce293dc-a0f0-4668-a234-09d191fe8534", Evidence: "Dance night with Jess and Matt at INN, class then social dancing",
	}
	if slug := applySeriesTitle(d, []seriesEvent{last}); slug != last.Slug || d.Title != "Dance Night at INN Đà Lạt" {
		t.Fatalf("series: slug=%q title=%q", slug, d.Title)
	}
	// Different venue: no core match.
	d2 := &eventDraft{Title: "Event at Elsewhere", Location: "Elsewhere", Description: "Dance night tonight!", Meta: map[string]any{"title_needs_review": true}}
	if applySeriesTitle(d2, []seriesEvent{last}) != "" {
		t.Fatalf("matched elsewhere: %q", d2.Title)
	}
}
