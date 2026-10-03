package main

import (
	"strings"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/proto/waWeb"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

func TestNativeEventMessage(t *testing.T) {
	start := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	end := start.Add(2 * time.Hour)
	msg := &waE2E.Message{EventMessage: &waE2E.EventMessage{
		Name:        proto.String("Improv Playdate"),
		Description: proto.String("Bring one character"),
		StartTime:   proto.Int64(start.Unix()),
		EndTime:     proto.Int64(end.Unix()),
		JoinLink:    proto.String("https://chat.whatsapp.com/improv"),
		Location: &waE2E.LocationMessage{
			Name:             proto.String("Cù Rú"),
			Address:          proto.String("2 Đ. Phạm Hồng Thái"),
			DegreesLatitude:  proto.Float64(11.9401),
			DegreesLongitude: proto.Float64(108.438),
		},
		ExtraGuestsAllowed: proto.Bool(true),
	}}
	draft, err := decide(inbound{
		ID: "EVT1", GroupJID: "120363@g.us", GroupName: "Events & Offers",
		Sender: "alice", Timestamp: ref, Message: msg,
		HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/jpeg",
	}, nil, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Title != "Improv Playdate" || draft.Slug != "wa-evt1" || !draft.Native {
		t.Fatalf("draft=%+v", draft)
	}
	if !draft.StartsAt.Equal(start) || draft.EndsAt == nil || !draft.EndsAt.Equal(end) {
		t.Fatalf("start=%s end=%v", draft.StartsAt, draft.EndsAt)
	}
	if draft.Location != "Cù Rú" || !strings.Contains(draft.Address, "Phạm Hồng Thái") || !strings.Contains(draft.Address, "Đà Lạt") || !strings.Contains(draft.Address, "Lâm Đồng") {
		t.Fatalf("loc=%q addr=%q", draft.Location, draft.Address)
	}
	if draft.ExternalURL != "https://chat.whatsapp.com/improv" {
		t.Fatalf("link=%s", draft.ExternalURL)
	}
	if draft.Latitude == nil || *draft.Latitude != 11.9401 {
		t.Fatalf("lat=%v", draft.Latitude)
	}
	row := draft.toRow("profile")
	if row["status"] != "draft" {
		t.Fatalf("status=%v", row["status"])
	}
}

func TestNativeEditAndCancelKeepSlug(t *testing.T) {
	start := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	original := &eventDraft{
		Slug: "wa-evt1", Title: "Improv Playdate", StartsAt: start, Native: true,
		ImageURL: "https://cdn.dalat.app/event-media/wa-evt1/1.jpg",
		Meta:     map[string]any{"message_id": "EVT1"},
	}
	history := []memMsg{{
		ID: "EVT1", DraftSlug: "wa-evt1", Draft: original, IsEvent: true, At: ref,
	}}
	edited := &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
		Type: waE2E.ProtocolMessage_MESSAGE_EDIT.Enum(),
		Key:  &waCommon.MessageKey{ID: proto.String("EVT1")},
		EditedMessage: &waE2E.Message{EventMessage: &waE2E.EventMessage{
			Name:       proto.String("Improv Playdate (moved)"),
			StartTime:  proto.Int64(start.Add(time.Hour).Unix()),
			IsCanceled: proto.Bool(false),
			Location:   &waE2E.LocationMessage{Name: proto.String("The Hideout")},
		}},
	}}
	draft, err := decide(inbound{
		ID: "EDIT1", Timestamp: ref.Add(time.Minute), Message: edited, GroupName: "Events",
	}, history, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Slug != "wa-evt1" || draft.Title != "Improv Playdate (moved)" || draft.Location != "The Hideout" {
		t.Fatalf("edit draft title=%q loc=%q slug=%s", draft.Title, draft.Location, draft.Slug)
	}
	if !draft.StartsAt.Equal(start.Add(time.Hour)) {
		t.Fatalf("start=%s", draft.StartsAt)
	}

	canceled := &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
		Type: waE2E.ProtocolMessage_MESSAGE_EDIT.Enum(),
		Key:  &waCommon.MessageKey{ID: proto.String("EVT1")},
		EditedMessage: &waE2E.Message{EventMessage: &waE2E.EventMessage{
			Name:       proto.String("Improv Playdate"),
			StartTime:  proto.Int64(start.Unix()),
			IsCanceled: proto.Bool(true),
		}},
	}}
	cancelled, err := decide(inbound{ID: "EDIT2", Message: canceled, Timestamp: ref, GroupName: "Events"}, history, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if !cancelled.Cancelled || cancelled.Slug != "wa-evt1" {
		t.Fatalf("cancelled=%v slug=%s", cancelled.Cancelled, cancelled.Slug)
	}
	row := cancelled.toRow("profile")
	if row["status"] != "cancelled" {
		t.Fatalf("status=%v", row["status"])
	}
	meta := row["source_metadata"].(map[string]any)
	if meta["needs_review"] != false {
		t.Fatalf("needs_review=%v", meta["needs_review"])
	}
}

