package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/proto/waWeb"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

func histMsg(id, participant string, at time.Time, fromMe bool) *waHistorySync.HistorySyncMsg {
	return &waHistorySync.HistorySyncMsg{Message: &waWeb.WebMessageInfo{
		Key: &waCommon.MessageKey{
			RemoteJID:   proto.String("120363421405257502@g.us"),
			ID:          proto.String(id),
			FromMe:      proto.Bool(fromMe),
			Participant: proto.String(participant),
		},
		MessageTimestamp: proto.Uint64(uint64(at.Unix())),
	}}
}

func TestParseBackfillTime(t *testing.T) {
	got, err := parseBackfillTime("2026-09-25")
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 9, 25, 0, 0, 0, 0, mustLoc())
	if !got.Equal(want) {
		t.Fatalf("date: got %s want %s", got, want)
	}
	got, err = parseBackfillTime("2026-10-03T02:07:00-04:00")
	if err != nil || !got.Equal(time.Date(2026, 10, 3, 6, 7, 0, 0, time.UTC)) {
		t.Fatalf("rfc3339: got %s err %v", got, err)
	}
	got, err = parseBackfillTime("2026-09-25T08:30")
	if err != nil || !got.Equal(time.Date(2026, 9, 25, 8, 30, 0, 0, mustLoc())) {
		t.Fatalf("local clock: got %s err %v", got, err)
	}
	if _, err := parseBackfillTime("last week"); err == nil {
		t.Fatal("expected an error for free text")
	}
}

func TestBackfillConfigFromStrings(t *testing.T) {
	now := time.Date(2026, 10, 3, 7, 0, 0, 0, time.UTC)
	cfg, err := backfillConfigFromStrings("2026-09-25", "", now)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Until.Equal(now) || cfg.PageSize != defaultBackfillPageSize || cfg.MaxPages != defaultBackfillMaxPages || cfg.Wait != defaultBackfillWait {
		t.Fatalf("defaults: %+v", cfg)
	}
	if _, err := backfillConfigFromStrings("2026-10-04", "", now); err == nil {
		t.Fatal("since after until must fail")
	}
	cfg, err = backfillConfigFromStrings("2026-09-25", "2026-10-03T02:07:00-04:00", now)
	if err != nil || !cfg.Until.Equal(time.Date(2026, 10, 3, 6, 7, 0, 0, time.UTC)) {
		t.Fatalf("until: %+v err %v", cfg, err)
	}
}

func TestWindowMessagesKeepsOnlyTheWindow(t *testing.T) {
	since := time.Date(2026, 9, 25, 0, 0, 0, 0, time.UTC)
	until := time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC)
	msgs := []*waHistorySync.HistorySyncMsg{
		histMsg("OLD", "a@lid", since.Add(-time.Minute), false),
		histMsg("FIRST", "a@lid", since, false),
		histMsg("MID", "b@lid", since.Add(48*time.Hour), false),
		histMsg("LIVE", "b@lid", until, false),
		histMsg("", "b@lid", since.Add(time.Hour), false),
		{Message: nil},
	}
	got := windowMessages(msgs, since, until)
	if len(got) != 2 || got[0].GetKey().GetID() != "FIRST" || got[1].GetKey().GetID() != "MID" {
		ids := []string{}
		for _, m := range got {
			ids = append(ids, m.GetKey().GetID())
		}
		t.Fatalf("got %v", ids)
	}
}

func TestOldestAnchorBuildsTheNextRequest(t *testing.T) {
	chat := types.NewJID("120363421405257502", types.GroupServer)
	base := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	msgs := []*waHistorySync.HistorySyncMsg{
		histMsg("NEWER", "1@lid", base.Add(time.Hour), false),
		histMsg("OLDEST", "62324622778567@lid", base, true),
		histMsg("MIDDLE", "2@lid", base.Add(30*time.Minute), false),
	}
	anchor, ok := oldestAnchor(chat, msgs)
	if !ok {
		t.Fatal("expected an anchor")
	}
	if anchor.ID != "OLDEST" || !anchor.Timestamp.Equal(base) || !anchor.IsFromMe || anchor.Chat != chat || !anchor.IsGroup {
		t.Fatalf("anchor=%+v", anchor)
	}
	if anchor.Sender.User != "62324622778567" || anchor.Sender.Server != types.HiddenUserServer {
		t.Fatalf("sender=%s", anchor.Sender)
	}
	if _, ok := oldestAnchor(chat, nil); ok {
		t.Fatal("empty page has no anchor")
	}
}

