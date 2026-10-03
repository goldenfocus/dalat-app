package main

import (
	"strings"
	"testing"
	"time"
)

var testLoc, _ = time.LoadLocation(defaultEventLocation)

// ref is a fixed "now" for deterministic tests: Tuesday 2026-09-01 12:00 +07.
// 3 October 2026 is a Saturday, so the next Saturday after ref is 5 September.
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
			name: "hour-only h separator",
			text: "Acoustic night 12/9 20h tại cafe",
			want: time.Date(2026, 9, 12, 20, 0, 0, 0, testLoc),
		},
		{
			name:    "no date is an error",
			text:    "Mọi ngưởi nhớ giữ gìn vệ sinh chung nhé",
			wantErr: true,
		},
		{
			name: "english month and from 8 pm",
			text: "TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú",
			want: time.Date(2026, 10, 3, 20, 0, 0, 0, testLoc),
		},
		{
			name:         "weekday plus explicit day month",
			text:         "Morning vibes in Đà Lạt?\nJoin us this Saturday, 3 October for Morning Brew",
			want:         time.Date(2026, 10, 3, 0, 0, 0, 0, testLoc),
			wantInferred: true,
		},
		{
			name:         "weekly saturday rolls to the next saturday",
			text:         "WEEKLY SATURDAY COFFEE MEETUP WITH LIFE IN DA LAT COMMUNITY",
			want:         time.Date(2026, 9, 5, 0, 0, 0, 0, testLoc),
			wantInferred: true,
		},
		{
			name: "vietnamese day month and evening hour",
			text: "Acoustic thứ bảy, ngày 3 tháng 10 lúc 8 giờ tối",
			want: time.Date(2026, 10, 3, 20, 0, 0, 0, testLoc),
		},
		{
			name: "spelled-out november is not october",
			text: "Đêm nhạc ngày 3 tháng mười một lúc 19h",
			want: time.Date(2026, 11, 3, 19, 0, 0, 0, testLoc),
		},
		{
			name:         "spelled-out december",
			text:         "Chợ đêm ngày 12 tháng mười hai",
			want:         time.Date(2026, 12, 12, 0, 0, 0, 0, testLoc),
			wantInferred: true,
		},
		{
			name: "ordinal day of month",
			text: "Market on the 3rd of October at 9am",
			want: time.Date(2026, 10, 3, 9, 0, 0, 0, testLoc),
		},
		{
			name: "tomorrow evening",
			text: "See the show tomorrow at 8 pm",
			want: time.Date(2026, 9, 2, 20, 0, 0, 0, testLoc),
		},
		{
			name:         "tonight without a clock is 20:00",
			text:         "Live set tonight",
			want:         time.Date(2026, 9, 1, 20, 0, 0, 0, testLoc),
			wantInferred: true,
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
	if got := firstLine("20/09 19:00\nSunset Hike"); got != "Sunset Hike" {
		t.Errorf("skipped date-only title, got %q", got)
	}
}

func TestExtractLocation(t *testing.T) {
	if got, _ := extractLocation("Acoustic night 12/9 20h tại cafe"); got != "cafe" {
		t.Errorf("got %q", got)
	}
	if got, _ := extractLocation("Yoga in the park 03/09 at 7am"); got != "" {
		t.Errorf("treated a clock time as a venue: %q", got)
	}
	if got, _ := extractLocation("Full moon gathering 06/09"); got != "" {
		t.Errorf("invented location %q", got)
	}
	name, address := extractLocation("TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú \n(2 Đ. Phạm Hồng Thái, Đà Lạt)")
	if name != "Cù Rú" {
		t.Errorf("name=%q", name)
	}
	if !strings.Contains(address, "Phạm Hồng Thái") {
		t.Errorf("address=%q", address)
	}
}

func TestToRowMarksNeedsReview(t *testing.T) {
	start := time.Date(2026, 9, 12, 20, 0, 0, 0, testLoc)
	draft := &eventDraft{
		Slug:        "wa-abcd",
		Title:       "Acoustic night",
		Description: "Acoustic night 12/9 20h tại cafe",
		Location:    "cafe",
		ImageURL:    "https://cdn.dalat.app/event-media/wa-abcd/1.jpg",
		StartsAt:    start,
		Meta: map[string]any{
			"group_jid":  "120363@g.us",
			"message_id": "ABCD",
		},
	}
	row := draft.toRow("profile-1")
	if row["status"] != "draft" {
		t.Fatalf("status=%v", row["status"])
	}
	if row["external_chat_url"] != "whatsapp:120363@g.us/ABCD" {
		t.Fatalf("external_chat_url=%v", row["external_chat_url"])
	}
	if !strings.Contains(row["address"].(string), "Đà Lạt") || !strings.Contains(row["address"].(string), "Lâm Đồng") {
		t.Fatalf("address=%v", row["address"])
	}
	meta, _ := row["source_metadata"].(map[string]any)
	if meta["needs_review"] != true {
		t.Fatalf("needs_review=%v", meta["needs_review"])
	}
	if meta["city"] != "Đà Lạt" || meta["province"] != "Lâm Đồng" {
		t.Fatalf("locality=%v %v", meta["city"], meta["province"])
	}
	if meta["visual_provenance"] != "owner_authorized_source" {
		t.Fatalf("provenance=%v", meta["visual_provenance"])
	}
	if strings.Contains(strings.ToLower(row["image_alt"].(string)), "ai-generated") {
		t.Fatalf("alt discloses AI: %v", row["image_alt"])
	}
}
