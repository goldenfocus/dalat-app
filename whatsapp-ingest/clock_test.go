package main

import (
	"testing"
	"time"
)

// Real post (wa-a55c4a736745cf25aa1d1454d072dbd6, Oct 8 2026). The caption
// says "Tomorrow", the flyer says "FRI OCT 9 FROM 6PM"; the draft got
// 00:00 ICT with time_inferred=true.
const (
	fireBeerCaption  = "Tomorrow, we’re turning Nghiêm into your place to be. 🔥🍺\n\nWe’re opening the decks and bringing the community together for a night of good music, craft beer, good vibes, and good people.\n\nCome with your friends, meet some new ones, enjoy the music, and hang out with us.\n\nAnd yes… there’ll be tasty food combos for both Western & Vietnamese palates. 🍻🍴\n\nSee you tomorrow! ✨"
	fireBeerReadable = "Nghiêm BREWING\nSTAIRS OPEN\nFIRE & BEER NIGHTS\nOPEN DECKS\nDJ CALLING!\nFRI OCT 9 FROM 6PM\nCHECK ON OUR FOOD & BEER COMBOS\nGOOD BEER GOOD MUSIC GOOD PEOPLE.\nOPEN TO ALL DJS\nCOME PLAY A 45 MIN SET GET 1 FREE BEER BE PART OF OUR FUTURE NIGHTS!\nNGHIÊM BREWING ĐÀ LẠT"
)

var fireBeerShared = time.Date(2026, 10, 8, 10, 42, 27, 0, time.UTC)

func TestFindClockFormats(t *testing.T) {
	type want struct {
		h, m, eh, em int
		end          bool
	}
	cases := map[string]want{
		"6PM":                        {h: 18},
		"6 PM":                       {h: 18},
		"FRI OCT 9 FROM 6PM":         {h: 18},
		"8 p.m. sharp":               {h: 20},
		"6pm–10pm":                   {h: 18, eh: 22, end: true},
		"6pm - 10pm":                 {h: 18, eh: 22, end: true},
		"6-10pm":                     {h: 18, eh: 22, end: true},
		"8pm-1am":                    {h: 20, eh: 1, end: true},
		"11-1pm brunch":              {h: 11, eh: 13, end: true},
		"18:00":                      {h: 18},
		"18:00 - 22:00":              {h: 18, eh: 22, end: true},
		"18h":                        {h: 18},
		"18h30":                      {h: 18, m: 30},
		"6:30pm":                     {h: 18, m: 30},
		"6:30 PM":                    {h: 18, m: 30},
		"từ 18h":                     {h: 18},
		"từ 18h đến 22h":             {h: 18, eh: 22, end: true},
		"18-22h":                     {h: 18, eh: 22, end: true},
		"Time: 10:00–11:30 AM":       {h: 10, eh: 11, em: 30, end: true},
		"lúc 8 giờ tối":              {h: 20},
		"12pm lunch":                 {h: 12},
		"12am":                       {h: 0},
		"Sat 4 Oct 07:30 - 150.000đ": {h: 7, m: 30},
	}
	for text, w := range cases {
		c, ok := findClock(text)
		if !ok {
			t.Errorf("%q: no clock", text)
			continue
		}
		if c.hour != w.h || c.minute != w.m || c.hasEnd != w.end || (w.end && (c.endHour != w.eh || c.endMinute != w.em)) {
			t.Errorf("%q: got %+v want %+v", text, c, w)
		}
	}
	for _, text := range []string{
		"COME PLAY A 45 MIN SET GET 1 FREE BEER",
		"05/09", "150.000đ", "a 2 hours drive", "Issue No. 8", "open 24h", "12-14 Oct", "7-9 people",
		fireBeerCaption,
	} {
		if c, ok := findClock(text); ok {
			t.Errorf("%q: unexpected clock %+v", text, c)
		}
	}
}

func TestExtractScheduleFireBeerFixture(t *testing.T) {
	start, end, inferred, err := extractSchedule([]string{fireBeerCaption, fireBeerReadable}, testLoc, fireBeerShared)
	if err != nil {
		t.Fatal(err)
	}
	if want := time.Date(2026, 10, 9, 11, 0, 0, 0, time.UTC); !start.Equal(want) {
		t.Fatalf("start=%s want %s", start.UTC(), want)
	}
	if inferred {
		t.Fatal("explicit 6PM on the flyer must not be time_inferred")
	}
	if end != nil {
		t.Fatalf("flyer has no end time, got %s", end)
	}
}

