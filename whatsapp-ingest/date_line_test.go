package main

import "testing"

const symbioticCaption = "🍄🌿 The Symbiotic Circle: Mushrooms, Plants & Humans\n\nHi everyone! 😊 Join us for our next Cultural Exchange to explore Da Lat’s mushroom culture, the hidden world of fungi, brain health, and nature’s recycling cycle.\n\n📅 Sunday, October 25 | 10:00–11:30 AM\n📍 Le Pin Dessert & More, 6 Đường Triệu Việt Vương, Đà Lạt\n🎤 Speaker: Conscious Chris\n🗣️ Language: English | 🎟️ Free admission"

func TestDateLinesAreNeverTitles(t *testing.T) {
	for _, s := range []string{"📅 Sunday, October 25 | 10:00–11:30 AM", "Sat 17 Oct – 6:30 PM", "Thứ Bảy, 17/10 - 19h", "October 25", "Tonight 7pm–9pm", "25.10.2026 | 10:00"} {
		if !isDateLine(s) {
			t.Errorf("want date line: %q", s)
		}
		if !skipTitleLine(s) {
			t.Errorf("want skipped: %q", s)
		}
	}
	for _, s := range []string{"Sunday Jazz Brunch", "October Fest 2026", "The Symbiotic Circle: Mushrooms, Plants & Humans", "Weekend Sketch Club"} {
		if isDateLine(s) {
			t.Errorf("not a date line: %q", s)
		}
	}
}

func TestEmojiHeadingWithColonIsTitle(t *testing.T) {
	if got := chooseTitle(symbioticCaption, "", "", false); got != "The Symbiotic Circle: Mushrooms, Plants & Humans" {
		t.Fatalf("got %q", got)
	}
	if isFragmentTitle("The Symbiotic Circle: Mushrooms") || isFragmentTitle("The Lantern Parade Night") {
		t.Fatal("full heading treated as fragment")
	}
	if !isFragmentTitle("The performance") {
		t.Fatal("fragment rule lost")
	}
	if got := chooseTitle("📅 Sunday, October 25 | 10:00–11:30 AM\nMushroom Talk at Le Pin", "", "", false); got != "Mushroom Talk at Le Pin" {
		t.Fatalf("date first line: got %q", got)
	}
}