func TestNativeRevokeUpdatesExistingDraft(t *testing.T) {
	start := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	history := []memMsg{{
		ID: "EVT1", DraftSlug: "wa-evt1", IsEvent: true, At: ref,
		Draft: &eventDraft{Slug: "wa-evt1", Title: "Improv Playdate", StartsAt: start, Meta: map[string]any{"message_id": "EVT1"}},
	}}
	revoke := &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
		Type: waE2E.ProtocolMessage_REVOKE.Enum(),
		Key:  &waCommon.MessageKey{ID: proto.String("EVT1")},
	}}
	draft, err := decide(inbound{ID: "REV1", Message: revoke, Timestamp: ref, GroupName: "Events"}, history, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Slug != "wa-evt1" || !draft.Cancelled || draft.Title != "Improv Playdate" {
		t.Fatalf("%+v", draft)
	}
	if _, err := decide(inbound{ID: "REV2", Message: revoke, GroupName: "Events"}, nil, nil, ref); err == nil {
		t.Fatal("revoke of an unknown event created a row")
	}
}

func TestEventCoverAndInvite(t *testing.T) {
	start := time.Date(2026, 10, 10, 15, 0, 0, 0, time.UTC)
	cover := &waE2E.Message{EventCoverImage: &waE2E.FutureProofMessage{Message: &waE2E.Message{
		EventMessage: &waE2E.EventMessage{
			Name:      proto.String("Stand-up Comedy Workshop"),
			StartTime: proto.Int64(start.Unix()),
			JoinLink:  proto.String("https://chat.whatsapp.com/standup"),
		},
	}}}
	if _, err := decide(inbound{ID: "COVER", Message: cover, Timestamp: ref, GroupName: "Events"}, nil, nil, ref); err == nil {
		t.Fatal("cover without a public venue or flyer became a draft")
	}

	thumb := testFlyerPNG(t)
	invite := &waE2E.Message{EventInviteMessage: &waE2E.EventInviteMessage{
		EventTitle:    proto.String("Stand-up Comedy Workshop"),
		Caption:       proto.String("DM for location"),
		StartTime:     proto.Int64(start.Unix()),
		JPEGThumbnail: thumb,
		CallLink:      proto.String("https://chat.whatsapp.com/standup"),
	}}
	if _, err := decide(inbound{ID: "INV", Message: invite, Timestamp: ref, GroupName: "Events"}, nil, nil, ref); err == nil {
		t.Fatal("DM-for-location invite became a draft")
	}

	withVenue := &waE2E.Message{EventInviteMessage: &waE2E.EventInviteMessage{
		EventTitle:    proto.String("Stand-up Comedy Workshop"),
		Caption:       proto.String("at Cù Rú"),
		StartTime:     proto.Int64(start.Unix()),
		JPEGThumbnail: thumb,
		CallLink:      proto.String("https://chat.whatsapp.com/standup"),
	}}
	invited, err := decide(inbound{ID: "INV2", Message: withVenue, Timestamp: ref, GroupName: "Events"}, nil, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if invited.Location != "Cù Rú" || len(invited.Hero) == 0 {
		t.Fatalf("loc=%q hero=%d", invited.Location, len(invited.Hero))
	}
}

func TestTextEditRewritesTheSameDraft(t *testing.T) {
	original, err := decide(inbound{
		ID: "MSG1", Sender: "alice", Timestamp: ref, GroupName: "Events & Offers",
		Text:     "TECHNO CALLING\n\nOctober 3. From 8 pm \n\nLocation:\nCù Rú",
		HasImage: true, Image: testFlyerPNG(t), ImageMIME: "image/png",
	}, nil, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	history := []memMsg{{
		ID: "MSG1", Sender: "alice", Text: original.Description, IsEvent: true,
		DraftSlug: original.Slug, Draft: original, At: ref,
	}}
	editedText := "TECHNO CALLING\n\nOctober 4. From 9 pm \n\nLocation:\nThe Hideout"
	edited := &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
		Type:          waE2E.ProtocolMessage_MESSAGE_EDIT.Enum(),
		Key:           &waCommon.MessageKey{ID: proto.String("MSG1")},
		EditedMessage: &waE2E.Message{Conversation: proto.String(editedText)},
	}}
	draft, err := decide(inbound{
		ID: "EDIT9", Sender: "alice", Timestamp: ref.Add(time.Minute),
		GroupName: "Events & Offers", Text: editedText, Message: edited,
	}, history, nil, ref)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Slug != original.Slug {
		t.Fatalf("slug=%s", draft.Slug)
	}
	start := draft.StartsAt.In(testLoc)
	if start.Day() != 4 || start.Hour() != 21 || draft.Location != "The Hideout" {
		t.Fatalf("start=%s loc=%q title=%q", start, draft.Location, draft.Title)
	}
}

