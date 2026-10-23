package main

import (
	"strings"
	"testing"
)

const sketchCaption = "Sunday is coming soon, which means it's time to rustle some paper, draw, and pose!\n\u200bJoin us at Vui Va Cafe on 18 of October at 10:30 AM. It's going to be cozy ✨\n\u200bNo drawing skills required, everyone is welcome! DM me to reserve your spot ❤️\n\u200bPrice: Free entry, but please order at least one drink ☕"

const relatingCaption = "Looking to build deeper connections, skip the small talk, and meet like-minded people in a warm, welcoming space? Join us for an engaging session dedicated to mindful communication!\n\u200bWhen: Sunday, 18.10 at 12:30 PM\n\u200bWhere: Vui Vá Cafe & Creative Space\n\u200bEntry: Free admission (just purchase any drink at the bar to support the venue)"

func TestLabelLines(t *testing.T) {
	for _, s := range []string{"\u200bPrice: Free entry ☕", "Time : 8:30 - 11:30", "Where: Vui Vá", "📍 Location: INN", "Date - 18/10", "Giá: 100k", "Thời gian: 19h", "Địa điểm: Mây Lang Thang", "Entry: Free"} {
		if !isLabelLine(s) {
			t.Errorf("want label: %q", s)
		}
	}
	for _, s := range []string{"Weekend Sketch Club", "Timeless Jazz Night", "Pricey Wines Tasting"} {
		if isLabelLine(s) {
			t.Errorf("not a label: %q", s)
		}
	}
}

func TestTruncateTitleWordBoundary(t *testing.T) {
	got := truncateTitle("Looking to build deeper connections, skip the small talk, and meet like-minded people in a warm, welcoming space?", 60)
	if len([]rune(got)) > 60 || strings.HasSuffix(got, "wel") || strings.HasSuffix(got, ",") {
		t.Fatalf("got %q", got)
	}
	if !strings.HasPrefix("Looking to build deeper connections, skip the small talk, and meet like-minded people", got) {
		t.Fatalf("not a word-boundary prefix: %q", got)
	}
}

func TestVuiVaTitlesNeverLabelsOrMidWord(t *testing.T) {
	for _, c := range []string{sketchCaption, relatingCaption} {
		got := chooseTitle(c, "", "", false)
		if got == "" {
			continue // only chat sentences: decide holds a placeholder for Review
		}
		if isChatSentenceTitle(got) || isLabelLine(got) || len([]rune(got)) > shortTitle || strings.Contains(got, "\u200b") {
			t.Fatalf("bad title %q", got)
		}
		words := strings.Fields(got)
		if last := words[len(words)-1]; !strings.Contains(c, last+" ") && !strings.Contains(c, last+"\n") && !strings.Contains(c, last+"?") && !strings.Contains(c, last+"!") && !strings.Contains(c, last+",") && !strings.Contains(c, last+".") {
			t.Fatalf("cut mid-word: %q", got)
		}
	}
	// With the flyer headline, it wins.
	if got := chooseTitle(sketchCaption, "", "WEEKEND SKETCH CLUB\nSun 18 Oct 10:30", true); got != "WEEKEND SKETCH CLUB" {
		t.Fatalf("flyer headline: %q", got)
	}
}

func TestPrefersShortHeadlineCaseLine(t *testing.T) {
	c := "Join us this Sunday for a cozy morning of drawing and coffee with friends, it will be great!\nWeekend Sketch Club\nPrice: free"
	if got := chooseTitle(c, "", "", false); got != "Weekend Sketch Club" {
		t.Fatalf("got %q", got)
	}
	c = "Come hang out with us, bring your friends and your best moves, it is going to be fun\nSALSA SOCIAL\nTime: 8pm"
	if got := chooseTitle(c, "", "", false); got != "SALSA SOCIAL" {
		t.Fatalf("got %q", got)
	}
}

func TestDetectLocale(t *testing.T) {
	cases := map[string]string{
		sketchCaption:   "en",
		relatingCaption: "en",
		"Making Bouquet Card together\nTime : 8:30 - 11:30\nlocation : Bàn cà phê Đà Lạt\n\nShared in the \"Events & Offers\" WhatsApp group of the Life in Đà Lạt community.": "en",
		"Đêm nhạc Trịnh Công Sơn tại Mây Lang Thang, tối thứ Bảy 20h, vé 300.000đ":                                                                                             "vi",
		"Lễ hội Nhạc Jazz Việt Nam 2026 diễn ra tại Quảng trường Lâm Viên":                                                                                                     "vi",
	}
	for text, want := range cases {
		if got := detectLocale(text); got != want {
			t.Errorf("%q: got %s want %s", text[:30], got, want)
		}
	}
}
