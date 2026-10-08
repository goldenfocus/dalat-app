package main

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// Real WhatsApp posts that produced garbage venues (Oct 2026). Captions and
// flyer OCR are copied verbatim from the stored drafts.
const (
	musicBridgesCaption  = "MUSIC AND BRIDGES BETWEEN THE VISIBLE AND INVISIBLE WORLDS\n\nCultural Magazine No. 8 takes a deeper look at several traditional Vietnamese musical forms that remain alive and influential in the country’s religious, spiritual, and cultural life.\n\nIt is a story of how Vietnamese people use music to connect the visible world with the invisible world — and people with one another.\n\nJoin us as we discover the stories behind these sounds🔥🔥🔥\n\n=====================\n\nSpeaker: Sophie V\nLanguage: Vietnamese, with live English interpretation by Thanh Huynh\nMedia coordinator: Xuân Duyên\n\n🕙 Time: 10:00–11:30 AM, Sunday, Oct 11\n📍 Venue: Q - Coffee Roastery Da Lat\n Map link:https://maps.app.goo.gl/9sZB6rKBeYhbKQz78?g_st=ic\n\n🎟️ Admission: Free of charge\n(We warmly encourage guests to support the café by ordering a drink.)\n \nAs seating is limited to 15 reservations, please register today 😊😊😊"
	musicBridgesReadable = "CULTURAL EXCHANGE DALAT - VIETNAM\nMUSIC AND BRIDGES between the Visible and Invisible Worlds\nIssue No. 8 of Cultural Magazine takes us into the world of distinctive forms of Vietnamese folk music that continue to play a meaningful role in the country's religious and spiritual life.\nHere, music is not simply something to be heard. It is a way to invoke, connect, and create a dialogue - between people, and between the visible world and the unseen.\nJoin us as we discover the stories behind these sounds.\nSpeaker: Sophie\nLanguage: Vietnamese, with live English interpretation by Thanh Huynh\nMedia coordinator: Xuân Duyên\nTime: 10:00 - 11:30 AM, Sunday, Oct 11\nVenue: Q Coffee Roastery Dalat 305 D. Tô Ngọc Vân, Xuân Hương - Đà Lạt, Lâm Đồng\nAdmission: Free of charge (We warmly encourage guests to support the event by ordering a drink.)\nAs seating is limited, please register today!\nTRADITIONAL SOUNDS • DEEPER CONNECTIONS • A SHARED CULTURE"
	musicBridgesMapsURL  = "https://maps.google.com?q=Q+Coffee+Roastery+Dalat,+305+%C4%90.+T%C3%B4+Ng%E1%BB%8Dc+V%C3%A2n,+Xu%C3%A2n+H%C6%B0%C6%A1ng+-+%C4%90%C3%A0+L%E1%BA%A1t,+L%C3%A2m+%C4%90%E1%BB%93ng+670000&ftid=0x317113a1e2aa9af9:0x2d12beca8825d1f4&entry=gps&shh=CAE"

	socialhouseCaption  = "Hey everyone, \nthis Friday is Game night at the Socialhouse 🎲\n6pm till late, just come chill and play whatever you want.\nBring your own board game and get 10% off.\n184 Tô Ngọc Vân, Đà Lạt\nFriday 9th Oct\nAnyone down?"
	socialhouseReadable = "SOCIALHOUSE DALAT friday GAME NIGHT Join us! 10% discount 6PM till late Friday, 9th Oct 184 Tô Ngọc Vân, Đà Lạt IF YOU BRING YOUR OWN BOARD GAME"

	womensSpaceCaption = "After the conflict with men & women at the coffee meetups, we have two choices: we can feel uncomfortable and slink away from participating in these events — or we can show up for each other in force. 🥰 I, myself, have been absent from the group for a few weeks. I’d like to suggest that we all go to the Saturday coffee meetup and have a good time. Let’s commingle with people of both genders, from around the world and locals. 🥰 Are you in?"

	musicBridgesAddress = "305 Đ. Tô Ngọc Vân, Xuân Hương, Đà Lạt, Lâm Đồng"
)