func TestExtractScheduleCombinesSources(t *testing.T) {
	cases := []struct {
		name     string
		sources  []string
		want     time.Time
		end      *time.Time
		inferred bool
	}{
		{
			name:    "tomorrow in caption, time only on flyer",
			sources: []string{"Tomorrow! Bring friends 🔥", "OPEN DECKS\nFROM 6PM\nNGHIÊM BREWING"},
			want:    time.Date(2026, 10, 9, 18, 0, 0, 0, testLoc),
		},
		{
			name:    "time in caption, date only on flyer",
			sources: []string{"Doors 18h30, see you there", "FIRE & BEER NIGHTS\nFRI OCT 9"},
			want:    time.Date(2026, 10, 9, 18, 30, 0, 0, testLoc),
		},
		{
			name:    "range on flyer sets the end",
			sources: []string{"", "SAT OCT 10\n6pm–10pm"},
			want:    time.Date(2026, 10, 10, 18, 0, 0, 0, testLoc),
			end:     ptrTime(time.Date(2026, 10, 10, 22, 0, 0, 0, testLoc)),
		},
		{
			name:    "range past midnight ends the next day",
			sources: []string{"Techno tomorrow 10pm-2am"},
			want:    time.Date(2026, 10, 9, 22, 0, 0, 0, testLoc),
			end:     ptrTime(time.Date(2026, 10, 10, 2, 0, 0, 0, testLoc)),
		},
		{
			name:    "vietnamese từ 18h tomorrow",
			sources: []string{"Ngày mai, từ 18h tại Nghiêm"},
			want:    time.Date(2026, 10, 9, 18, 0, 0, 0, testLoc),
		},
		{
			name:     "no clock anywhere is midnight and inferred",
			sources:  []string{"See you tomorrow!", "FIRE & BEER NIGHTS\nOPEN DECKS"},
			want:     time.Date(2026, 10, 9, 0, 0, 0, 0, testLoc),
			inferred: true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start, end, inferred, err := extractSchedule(tc.sources, testLoc, fireBeerShared)
			if err != nil {
				t.Fatal(err)
			}
			if !start.Equal(tc.want) || inferred != tc.inferred {
				t.Fatalf("start=%s inferred=%v want %s %v", start.In(testLoc), inferred, tc.want, tc.inferred)
			}
			switch {
			case tc.end == nil && end != nil:
				t.Fatalf("unexpected end %s", end.In(testLoc))
			case tc.end != nil && (end == nil || !end.Equal(*tc.end)):
				t.Fatalf("end=%v want %s", end, tc.end)
			}
		})
	}
}

func TestDecideFireBeerFlyerTime(t *testing.T) {
	stubMaps(t, "")
	// The model returned the date but not the clock (the live failure), and
	// separately the full date + time. Both must end at 18:00 ICT, firm.
	for name, llmTime := range map[string]string{"model dropped the time": "", "model read the time": "18:00"} {
		t.Run(name, func(t *testing.T) {
			ex := &fakeExtractor{result: extractResult{
				IsEvent: true, IsEventFlyer: true, FromImage: true, ImageKind: "flyer",
				Title: "FIRE & BEER NIGHTS", ReadableText: fireBeerReadable,
				Date: "2026-10-09", Time: llmTime, DateEvidence: "FRI OCT 9", TimeEvidence: "FROM 6PM",
				VenueName: "Nghiêm Brewing", LocationEvidence: "Nghiêm BREWING",
			}}
			draft, err := decide(inbound{
				ID: "A55C4A736745CF25AA1D1454D072DBD6", GroupJID: "120363401543865296@g.us", GroupName: "Events & Offers",
				Sender: "s", Text: fireBeerCaption, Timestamp: fireBeerShared,
				HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
			}, nil, ex, fireBeerShared)
			if err != nil {
				t.Fatal(err)
			}
			if want := time.Date(2026, 10, 9, 11, 0, 0, 0, time.UTC); !draft.StartsAt.Equal(want) {
				t.Fatalf("start=%s want %s", draft.StartsAt.UTC(), want)
			}
			if draft.TimeInferred || draft.EndsAt != nil {
				t.Fatalf("inferred=%v end=%v", draft.TimeInferred, draft.EndsAt)
			}
			draft.ImageURL = "https://cdn.dalat.app/x.jpg"
			row := draft.toRow("profile")
			meta := row["source_metadata"].(map[string]any)
			if row["starts_at"] != "2026-10-09T11:00:00Z" || meta["time_inferred"] != false {
				t.Fatalf("starts_at=%v time_inferred=%v", row["starts_at"], meta["time_inferred"])
			}
			if _, ok := row["ends_at"]; ok {
				t.Fatalf("ends_at=%v", row["ends_at"])
			}
		})
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
