package main

import (
	"testing"
	"time"
)

// Real post (wa-a5a7f2a31e2694b2dd271574701766d7, Oct 2026). The draft got
// 13:00–17:00 ICT because "GET 1 - 5pm" in the happy-hour line parsed as a
// 1–5 PM range. The DJs play 6–10 PM.
const techCircusCaption = "TECH CIRCUS !!!\nTHREE BEARS ARE COMING!\nThis Friday 23-Oct, three DJs, MOROK - WIJAYA - KETU are taking over the decks at Nghiêm Brewing.\nExpect a colorful journey through electronic sounds, a night that keeps moving, and a setting that makes you want to stay a little longer. 🖤\n📅 FRIDAY, OCTOBER 23\nHAPPY OUR> BUY 2 GET 1 - 5pm to 7pm\n🎧 Three Bears · 6–10 PM\n🍺 Bar opens at 3 PM · Closes at 11 PM\n📍 Nghiêm Brewing · Đà Lạt\n📌 Find us here\nOur spot. Their sound. Your Friday night. 🔥\n\nhttps://www.facebook.com/share/p/19yfwEa9UB/"

func TestTechCircusPrefersMainActRange(t *testing.T) {
	ref := time.Date(2026, 10, 21, 9, 0, 0, 0, time.UTC)
	start, end, inferred, err := extractSchedule([]string{techCircusCaption}, testLoc, ref)
	if err != nil {
		t.Fatal(err)
	}
	if want := time.Date(2026, 10, 23, 11, 0, 0, 0, time.UTC); !start.Equal(want) {
		t.Fatalf("start=%s want %s", start.UTC(), want)
	}
	if end == nil || !end.Equal(time.Date(2026, 10, 23, 15, 0, 0, 0, time.UTC)) {
		t.Fatalf("end=%v want 15:00Z", end)
	}
	if inferred {
		t.Fatal("explicit times must not be time_inferred")
	}
}

func TestFindClockLineContext(t *testing.T) {
	cases := []struct {
		text  string
		h, eh int
	}{
		{"HAPPY OUR> BUY 2 GET 1 - 5pm to 7pm", 17, 19},
		{"Buy 1 get 1 - 5pm to 7pm", 17, 19},
		{"Bar opens at 3 PM · Closes at 11 PM\n🎧 DJ set 6–10 PM", 18, 22},
		{"Happy hour 5-7pm\nLive music 8-11pm", 20, 23},
		{"Doors 5pm-11pm\nShow 7:30pm-9pm", 19, 21},
		{"Party 7pm-11pm\nHappy hour 5-7pm", 19, 23},
		{"🍺 Bar 3pm–11pm only", 15, 23},
	}
	for _, c := range cases {
		got, ok := findClock(c.text)
		if !ok || got.hour != c.h || !got.hasEnd || got.endHour != c.eh {
			t.Errorf("%q: got %+v ok=%v want %d-%d", c.text, got, ok, c.h, c.eh)
		}
	}
}
