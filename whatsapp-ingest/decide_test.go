package main

import (
	"context"
	"testing"
	"time"
)

func TestMightBeEventExamples(t *testing.T) {
	positives := []string{
		"TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú \n(2 Đ. Phạm Hồng Thái, Đà Lạt)",
		"Morning vibes in Đà Lạt? ☕️🎧\nJoin us this Saturday, 3 October for Morning Brew & records",
		"WEEKLY SATURDAY COFFEE MEETUP WITH LIFE IN DA LAT COMMUNITY",
		"tomorrow 8pm at Cù Rú",
	}
	for _, text := range positives {
		if !mightBeEvent(text) {
			t.Errorf("expected announcement: %q", text)
		}
	}
	negatives := []string{
		"yes",
		"thank you",
		"where do you sit?",
		"Lunch / Cơm tấm Nguyễn\n12/10 12:00",
		"see you tomorrow",
		"ok",
	}
	for _, text := range negatives {
		if mightBeEvent(text) {
			t.Errorf("expected chit-chat or meal plan: %q", text)
		}
	}
}

func TestDecideTextAnnouncements(t *testing.T) {
	cases := []struct {
		name     string
		text     string
		wantDay  int
		wantHour int
		wantLoc  string
		inferred bool
	}{
		{
			name:     "techno calling",
			text:     "TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú \n(2 Đ. Phạm Hồng Thái, Đà Lạt)",
			wantDay:  3,
			wantHour: 20,
			wantLoc:  "Cù Rú",
		},
		{
			name:     "morning brew",
			text:     "Morning vibes in Đà Lạt? ☕️🎧\nJoin us this Saturday, 3 October for Morning Brew & records",
			wantDay:  3,
			wantHour: 0,
			inferred: true,
		},
		{
			name:     "weekly coffee",
			text:     "WEEKLY SATURDAY COFFEE MEETUP WITH LIFE IN DA LAT COMMUNITY",
			wantDay:  5,
			wantHour: 0,
			inferred: true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			draft, err := decide(inbound{
				ID: "MSG1", GroupJID: "120363@g.us", GroupName: "Events & Offers",
				Sender: "alice", Text: tc.text, Timestamp: ref,
			}, nil, nil, ref)
			if err != nil {
				t.Fatal(err)
			}
			if draft.Slug != "wa-msg1" {
				t.Fatalf("slug=%s", draft.Slug)
			}
			start := draft.StartsAt.In(testLoc)
			if start.Day() != tc.wantDay || start.Hour() != tc.wantHour {
				t.Fatalf("start=%s", start)
			}
			if draft.TimeInferred != tc.inferred {
				t.Fatalf("inferred=%v", draft.TimeInferred)
			}
			if tc.wantLoc != "" && draft.Location != tc.wantLoc {
				t.Fatalf("location=%q", draft.Location)
			}
			if draft.Address != "" && tc.wantLoc == "Cù Rú" && draft.Address == "" {
				t.Fatal("missing address")
			}
			row := draft.toRow("profile-1")
			if row["status"] != "draft" {
				t.Fatalf("status=%v", row["status"])
			}
		})
	}
}

func TestDecideSkipsChitChatAndMealPlans(t *testing.T) {
	ex := &fakeExtractor{result: extractResult{IsEvent: true, Date: "2026-10-03", FromImage: true, Title: "Invented"}}
	for _, text := range []string{"yes", "thank you", "where do you sit?", "Lunch / Cơm tấm Nguyễn\n12/10 12:00"} {
		_, err := decide(inbound{ID: "X", Text: text, Timestamp: ref, GroupName: "Events"}, nil, ex, ref)
		if err == nil {
			t.Fatalf("created a draft for %q", text)
		}
	}
	if ex.calls != 0 {
		t.Fatalf("LLM called for chit-chat/meal plan: %d", ex.calls)
	}
}

