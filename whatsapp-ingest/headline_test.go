package main

import (
	"testing"
	"time"
)

const vcafeCaption = "🍹🎶Bring your favourite people, order another round and make your night of it! 😉\n🎸 🎤 Wednesday night, 7pm, two incredible artists, Peter and Ernest, Dalat resident will play an Acoustic Music at VCafe"

func TestIsFluffTitle(t *testing.T) {
	fluff := []string{
		"🍹🎶Bring your favourite people, order another round and make your night of it! 😉",
		"🔥🔥🔥🎉🎉",
		"Don't miss it!!! 🎶",
		"Join us this weekend for good vibes",
	}
	for _, s := range fluff {
		if !isFluffTitle(s) {
			t.Errorf("want fluff: %q", s)
		}
	}
	real := []string{
		"Acoustic Music Night: Peter O'Rance & Ernest",
		"Sunday canyon ride",
		"Đêm nhạc Trịnh tại Mây Lang Thang",
		"🎷 Jazz at the Lake",
	}
	for _, s := range real {
		if isFluffTitle(s) {
			t.Errorf("want title: %q", s)
		}
	}
}

func TestChooseTitlePrefersFlyerHeadlineOverFluff(t *testing.T) {
	readable := "ACOUSTIC MUSIC NIGHT\nPeter O'Rance & Ernest\nWED 14 OCT\n7PM–9PM\nVCafe, 17 Bùi Thị Xuân"
	if got := chooseTitle(vcafeCaption, "Acoustic Music Night: Peter O'Rance & Ernest", readable, true); got != "Acoustic Music Night: Peter O'Rance & Ernest" {
		t.Fatalf("llm title: got %q", got)
	}
	if got := chooseTitle(vcafeCaption, "", readable, true); got != "ACOUSTIC MUSIC NIGHT" {
		t.Fatalf("readable headline: got %q", got)
	}
	// No flyer: skip the fluff line, take the next substantive caption line.
	if got := chooseTitle(vcafeCaption, "", "", false); got == "" || isFluffTitle(got) || got[0:4] == "🍹" {
		t.Fatalf("caption fallback: got %q", got)
	}
	// A real caption title still wins over the flyer.
	if got := chooseTitle("Sunday canyon ride\ntomorrow 7am", "", "SOMETHING ELSE", true); got != "Sunday canyon ride" {
		t.Fatalf("caption title: got %q", got)
	}
}

func TestExtractScheduleTakesEndFromFlyerRange(t *testing.T) {
	loc := mustLoc()
	ref := time.Date(2026, 10, 13, 20, 37, 0, 0, loc) // Tuesday evening
	for _, dash := range []string{"–", "-", "—"} {
		flyer := "ACOUSTIC MUSIC NIGHT\nWED 14 OCT\n7PM" + dash + "9PM"
		start, end, inferred, err := extractSchedule([]string{vcafeCaption, flyer}, loc, ref)
		if err != nil {
			t.Fatal(err)
		}
		if inferred || start.Hour() != 19 || start.Day() != 14 {
			t.Fatalf("dash %q start=%s inferred=%v", dash, start, inferred)
		}
		if end == nil || end.In(loc).Hour() != 21 || !end.UTC().Equal(time.Date(2026, 10, 14, 14, 0, 0, 0, time.UTC)) {
			t.Fatalf("dash %q end=%v", dash, end)
		}
	}
	// Flyer range alone.
	_, end, _, err := extractSchedule([]string{"Acoustic night", "WED 14 OCT 7PM–9PM"}, loc, ref)
	if err != nil || end == nil || end.In(loc).Hour() != 21 {
		t.Fatalf("flyer-only end=%v err=%v", end, err)
	}
}

func TestDecideVCafeFlyer(t *testing.T) {
	png := testFlyerPNG(t)
	loc := mustLoc()
	now := time.Date(2026, 10, 13, 20, 37, 0, 0, loc)
	readable := "ACOUSTIC MUSIC NIGHT\nPeter O'Rance & Ernest\nWED 14 OCT\n7PM–9PM\nVCafe, 17 Bùi Thị Xuân, Đà Lạt"
	ex := &fakeExtractor{result: extractResult{
		IsEvent: true, IsEventFlyer: true, FromImage: true, ImageKind: "flyer",
		Title: "", ReadableText: readable,
	}}
	d, err := decide(inbound{
		ID: "VC1", GroupJID: "g", GroupName: "Events & Offers", Sender: "s",
		Text: vcafeCaption, Timestamp: now, HasImage: true, Image: png, ImageMIME: "image/png",
	}, nil, ex, now)
	if err != nil {
		t.Fatal(err)
	}
	if d.Title != "ACOUSTIC MUSIC NIGHT" {
		t.Fatalf("title=%q", d.Title)
	}
	if d.EndsAt == nil || !d.EndsAt.UTC().Equal(time.Date(2026, 10, 14, 14, 0, 0, 0, time.UTC)) {
		t.Fatalf("ends=%v", d.EndsAt)
	}
}

const kidsDanceCaption = "Hey everyone! 😊💃\nMatt and I are hosting a Kids’ Dance Workshop tonight at INN Đà Lạt, and we’d love to welcome some little movers from the community! ❤️\n\n✨ Move, Play & Dance!\nA fun, playful session where kids can explore movement.\n📅 Tonight (Wednesday)\n⏰ 6:30–7:30 PM\n📍 INN Đà Lạt — 48/8 Hà Huy Tập"

func TestGreetingLinesAreFluff(t *testing.T) {
	for _, s := range []string{"Hey everyone! 😊💃", "Hi all", "Hello friends!", "Xin chào", "Chào mọi người 👋", "Hi everyone,", "Good morning Dalat fam!", "Hello lovely people of Dalat"} {
		if !isFluffTitle(s) {
			t.Errorf("want greeting fluff: %q", s)
		}
	}
	for _, s := range []string{"Hello Kitty Party", "Hi-Fi Listening Night", "Chào Xuân 2027 Festival"} {
		if isFluffTitle(s) {
			t.Errorf("want title: %q", s)
		}
	}
}

func TestHeuristicTitleKidsDance(t *testing.T) {
	if got := chooseTitle(kidsDanceCaption, "", "", false); got != "Kids’ Dance Workshop" {
		t.Fatalf("got %q", got)
	}
	if got := heuristicTitle("Hi all!\n🎶 Jazz Night at the Lake\nFriday 8pm"); got != "Jazz Night at the Lake" {
		t.Fatalf("short event line: got %q", got)
	}
	if got := heuristicTitle("Xin chào cả nhà\nĐêm nhạc Trịnh tối thứ Bảy\n20h"); got != "Đêm nhạc Trịnh tối thứ Bảy" {
		t.Fatalf("vi: got %q", got)
	}
}