func stubMaps(t *testing.T, final string) {
	t.Helper()
	prev := mapsResolver
	t.Cleanup(func() { mapsResolver = prev })
	mapsResolver = func(ctx context.Context, raw string) (mapsHit, error) {
		if final == "" {
			return mapsHit{}, errors.New("offline")
		}
		hit, ok := parseMapsTarget(final)
		if !ok {
			return mapsHit{}, errors.New("unparsed")
		}
		return hit, nil
	}
}

func TestNormalizeVenueName(t *testing.T) {
	cases := map[string]string{
		"the Socialhouse 🎲":         "Socialhouse",
		"The Hideout!!":             "Hideout",
		"SOCIALHOUSE DALAT":         "Socialhouse Dalat",
		"Q Coffee Roastery Dalat.":  "Q Coffee Roastery Dalat",
		"📍 Cù Rú ✨":                 "Cù Rú",
		"Maze Bar (100 Roofs Cafe)": "Maze Bar (100 Roofs Cafe)",
		"  Lululola tonight  ":      "Lululola",
		"Games & Billiards 🀄️ ♦️ 🎱": "Games & Billiards",
	}
	for in, want := range cases {
		if got := normalizeVenueName(in); got != want {
			t.Errorf("normalizeVenueName(%q)=%q want %q", in, got, want)
		}
	}
}

func TestPlausibleVenueNameRejectsDescriptionFragments(t *testing.T) {
	for _, bad := range []string{
		"several traditional Vietnamese musical forms that remain alive and influential i",
		"the coffee meetups, we have two choices: we can feel uncomfortable and slink awa",
		"Đà Lạt", "DM for location", "https://maps.app.goo.gl/abc", "8pm",
	} {
		if plausibleVenueName(bad) {
			t.Errorf("accepted %q", bad)
		}
	}
	for _, good := range []string{"Q Coffee Roastery Dalat", "Socialhouse", "Cù Rú", "Quảng trường Lâm Viên", "LuLuLoLa Coffee+"} {
		if !plausibleVenueName(good) {
			t.Errorf("rejected %q", good)
		}
	}
}

func TestStreetAddressParsing(t *testing.T) {
	if got := normalizeStreetAddress("305 D. Tô Ngọc Vân, Xuân Hương - Đà Lạt, Lâm Đồng 670000"); got != musicBridgesAddress {
		t.Errorf("address=%q", got)
	}
	for _, good := range []string{"184 Tô Ngọc Vân, Đà Lạt", "305 Đ. Tô Ngọc Vân", "32/2 Đường 3/4, Phường Xuân Hương"} {
		if !looksLikeStreetAddress(good) {
			t.Errorf("not an address: %q", good)
		}
	}
	for _, bad := range []string{"15 reservations", "500 VND entry", "2026 Festival, Đà Lạt", "10 AM Sunday, Oct 11", "12 people max", "Đà Lạt"} {
		if looksLikeStreetAddress(bad) {
			t.Errorf("treated as an address: %q", bad)
		}
	}
	name, addr := splitVenueValue("Q Coffee Roastery Dalat 305 D. Tô Ngọc Vân, Xuân Hương - Đà Lạt, Lâm Đồng")
	if name != "Q Coffee Roastery Dalat" || normalizeStreetAddress(addr) != musicBridgesAddress {
		t.Errorf("split name=%q addr=%q", name, addr)
	}
}

func TestExtractLocationRealCaptions(t *testing.T) {
	name, _ := extractLocation(musicBridgesCaption)
	if name != "Q - Coffee Roastery Da Lat" {
		t.Errorf("music caption venue=%q", name)
	}
	name, addr := extractLocation(socialhouseCaption)
	if name != "Socialhouse" || addr != "184 Tô Ngọc Vân, Đà Lạt" {
		t.Errorf("socialhouse venue=%q addr=%q", name, addr)
	}
	if name, addr := extractLocation(womensSpaceCaption); name != "" || addr != "" {
		t.Errorf("women's space chat became venue=%q addr=%q", name, addr)
	}
	flyer := venueFromText(musicBridgesReadable)
	if flyer.Name != "Q Coffee Roastery Dalat" || flyer.Address != musicBridgesAddress {
		t.Errorf("flyer venue=%+v", flyer)
	}
}

func TestParseMapsTargetSplitsNameAndStreet(t *testing.T) {
	hit, ok := parseMapsTarget(musicBridgesMapsURL)
	if !ok || hit.Name != "Q Coffee Roastery Dalat" || hit.Address != musicBridgesAddress {
		t.Fatalf("hit=%+v ok=%v", hit, ok)
	}
}