func TestOrderHistoryDedupesAndSortsOldestFirst(t *testing.T) {
	chat := types.NewJID("120363421405257502", types.GroupServer)
	other := types.NewJID("120363402707909902", types.GroupServer)
	base := time.Date(2026, 9, 28, 9, 0, 0, 0, time.UTC)
	item := func(c types.JID, id string, at time.Time) historyItem {
		return historyItem{Chat: c, Web: histMsg(id, "x@lid", at, false).GetMessage()}
	}
	got := orderHistory([]historyItem{
		item(chat, "C", base.Add(2*time.Hour)),
		item(chat, "A", base),
		item(other, "B", base.Add(time.Hour)),
		item(chat, "A", base), // second page overlap
		item(chat, "B2", base.Add(time.Hour)),
	})
	want := []string{"A", "B", "B2", "C"}
	if len(got) != len(want) {
		t.Fatalf("len=%d", len(got))
	}
	for i, id := range want {
		if got[i].Web.GetKey().GetID() != id {
			t.Fatalf("position %d: got %s want %s", i, got[i].Web.GetKey().GetID(), id)
		}
	}
}

func TestBackfillSessionRoutesOnDemandAnswers(t *testing.T) {
	s := newBackfillSession()
	ch := s.wait("120363421405257502@g.us")
	recent := &waHistorySync.HistorySync{SyncType: waHistorySync.HistorySync_RECENT.Enum()}
	if s.deliver(recent) {
		t.Fatal("a RECENT sync is not a backfill answer")
	}
	answer := &waHistorySync.HistorySync{
		SyncType: waHistorySync.HistorySync_ON_DEMAND.Enum(),
		Conversations: []*waHistorySync.Conversation{
			{ID: proto.String("120363421405257502@g.us"), Messages: []*waHistorySync.HistorySyncMsg{histMsg("M1", "a@lid", time.Now(), false)}},
			{ID: proto.String("999@g.us")},
		},
	}
	if !s.deliver(answer) {
		t.Fatal("ON_DEMAND must be claimed")
	}
	select {
	case conv := <-ch:
		if len(conv.GetMessages()) != 1 {
			t.Fatalf("messages=%d", len(conv.GetMessages()))
		}
	default:
		t.Fatal("waiter got nothing")
	}
	var nilSession *ingestBot = &ingestBot{}
	if nilSession.backfillClaims(nil) {
		t.Fatal("no session claims nothing")
	}
}

func TestAnchorBookPersistsNewestLiveMessage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "anchors.json")
	chat := types.NewJID("120363421405257502", types.GroupServer)
	sender := types.NewJID("62324622778567", types.HiddenUserServer)
	at := time.Date(2026, 10, 3, 6, 20, 0, 0, time.UTC)

	book := newAnchorBook(path)
	book.note(types.MessageInfo{MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsGroup: true}, ID: "NEW", Timestamp: at})
	book.note(types.MessageInfo{MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsGroup: true}, ID: "EDIT_OF_OLDER", Timestamp: at.Add(-time.Hour)})
	if !book.seenLive(chat, "NEW") || book.seenLive(chat, "OTHER") {
		t.Fatal("seenLive tracks live ids only")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("anchor file not written: %v", err)
	}

	reloaded := newAnchorBook(path)
	info, ok := reloaded.get(chat)
	if !ok {
		t.Fatal("anchor not reloaded")
	}
	if info.ID != "NEW" || !info.Timestamp.Equal(at) || info.Sender != sender || info.Chat != chat {
		t.Fatalf("info=%+v", info)
	}
	if reloaded.seenLive(chat, "NEW") {
		t.Fatal("seen ids are per process, not persisted")
	}
	if _, ok := reloaded.get(types.NewJID("1", types.GroupServer)); ok {
		t.Fatal("unknown chat has no anchor")
	}
}

