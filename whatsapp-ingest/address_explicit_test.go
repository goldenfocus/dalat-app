package main

import (
	"strings"
	"testing"
	"time"
)

const bocelliCaption = "The performance by renowned singer Andrea Bocelli at the HAUS Da Lat project (located by Xuan Huong Lake) on November 7, 2026, is an exclusive, private event reserved for invited guests; tickets will not be made available for general public sale.\nTo attend the event, you may consider the following options\n1. Contact the organizers or the developer of the HAUS Da Lat project: The event is hosted by HAUS Da Lat, an artistic real estate project. Attendance is primarily reserved for VIP clients, strategic partners, and personal guests of the project."

func TestListItemsAndProseAreNotAddresses(t *testing.T) {
	bad := []string{
		"1. Contact the organizers or the developer of the HAUS Da Lat project: The event is hosted by HAUS Da Lat, an artistic real estate project.",
		"2) Book through the hotel lobby, Đà Lạt",
		"3 Ways To Join The Party Tonight And Have Fun With Friends, Đà Lạt",
		"1. Bring water, Đà Lạt",
	}
	for _, s := range bad {
		if looksLikeStreetAddress(s) {
			t.Errorf("looksLikeStreetAddress(%q) = true", s)
		}
		if got := normalizeStreetAddress(s); got != "" {
			t.Errorf("normalizeStreetAddress(%q) = %q", s, got)
		}
	}
	good := []string{"184 Tô Ngọc Vân, Đà Lạt", "48/8 Hà Huy Tập, Đà Lạt", "17 Bùi Thị Xuân, Đà Lạt", "305 Đ. Tô Ngọc Vân"}
	for _, s := range good {
		if !looksLikeStreetAddress(s) {
			t.Errorf("want address: %q", s)
		}
	}
	if got := streetAddressIn(bocelliCaption); got != "" {
		t.Fatalf("streetAddressIn picked %q", got)
	}
}

func TestMapsURLOnlyFromRealAddressOrMatchedVenue(t *testing.T) {
	d := &eventDraft{Location: "HAUS Da Lat", Address: "1. Contact the organizers or the developer: The event is hosted by HAUS Da Lat, Lâm Đồng"}
	if got := d.googleMapsURL(); got != "" {
		t.Fatalf("prose address built a maps URL: %s", got)
	}
	d = &eventDraft{Location: "HAUS Da Lat"}
	if got := d.googleMapsURL(); got != "" {
		t.Fatalf("bare name built a maps URL: %s", got)
	}
	d = &eventDraft{Location: "INN Đà Lạt", Address: "48/8 Hà Huy Tập, Đà Lạt"}
	if got := d.googleMapsURL(); !strings.Contains(got, "H%C3%A0+Huy+T%E1%BA%ADp") {
		t.Fatalf("real address: %s", got)
	}
	d = &eventDraft{Location: "Mây Lang Thang", VenueID: "a340582a"}
	if got := d.googleMapsURL(); !strings.Contains(got, "M%C3%A2y+Lang+Thang") {
		t.Fatalf("matched venue: %s", got)
	}
	lat, lng := 11.94, 108.44
	d = &eventDraft{Location: "x", Latitude: &lat, Longitude: &lng}
	if got := d.googleMapsURL(); !strings.Contains(got, "11.94") {
		t.Fatalf("coords: %s", got)
	}
}

func TestFragmentTitles(t *testing.T) {
	for _, s := range []string{"The performance", "It", "Our event", "This show", "The"} {
		if !isFragmentTitle(s) {
			t.Errorf("want fragment: %q", s)
		}
	}
	for _, s := range []string{"The Andrea Bocelli Concert", "Weekend Sketch Club", "Psytrance party", "The Lantern Parade Night"} {
		if isFragmentTitle(s) {
			t.Errorf("not a fragment: %q", s)
		}
	}
	if got := chooseTitle(bocelliCaption, "", "", false); got == "The performance" || isFragmentTitle(got) || got == "" {
		t.Fatalf("bocelli title %q", got)
	}
}

func TestDecideBocelliHeuristic(t *testing.T) {
	now := time.Date(2026, 10, 18, 10, 0, 0, 0, testLoc)
	d, err := decide(inbound{ID: "BOC", GroupJID: "g", GroupName: "Events & Offers", Sender: "s", Text: bocelliCaption, Timestamp: now}, nil, nil, now)
	if err != nil {
		t.Skipf("not drafted (fine): %v", err)
	}
	if strings.Contains(d.Address, "Contact") || strings.Contains(d.googleMapsURL(), "Contact") {
		t.Fatalf("address=%q maps=%q", d.Address, d.googleMapsURL())
	}
	if isFragmentTitle(d.Title) {
		t.Fatalf("title=%q", d.Title)
	}
}