func TestDecideFlyerThenFollowUpSharesSlug(t *testing.T) {
	png := testFlyerPNG(t)
	ex := &fakeExtractor{result: extractResult{
		IsEvent: true, FromImage: true, Title: "Sunday canyon ride",
		Date: "2026-10-04", Time: "07:30", Location: "Langbiang gate",
		Price: "150.000đ", Organizer: "Motorcycle Ride Squad",
	}}
	flyer, err := decide(inbound{
		ID: "FLY1", GroupJID: "g", GroupName: "Motorcycle Ride Squad",
		Sender: "alice", Text: "Poster with upcoming rides", Timestamp: ref,
		HasImage: true, Image: png, ImageMIME: "image/png",
	}, nil, ex, ref)
	if err != nil {
		t.Fatal(err)
	}
	if ex.calls != 1 || len(ex.last.Image) == 0 {
		t.Fatalf("vision calls=%d image=%d", ex.calls, len(ex.last.Image))
	}
	if flyer.Title != "Sunday canyon ride" || flyer.Location != "Langbiang gate" {
		t.Fatalf("flyer title=%q loc=%q", flyer.Title, flyer.Location)
	}
	if flyer.PriceText != "150.000đ" || flyer.Organizer != "Motorcycle Ride Squad" {
		t.Fatalf("price=%q org=%q", flyer.PriceText, flyer.Organizer)
	}
	if flyer.Extraction != "vision" {
		t.Fatalf("extraction=%s", flyer.Extraction)
	}
	start := flyer.StartsAt.In(testLoc)
	if start.Month() != time.October || start.Day() != 4 || start.Hour() != 7 || start.Minute() != 30 {
		t.Fatalf("flyer start=%s", start)
	}

	history := []memMsg{{
		ID: "FLY1", Sender: "alice", Text: "Poster with upcoming rides",
		HasImage: true, IsEvent: true, DraftSlug: flyer.Slug, Draft: flyer, At: ref,
	}}
	follow, err := decide(inbound{
		ID: "FOL1", GroupJID: "g", GroupName: "Motorcycle Ride Squad",
		Sender: "bob", Text: "tomorrow 8pm at Cù Rú", Timestamp: ref.Add(10 * time.Minute),
	}, history, nil, ref.Add(10*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if follow.Slug != flyer.Slug {
		t.Fatalf("follow slug=%s want %s", follow.Slug, flyer.Slug)
	}
	if follow.Location != "Cù Rú" {
		t.Fatalf("location=%q", follow.Location)
	}
	got := follow.StartsAt.In(testLoc)
	want := time.Date(2026, 9, 2, 20, 0, 0, 0, testLoc)
	if !got.Equal(want) {
		t.Fatalf("follow start=%s want %s", got, want)
	}
	if len(follow.MergedIDs) == 0 || follow.MergedIDs[0] != "FOL1" {
		t.Fatalf("merged=%v", follow.MergedIDs)
	}
}

func TestDecideQuotedLocationUpdatesSameDraft(t *testing.T) {
	start := time.Date(2026, 10, 3, 20, 0, 0, 0, testLoc)
	original := &eventDraft{
		Slug: "wa-fly", Title: "TECHNO CALLING", Description: "TECHNO CALLING",
		StartsAt: start, Location: "",
		Meta: map[string]any{"message_id": "FLY"},
	}
	history := []memMsg{
		{ID: "FLY", Sender: "alice", Text: "TECHNO CALLING", HasImage: true, IsEvent: true, DraftSlug: "wa-fly", Draft: original, At: ref},
		{ID: "ASK", Sender: "bob", Text: "can you repost the location?", QuotedID: "FLY", At: ref.Add(time.Minute)},
	}
	_, askErr := decide(inbound{
		ID: "ASK", Sender: "bob", Text: "can you repost the location?", QuotedID: "FLY",
		Timestamp: ref.Add(time.Minute), GroupName: "Events",
	}, history[:1], nil, ref)
	if askErr == nil {
		t.Fatal("location question became an event")
	}
	updated, err := decide(inbound{
		ID: "ANS", Sender: "cara", Text: "It's at Cù Rú tomorrow 8pm", QuotedID: "ASK",
		Timestamp: ref.Add(2 * time.Minute), GroupName: "Events & Offers", GroupJID: "120363@g.us",
	}, history, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Slug != "wa-fly" {
		t.Fatalf("slug=%s", updated.Slug)
	}
	if updated.Location != "Cù Rú" {
		t.Fatalf("location=%q", updated.Location)
	}
	if updated.Title != "TECHNO CALLING" {
		t.Fatalf("title overwritten: %q", updated.Title)
	}
}

func TestDecideSeparateAnnouncements(t *testing.T) {
	first, err := decide(inbound{
		ID: "A", Sender: "alice", Timestamp: ref, GroupName: "Events",
		Text: "TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú",
	}, nil, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	history := []memMsg{{ID: "A", Sender: "alice", Text: first.Description, DraftSlug: first.Slug, Draft: first, IsEvent: true, At: ref}}
	second, err := decide(inbound{
		ID: "B", Sender: "alice", Timestamp: ref.Add(time.Hour), GroupName: "Events",
		Text: "Morning vibes in Đà Lạt?\nJoin us this Saturday, 3 October for Morning Brew & records",
	}, history, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if second.Slug == first.Slug {
		t.Fatal("merged two announcements")
	}
}

func TestVisionDoesNotInventVenueWithoutImageFlag(t *testing.T) {
	ex := &fakeExtractor{result: extractResult{
		IsEvent: true, Title: "Secret warehouse", Date: "2026-10-03", Time: "20:00",
		Location: "Invented Hall", LocationEvidence: "Invented Hall",
		DateEvidence: "October 3", TimeEvidence: "8 pm",
	}}
	draft, err := decide(inbound{
		ID: "T", Sender: "alice", Timestamp: ref, GroupName: "Events",
		Text: "TECHNO CALLING\n\nOctober 3. From 8 pm",
	}, nil, ex, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Location != "" {
		t.Fatalf("invented location %q", draft.Location)
	}
	if ex.calls != 1 {
		t.Fatalf("calls=%d", ex.calls)
	}
}

type fakeExtractor struct {
	calls  int
	last   extractRequest
	result extractResult
	err    error
}

func (f *fakeExtractor) Extract(ctx context.Context, req extractRequest) (extractResult, error) {
	f.calls++
	f.last = req
	if f.err != nil {
		return extractResult{}, f.err
	}
	return f.result, nil
}
