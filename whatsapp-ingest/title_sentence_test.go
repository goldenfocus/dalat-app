package main

import (
	"strings"
	"testing"
	"time"
)

// Real posts, Oct 23 2026. Both became drafts titled with a chat sentence:
// "Sunday is coming soon, which means it's time to rustle some" (Vui Vá,
// wa-ac31d75fad8b1d7cd983ac432a5e78f8) and "Looking forward to seeing
// everyone tomorrow!" (ThichnMore, wa-3ac2032902fe9b624dc3).
const (
	sketchCaption25   = "Sunday is coming soon, which means it's time to rustle some paper, draw, and pose!\n​Join us at Vui Va Cafe on 25 of October at 10:30 AM. It's going to be cozy ✨\n​No drawing skills required, everyone is welcome! DM me to reserve your spot ❤️\n​Price: Free entry, but please order at least one drink ☕"
	thichnMoreCaption = "Hi everyone! ☀️\n\nThe weather has been lovely lately, and as always, it’s time for our little gathering again! We’ll meet up tomorrow, and this time I’d love to introduce you to a cute little local café in Da Lat with great drinks - ThichnMore Café. ☕️\n\nhttps://maps.app.goo.gl/WSrGNAR6r7oqtjSM6?g_st=ic\n\nAfter that, we’ll head out for lunch together. I’ll update the lunch spot later once it’s confirmed.\n\nLooking forward to seeing everyone tomorrow! 🩵😇"
)

func TestChatSentenceTitles(t *testing.T) {
	for _, s := range []string{
		"Sunday is coming soon, which means it's time to rustle some",
		"Looking forward to seeing everyone tomorrow! 🩵😇",
		"Saturday is almost here",
		"Don’t miss our biggest night of the year",
		"Thank you all for coming last week",
		"Fresh coffee, good music and",
		"We are hosting a little get together at the cafe, bring friends",
	} {
		if !isChatSentenceTitle(s) {
			t.Errorf("want chat sentence: %q", s)
		}
	}
	for _, s := range []string{
		"Weekend Sketch Club", "TECH CIRCUS !!!", "D.L.T. Techno party", "Kids’ Dance Workshop",
		"Timeless Jazz Night", "MUSIC AND BRIDGES between the Visible and Invisible Worlds",
		"Văn Mai Hương Live in DaLat | 24.10.2026 tại La Maritza", "Đêm nhạc acoustic cuối tuần tại quán cà phê Mây",
		"The Symbiotic Circle: Sound Healing & Breathwork", "Coffee Meetup at ThichnMore Café",
	} {
		if isChatSentenceTitle(s) {
			t.Errorf("not a chat sentence: %q", s)
		}
	}
}

func TestRealCaptionsNeverGetSentenceTitles(t *testing.T) {
	sent := time.Date(2026, 10, 23, 18, 16, 0, 0, testLoc)
	sk, _ := decide(inbound{ID: "AC31D75FAD8B1D7CD983AC432A5E78F8", GroupJID: "g", GroupName: "Events & Offers", Sender: "138612284854463@lid", Text: sketchCaption25, Timestamp: sent}, nil, nil, sent)
	if sk == nil {
		t.Fatal("sketch: no draft")
	}
	if isChatSentenceTitle(sk.Title) || strings.Contains(sk.Title, "rustle") || sk.Meta["title_needs_review"] != true {
		t.Fatalf("sketch title %q meta %v", sk.Title, sk.Meta["title_needs_review"])
	}
	if sk.Title != "Event at Vui Va Cafe" {
		t.Fatalf("sketch placeholder %q", sk.Title)
	}

	sent = time.Date(2026, 10, 23, 7, 43, 0, 0, testLoc)
	th, _ := decide(inbound{ID: "3AC2032902FE9B624DC3", GroupJID: "g", GroupName: "Coffee Meetups & More", Sender: "105158432301057@lid", Text: thichnMoreCaption, Timestamp: sent}, nil, nil, sent)
	if th == nil {
		t.Fatal("thichnmore: no draft")
	}
	if isChatSentenceTitle(th.Title) || strings.Contains(th.Title, "Looking forward") || th.Meta["title_needs_review"] != true {
		t.Fatalf("thichnmore title %q meta %v", th.Title, th.Meta["title_needs_review"])
	}
	if !strings.HasPrefix(th.Title, "Gathering") {
		t.Fatalf("thichnmore placeholder %q", th.Title)
	}
}

func TestSeriesTitleFromSameSender(t *testing.T) {
	sent := time.Date(2026, 10, 23, 18, 16, 0, 0, testLoc)
	d, _ := decide(inbound{ID: "AC31", GroupJID: "g", GroupName: "Events & Offers", Sender: "138612284854463@lid", Text: sketchCaption25, Timestamp: sent}, nil, nil, sent)
	if d == nil {
		t.Fatal("no draft")
	}
	last := seriesEvent{
		Slug: "weekend-sketch-club-vui-va-2026-10-18", Title: "Weekend Sketch Club",
		StartsAt: time.Date(2026, 10, 18, 3, 30, 0, 0, time.UTC), LocationName: "Vui Vá Cafe & Creative Space",
		Evidence: sketchCaption, // last week's caption, same text, different date
	}
	unrelated := seriesEvent{Slug: "jazz", Title: "Timeless Jazz Night", StartsAt: time.Date(2026, 10, 10, 13, 0, 0, 0, time.UTC), LocationName: "Elsewhere", Evidence: "Jazz all night long with the trio, come early for seats please"}
	if slug := applySeriesTitle(d, []seriesEvent{unrelated, last}); slug != last.Slug || d.Title != "Weekend Sketch Club" {
		t.Fatalf("series: slug=%q title=%q", slug, d.Title)
	}
	if d.Meta["title_needs_review"] != nil || d.Meta["series_of"] != last.Slug {
		t.Fatalf("meta %v", d.Meta)
	}

	// Named in the caption.
	d2 := &eventDraft{Title: "Event at Vui Va Cafe", Description: "Weekend sketch club is back! Sunday 10:30", Meta: map[string]any{"title_needs_review": true}}
	if applySeriesTitle(d2, []seriesEvent{{Slug: "s", Title: "Weekend Sketch Club", Evidence: "x"}}) != "s" {
		t.Fatalf("named: %q", d2.Title)
	}

	// Same venue and weekly slot, title still needs review.
	d3 := &eventDraft{Title: "Event at Vui Va Cafe", Location: "Vui Va Cafe", StartsAt: time.Date(2026, 11, 1, 3, 30, 0, 0, time.UTC), Description: "Bring paper!", Meta: map[string]any{"title_needs_review": true}}
	if applySeriesTitle(d3, []seriesEvent{last}) != last.Slug {
		t.Fatalf("slot: %q", d3.Title)
	}

	// A good title is not overwritten by a different event from the sender.
	d4 := &eventDraft{Title: "Life Drawing Marathon", Location: "Vui Va Cafe", StartsAt: time.Date(2026, 11, 1, 3, 30, 0, 0, time.UTC), Description: "Life Drawing Marathon, 6 hours of poses", Meta: map[string]any{}}
	if applySeriesTitle(d4, []seriesEvent{last}) != "" || d4.Title != "Life Drawing Marathon" {
		t.Fatalf("kept: %q", d4.Title)
	}
}