func TestHistorySyncReadsNativeEventsOnly(t *testing.T) {
	start := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	allowJID, err := types.ParseJID("120363421234567890@g.us")
	if err != nil {
		t.Fatal(err)
	}
	other, err := types.ParseJID("120363999999999999@g.us")
	if err != nil {
		t.Fatal(err)
	}
	eventMsg := &waE2E.Message{EventMessage: &waE2E.EventMessage{
		Name: proto.String("Improv Playdate"), StartTime: proto.Int64(start.Unix()),
	}}
	sync := &waHistorySync.HistorySync{Conversations: []*waHistorySync.Conversation{
		{
			ID:   proto.String(allowJID.String()),
			Name: proto.String("Events & Offers"),
			Messages: []*waHistorySync.HistorySyncMsg{
				{Message: &waWeb.WebMessageInfo{
					Key:              &waCommon.MessageKey{ID: proto.String("EVT1"), Participant: proto.String("alice")},
					MessageTimestamp: proto.Uint64(uint64(start.Unix())),
					Message:          eventMsg,
				}},
				{Message: &waWeb.WebMessageInfo{
					Key:              &waCommon.MessageKey{ID: proto.String("CHAT")},
					MessageTimestamp: proto.Uint64(uint64(start.Unix())),
					Message:          &waE2E.Message{Conversation: proto.String("yes")},
				}},
			},
		},
		{
			ID: proto.String(other.String()),
			Messages: []*waHistorySync.HistorySyncMsg{{Message: &waWeb.WebMessageInfo{
				Key:     &waCommon.MessageKey{ID: proto.String("OTHER")},
				Message: eventMsg,
			}}},
		},
	}}
	found := historyNativeEvents(sync, map[types.JID]bool{allowJID: true})
	if len(found) != 1 || found[0].ID != "EVT1" || found[0].GroupName != "Events & Offers" {
		t.Fatalf("%+v", found)
	}
}