func TestSecretAnchorInfoMarksOwnMessages(t *testing.T) {
	chat := types.NewJID("120363421405257502", types.GroupServer)
	now := time.Date(2026, 10, 3, 7, 0, 0, 0, time.UTC)
	own := []types.JID{types.NewJID("84900000000", types.DefaultUserServer), types.NewJID("111", types.HiddenUserServer)}
	mine := secretAnchorInfo(chat, "ID1", "111@lid", own, now)
	if !mine.IsFromMe || mine.ID != "ID1" || !mine.Timestamp.Equal(now) {
		t.Fatalf("mine=%+v", mine)
	}
	theirs := secretAnchorInfo(chat, "ID2", "222@lid", own, now)
	if theirs.IsFromMe || theirs.Sender.User != "222" {
		t.Fatalf("theirs=%+v", theirs)
	}
}

func TestPipelineClockUsesSendTimeForHistory(t *testing.T) {
	now := time.Date(2026, 10, 3, 7, 0, 0, 0, time.UTC)
	sent := time.Date(2026, 9, 27, 11, 0, 0, 0, time.UTC)
	in := inbound{Timestamp: sent}
	if got := pipelineClock(in, true, now); !got.Equal(sent) {
		t.Fatalf("history clock=%s", got)
	}
	if got := pipelineClock(in, false, now); !got.Equal(now) {
		t.Fatalf("live clock=%s", got)
	}
	if got := pipelineClock(inbound{}, true, now); !got.Equal(now) {
		t.Fatalf("zero timestamp clock=%s", got)
	}
	// The 2h context window must follow the replay clock: a flyer and its
	// follow-up from last week still see each other.
	mem := newGroupContext()
	mem.add("g", memMsg{ID: "FLYER", At: sent, DraftSlug: "wa-flyer"})
	follow := inbound{Timestamp: sent.Add(20 * time.Minute)}
	if got := mem.recent("g", pipelineClock(follow, true, now)); len(got) != 1 {
		t.Fatalf("replay window lost the flyer: %d", len(got))
	}
	if got := newGroupContextWith("g", memMsg{ID: "FLYER", At: sent}).recent("g", now); len(got) != 0 {
		t.Fatalf("wall clock window should have pruned it: %d", len(got))
	}
}

func newGroupContextWith(group string, msgs ...memMsg) *groupContext {
	g := newGroupContext()
	for _, m := range msgs {
		g.add(group, m)
	}
	return g
}

func TestRelativeDateInReplayedMessage(t *testing.T) {
	sent := time.Date(2026, 10, 2, 9, 0, 0, 0, mustLoc())
	in := inbound{
		ID: "TMRW", GroupJID: "120363421405257502@g.us", GroupName: "Events & Offers", Sender: "a@lid",
		Text: "Open mic tomorrow 7pm at Cù Rú, 2 Phạm Hồng Thái", Timestamp: sent, FromHistory: true,
	}
	// No flyer, so Review gating rejects it; the parsed start is what matters.
	draft, _ := decide(in, nil, nil, pipelineClock(in, true, sent.Add(5*24*time.Hour)))
	if draft == nil {
		t.Fatal("expected a parsed draft")
	}
	want := time.Date(2026, 10, 3, 19, 0, 0, 0, mustLoc())
	if !draft.StartsAt.Equal(want) {
		t.Fatalf("start=%s want %s", draft.StartsAt, want)
	}
}

func TestBackfillTally(t *testing.T) {
	var tally backfillTally
	tally.add(ingestOutcome{Saved: true, Created: true, Title: "New"})
	tally.add(ingestOutcome{Saved: true, Title: "Again"})
	tally.add(ingestOutcome{Saved: true, Cancelled: true})
	tally.add(ingestOutcome{Untouched: true})
	tally.add(ingestOutcome{Skip: "no flyer for hero"})
	tally.add(ingestOutcome{Skip: "no flyer for hero"})
	if len(tally.Created) != 1 || len(tally.Updated) != 1 || len(tally.Cancelled) != 1 || len(tally.Untouched) != 1 || tally.Skips["no flyer for hero"] != 2 {
		t.Fatalf("tally=%+v", tally)
	}
}