func TestDecideMusicAndBridgesVenueFromFlyer(t *testing.T) {
	stubMaps(t, musicBridgesMapsURL)
	ex := &fakeExtractor{result: extractResult{
		IsEvent: true, IsEventFlyer: true, FromImage: true, ImageKind: "flyer",
		Title: "MUSIC AND BRIDGES between the Visible and Invisible Worlds", ReadableText: musicBridgesReadable,
		Date: "2026-10-11", Time: "10:00", EndTime: "11:30",
		VenueName: "Q Coffee Roastery Dalat", StreetAddress: "305 D. Tô Ngọc Vân, Xuân Hương - Đà Lạt, Lâm Đồng",
		LocationEvidence: "Venue: Q Coffee Roastery Dalat", DateEvidence: "Sunday, Oct 11", TimeEvidence: "10:00 - 11:30 AM",
		Price: "Free of charge", PriceEvidence: "Free of charge",
	}}
	draft, err := decide(inbound{
		ID: "3A7D4BEB94720564A322", GroupJID: "120363401543865296@g.us", GroupName: "Events & Offers",
		Sender: "s", Text: musicBridgesCaption, Timestamp: ref,
		HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
	}, nil, ex, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Location != "Q Coffee Roastery Dalat" {
		t.Fatalf("location=%q", draft.Location)
	}
	if draft.Address != musicBridgesAddress {
		t.Fatalf("address=%q", draft.Address)
	}
	start := draft.StartsAt.In(testLoc)
	if start.Day() != 11 || start.Hour() != 10 || draft.TimeInferred {
		t.Fatalf("start=%s inferred=%v", start, draft.TimeInferred)
	}
	draft.ImageURL = "https://cdn.dalat.app/event-media/wa-3a7d4beb94720564a322/1.jpg"
	row := draft.toRow("profile")
	if row["location_name"] != "Q Coffee Roastery Dalat" || row["address"] != musicBridgesAddress {
		t.Fatalf("row location=%v address=%v", row["location_name"], row["address"])
	}
	wantMaps := "https://www.google.com/maps/search/?api=1&query=Q+Coffee+Roastery+Dalat%2C+305+%C4%90.+T%C3%B4+Ng%E1%BB%8Dc+V%C3%A2n%2C+Xu%C3%A2n+H%C6%B0%C6%A1ng%2C+%C4%90%C3%A0+L%E1%BA%A1t%2C+L%C3%A2m+%C4%90%E1%BB%93ng"
	if row["google_maps_url"] != wantMaps {
		t.Fatalf("maps=%v", row["google_maps_url"])
	}
}

func TestDecideMusicAndBridgesWithoutModel(t *testing.T) {
	stubMaps(t, musicBridgesMapsURL)
	draft, err := decide(inbound{
		ID: "3A7D4BEB94720564A322", GroupName: "Events & Offers", Sender: "s",
		Text: musicBridgesCaption, Timestamp: ref,
		HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
	}, nil, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(draft.Location, "several") || !plausibleVenueName(draft.Location) {
		t.Fatalf("location=%q", draft.Location)
	}
	if draft.Address != musicBridgesAddress {
		t.Fatalf("address=%q", draft.Address)
	}
}

func TestDecideSocialhouseVenue(t *testing.T) {
	stubMaps(t, "")
	vision := &fakeExtractor{result: extractResult{
		IsEvent: true, IsEventFlyer: true, FromImage: true, ImageKind: "flyer",
		Title: "GAME NIGHT", ReadableText: socialhouseReadable,
		Date: "2026-10-09", Time: "18:00", DateEvidence: "Friday, 9th Oct", TimeEvidence: "6PM",
		VenueName: "SOCIALHOUSE DALAT", StreetAddress: "184 Tô Ngọc Vân, Đà Lạt", LocationEvidence: "SOCIALHOUSE DALAT",
	}}
	for name, ex := range map[string]extractor{"vision": vision, "no model": nil} {
		t.Run(name, func(t *testing.T) {
			draft, err := decide(inbound{
				ID: "3A719ADA4375212547B8", GroupName: "Games & Billiards 🀄️ ♦️ 🎱", Sender: "s",
				Text: socialhouseCaption, Timestamp: ref,
				HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
			}, nil, ex, ref)
			if err != nil {
				t.Fatal(err)
			}
			if draft.Location != "Socialhouse" {
				t.Fatalf("location=%q", draft.Location)
			}
			if draft.Address != "184 Tô Ngọc Vân, Đà Lạt, Lâm Đồng" {
				t.Fatalf("address=%q", draft.Address)
			}
			draft.ImageURL = "https://cdn.dalat.app/x.jpg"
			row := draft.toRow("profile")
			if got := row["google_maps_url"]; got != "https://www.google.com/maps/search/?api=1&query=Socialhouse%2C+184+T%C3%B4+Ng%E1%BB%8Dc+V%C3%A2n%2C+%C4%90%C3%A0+L%E1%BA%A1t%2C+L%C3%A2m+%C4%90%E1%BB%93ng" {
				t.Fatalf("maps=%v", got)
			}
		})
	}
}

func TestDecideWomensSpaceChatIsNotADraft(t *testing.T) {
	stubMaps(t, "")
	// The model even "grounds" the fragment; neither the venue guard nor the
	// literal-schedule gate may let it through.
	ex := &fakeExtractor{result: extractResult{
		IsEvent: true, IsEventFlyer: false, FromImage: false, ImageKind: "other",
		Title: "Saturday coffee meetup", ReadableText: "Women supporting women",
		Date: "2026-09-05", DateEvidence: "Saturday",
		VenueName: "the coffee meetups", LocationEvidence: "at the coffee meetups",
	}}
	for name, x := range map[string]extractor{"vision": ex, "no model": nil} {
		t.Run(name, func(t *testing.T) {
			_, err := decide(inbound{
				ID: "3A52C533D568EE6B6CEB", GroupName: "Women's Space", Sender: "s",
				Text: womensSpaceCaption, Timestamp: ref,
				HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
			}, nil, x, ref)
			if err == nil {
				t.Fatal("chat with a quote graphic became a draft")
			}
		})
	}
	if hasLiteralSchedule(womensSpaceCaption) {
		t.Fatal("bare weekday counted as a literal date/time")
	}
	if v := llmVenue(ex.result, womensSpaceCaption, true); v.Name != "" {
		t.Fatalf("fragment venue=%q", v.Name)
	}
}

func TestMatchVenueByNormalizedName(t *testing.T) {
	addr := "32/2 Đường 3/4, Phường Xuân Hương, Đà Lạt, Lâm Đồng"
	lat, lng := 11.92, 108.44
	venues := []venueRef{
		{ID: "lll", Slug: "lululola-coffee", Name: "LuLuLoLa Coffee+", Address: &addr, Latitude: &lat, Longitude: &lng},
		{ID: "qtlv", Slug: "quang-truong-lam-vien", Name: "Quảng trường Lâm Viên"},
		{ID: "fog", Slug: "the-fog-bar", Name: "The Fog On Site"},
		{ID: "vol", Slug: "valley-of-love", Name: "Valley of Love (Thung Lũng Tình Yêu)"},
	}
	cases := map[string]string{
		"Lululola Coffee":         "lll",
		"LULULOLA COFFEE+ 🎶":      "lll",
		"Quang Truong Lam Vien":   "qtlv",
		"the Fog On Site Dalat":   "fog",
		"Thung Lũng Tình Yêu":     "vol",
		"Q Coffee Roastery Dalat": "",
		"Socialhouse":             "",
	}
	for name, want := range cases {
		got := ""
		if v := matchVenue(name, venues); v != nil {
			got = v.ID
		}
		if got != want {
			t.Errorf("matchVenue(%q)=%q want %q", name, got, want)
		}
	}
	d := &eventDraft{Slug: "wa-x", Location: "Lululola Coffee", Address: "Đà Lạt, Lâm Đồng", StartsAt: ref, Meta: map[string]any{}}
	applyVenueMatch(d, venues)
	row := d.toRow("p")
	if row["venue_id"] != "lll" || row["address"] != addr || d.Latitude == nil {
		t.Fatalf("venue_id=%v address=%v lat=%v", row["venue_id"], row["address"], d.Latitude)
	}
}
