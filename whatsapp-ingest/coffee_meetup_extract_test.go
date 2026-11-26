package main

import (
	"strings"
	"testing"
	"time"
)

// Real source_text_evidence from draft wa-3be9a4851e73b0d30ae8
// (id a146508b-bd8a-48bf-9cf1-f854067b5a01), shared 2026-11-26 07:10:37Z.
const saturdayCoffeeMeetupEvidence = `As this week's host of this Saturday's Coffee Meetup, I invite all you coffee and lovely time lovers at 10:00 @ Rừng Na Ui https://maps.app.goo.gl/1SKj3RKN8BmZVbjp8 . A place with great views, a laid back vibe, where you will find one of the best Egg Coffees in Da Lat and for sure the most amazing Egg Cocoa. Also can find Brûlée Egg Coffee and Cocoa.

I will be there from 09:30 to greet you all, and then at 12:30 we will have lunch at Lẩu Gà Rau Lỗ Bình
https://maps.app.goo.gl/RMxUdzG2ouifUmRN6 (Where we will be serving together delicious Chicken Hot Pot with Lobelia a refreshing wild mountain green native to Vietnam's Northwest and Central Highlands))`

func TestSaturdayCoffeeMeetupExtraction(t *testing.T) {
	text := saturdayCoffeeMeetupEvidence

	name, _ := extractLocation(text)
	if name != "Rừng Na Ui" {
		t.Fatalf("venue=%q, want Rừng Na Ui (not the lunch stop)", name)
	}

	ref := time.Date(2026, 11, 26, 7, 10, 37, 0, time.UTC)
	start, end, inferred, err := extractSchedule([]string{text}, testLoc, ref)
	if err != nil {
		t.Fatal(err)
	}
	got := start.In(testLoc)
	if inferred || got.Year() != 2026 || got.Month() != time.November || got.Day() != 28 || got.Hour() != 10 || got.Minute() != 0 {
		t.Fatalf("start=%s inferred=%v, want 2026-11-28 10:00 ICT", got, inferred)
	}
	if end != nil {
		t.Fatalf("end=%s, want none (lunch is not the meetup end)", end.In(testLoc))
	}

	if isChatSentenceTitle("Saturday's Coffee Meetup") || isChatSentenceTitle("Saturday Coffee Meetup") {
		t.Fatal("possessive weekday title must not be flagged as a chat sentence")
	}
	if !isChatSentenceTitle("Saturday is almost here") {
		t.Fatal("Saturday is … should still be a chat sentence")
	}
	if got := normalizePossessiveWeekday("Saturday's Coffee Meetup"); got != "Saturday Coffee Meetup" {
		t.Fatalf("normalize=%q", got)
	}
	if got := chooseTitle(text, "", "", false); got != "Saturday Coffee Meetup" {
		t.Fatalf("title=%q, want Saturday Coffee Meetup", got)
	}
}

func TestSaturdayCoffeeMeetupPrefersAtPinOverLunch(t *testing.T) {
	if got := atVenue("Meet at 10:00 @ Rừng Na Ui, then lunch at Lẩu Gà Rau Lỗ Bình"); got != "Rừng Na Ui" {
		t.Fatalf("atVenue=%q", got)
	}
	// Without an @ pin, the place on the start-time line still beats a later lunch.
	if got := atVenue("I invite you at 10:00 at Rừng Na Ui.\nThen at 12:30 we will have lunch at Lẩu Gà Rau Lỗ Bình"); got != "Rừng Na Ui" {
		t.Fatalf("start-line venue=%q", got)
	}
}

func TestHostArrivalLosesToInviteTime(t *testing.T) {
	c, ok := findClock("I invite you at 10:00. I will be there from 09:30 to greet you all.")
	if !ok || c.hour != 10 || c.minute != 0 || c.hostArrival {
		t.Fatalf("clock=%d:%02d arrival=%v ok=%v, want 10:00 invite", c.hour, c.minute, c.hostArrival, ok)
	}
	c, ok = findClock("I'll arrive at 8:00. Setup at 8:30. Doors for host at 8:45. We start at 10:00.")
	if !ok || c.hour != 10 || c.hostArrival {
		t.Fatalf("clock=%d:%02d arrival=%v, want 10:00", c.hour, c.minute, c.hostArrival)
	}
}

func TestSaturdayCoffeeMeetupReusesSeriesName(t *testing.T) {
	d := &eventDraft{
		Title:       chooseTitle(saturdayCoffeeMeetupEvidence, "", "", false),
		Location:    "Rừng Na Ui",
		Description: saturdayCoffeeMeetupEvidence,
		StartsAt:    time.Date(2026, 11, 28, 3, 0, 0, 0, time.UTC),
		Meta:        map[string]any{},
	}
	last := seriesEvent{
		Slug:         "wa-prior-coffee",
		Title:        "Saturday Coffee Meetup",
		LocationName: "Rừng Na Ui",
		StartsAt:     time.Date(2026, 11, 21, 3, 0, 0, 0, time.UTC),
		Evidence:     "Join this Saturday's Coffee Meetup at 10:00 @ Rừng Na Ui",
	}
	if slug := applySeriesTitle(d, []seriesEvent{last}); slug != last.Slug {
		t.Fatalf("series slug=%q title=%q", slug, d.Title)
	}
	if d.Title != "Saturday Coffee Meetup" {
		t.Fatalf("title=%q", d.Title)
	}
}

func TestFirstMapsLinkIsMeetupPlace(t *testing.T) {
	if got := firstMapsLink(saturdayCoffeeMeetupEvidence); !strings.Contains(got, "1SKj3RKN8BmZVbjp8") {
		t.Fatalf("first maps link=%q", got)
	}
}
