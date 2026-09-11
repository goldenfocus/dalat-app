package main

import (
	"testing"
	"time"
)

var testLoc, _ = time.LoadLocation(defaultEventLocation)

// ref is a fixed "now" for deterministic tests: Monday 2026-09-01 12:00 +07.
var ref = time.Date(2026, 9, 1, 12, 0, 0, 0, testLoc)

func TestExtractStartTime(t *testing.T) {
	cases := []struct {
		name         string
		text         string
		want         time.Time
		wantInferred bool
		wantErr      bool
	}{
		{
			name: "day-first date with 24h time",
			text: "Sunset hike Langbiang 05/09 lúc 16:30, gặp tại chợ Đà Lạt",
			want: time.Date(2026, 9, 5, 16, 30, 0, 0, testLoc),
		},
		{
			name: "day-first date is not month-first",
			text: "Workshop gốm 05/09/2026 19:00",
			want: time.Date(2026, 9, 5, 19, 0, 0, 0, testLoc),
		},
		{
			name: "h separator",
			text: "Acoustic night 12/9 20h00 tại cafe",
			want: time.Date(2026, 9, 12, 20, 0, 0, 0, testLoc),
		},
		{
			name: "12h clock",
			text: "Yoga in the park 03/09 at 7am",
			want: time.Date(2026, 9, 3, 7, 0, 0, 0, testLoc),
		},
		{
			name:         "no time infers midnight and flags it",
			text:         "Full moon gathering 06/09",
			want:         time.Date(2026, 9, 6, 0, 0, 0, 0, testLoc),
			wantInferred: true,
		},
		{
			name: "past year-less date rolls to next year",
			text: "Anniversary party 20/8 18:00",
			want: time.Date(2027, 8, 20, 18, 0, 0, 0, testLoc),
		},
		{
			name:    "no date is an error",
			text:    "Mọi ngưởi nhớ giữ gìn vệ sinh chung nhé",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, inferred, err := extractStartTime(tc.text, testLoc, ref)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !got.Equal(tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
			if inferred != tc.wantInferred {
				t.Errorf("timeInferred = %v, want %v", inferred, tc.wantInferred)
			}
		})
	}
}

func TestFirstLine(t *testing.T) {
	if got := firstLine("\n\n  Sunset Hike 🌄\nDetails here"); got != "Sunset Hike 🌄" {
		t.Errorf("got %q", got)
	}
	if got := firstLine("   \n  "); got != "" {
		t.Errorf("got %q", got)
	}
}
