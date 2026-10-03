package main

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestFlyerInContextBecomesHero(t *testing.T) {
	png := testFlyerPNG(t)
	history := []memMsg{{
		ID: "IMG1", Sender: "alice", Text: "Poster with upcoming rides",
		HasImage: true, Image: png, ImageMIME: "image/png", At: ref,
	}}
	draft, err := decide(inbound{
		ID: "MSG1", GroupJID: "120363@g.us", GroupName: "Events & Offers",
		Sender: "alice", Timestamp: ref.Add(10 * time.Minute),
		Text: "TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú \n(2 Đ. Phạm Hồng Thái)",
	}, history, nil, ref.Add(10*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Hero) == 0 || draft.HeroMIME != "image/png" {
		t.Fatalf("hero=%d mime=%s", len(draft.Hero), draft.HeroMIME)
	}
	draft.ImageURL = "https://cdn.dalat.app/event-media/wa-msg1/1.png"
	draft.ImageAlt = ownerHeroAlt
	row := draft.toRow("profile")
	if row["image_url"] != draft.ImageURL {
		t.Fatalf("image_url=%v", row["image_url"])
	}
	meta := row["source_metadata"].(map[string]any)
	if meta["visual_provenance"] != "owner_authorized_source" || meta["needs_review"] != true {
		t.Fatalf("meta=%v", meta)
	}
	if strings.Contains(strings.ToLower(row["image_alt"].(string)), "ai-generated") {
		t.Fatal(row["image_alt"])
	}
	gap := meta["visual_gap"].(map[string]any)
	if covers := gap["covers"].([]string); len(covers) != 1 || covers[0] != "promo" {
		t.Fatalf("gap=%v", gap)
	}
}

func TestLocalityAndMapsShortLink(t *testing.T) {
	prev := mapsResolver
	t.Cleanup(func() { mapsResolver = prev })
	mapsResolver = func(ctx context.Context, raw string) (mapsHit, error) {
		if !strings.Contains(raw, "maps.app.goo.gl/abcDEF123") {
			t.Fatalf("raw=%s", raw)
		}
		lat, lng := 11.94059, 108.45818
		return mapsHit{
			Name:     "Cù Rú",
			Address:  "2 Phạm Hồng Thái",
			FinalURL: "https://www.google.com/maps/place/C%C3%B9+R%C3%BA/@11.94059,108.45818,17z",
			Lat:      &lat,
			Lng:      &lng,
		}, nil
	}
	draft, err := decide(inbound{
		ID: "MAP1", GroupJID: "120363@g.us", GroupName: "Events & Offers",
		Sender: "alice", Timestamp: ref,
		HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
		Text: "Join us this Saturday, 3 October from 8 pm\nhttps://maps.app.goo.gl/abcDEF123",
	}, nil, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Location != "Cù Rú" {
		t.Fatalf("location=%q", draft.Location)
	}
	if !strings.Contains(draft.Address, "Phạm Hồng Thái") || !strings.Contains(draft.Address, "Đà Lạt") || !strings.Contains(draft.Address, "Lâm Đồng") {
		t.Fatalf("address=%q", draft.Address)
	}
	if draft.Latitude == nil || *draft.Latitude != 11.94059 {
		t.Fatalf("lat=%v", draft.Latitude)
	}
	row := draft.toRow("profile")
	meta := row["source_metadata"].(map[string]any)
	if meta["city"] != "Đà Lạt" || meta["province"] != "Lâm Đồng" {
		t.Fatalf("city=%v province=%v", meta["city"], meta["province"])
	}
	if row["google_maps_url"] != "https://www.google.com/maps/place/C%C3%B9+R%C3%BA/@11.94059,108.45818,17z" {
		t.Fatalf("maps=%v", row["google_maps_url"])
	}
	addr := row["address"].(string)
	if !strings.Contains(strings.ToLower(addr), "đà lạt") && !strings.Contains(strings.ToLower(addr), "da lat") {
		t.Fatalf("evaluator address=%q", addr)
	}
}

func TestSkipChatterDMAndTentative(t *testing.T) {
	png := testFlyerPNG(t)
	cases := []struct {
		name string
		text string
		want string
	}{
		{name: "lunch maps", text: "Lunch 12:15 with friends\nhttps://maps.app.goo.gl/abcDEF123", want: "not an event"},
		{name: "dm venue", text: "Stand-up Comedy Workshop\nthis Saturday, 3 October 8pm\nLocation: DM for location", want: "no public venue"},
		{name: "tentative", text: "Jazz night\nthis Saturday, 3 October 8pm\nLocation: Cù Rú\nDate is tentative", want: "tentative date"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			draft, err := decide(inbound{
				ID: "SKIP", GroupName: "Events", Sender: "alice", Timestamp: ref,
				Text: tc.text, HasImage: true, Image: png, ImageMIME: "image/png",
			}, nil, nil, ref)
			if err == nil {
				t.Fatalf("created %q needs_review would be set", draft.Title)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestTextWithoutFlyerIsNotReviewable(t *testing.T) {
	_, err := decide(inbound{
		ID: "TXT", GroupName: "Events", Sender: "alice", Timestamp: ref,
		Text: "TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú",
	}, nil, nil, ref)
	if err == nil || !strings.Contains(err.Error(), "no flyer for hero") {
		t.Fatalf("err=%v", err)
	}
}
