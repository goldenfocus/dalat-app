package main

// One-shot history backfill. WhatsApp only keeps message history on the
// paired phone, so the daemon asks the phone for it (an on-demand history
// sync peer message) one allowlisted group at a time, walking backwards from
// the newest known message until it reaches -since. The fetched messages are
// replayed oldest-first through the same pipeline live messages use: flyer
// vision, the per-group context window, the R2 hero upload, the
// needs_review gate, and the wa-<message id> slug that makes every save an
// idempotent upsert. Nothing is published here; drafts wait for Review.
//
// Only one client may use a device session, so the backfill runs inside the
// daemon process: either `whatsapp-ingest backfill -since 2026-09-25` (stop
// the launchd job first; the command exits when done) or the long-running
// daemon with WHATSAPP_BACKFILL_SINCE set.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/proto/waWeb"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

const (
	defaultBackfillPageSize = 50 // whatsmeow's recommended request size
	defaultBackfillMaxPages = 40
	defaultBackfillWait     = 90 * time.Second
	backfillChunkGrace      = 4 * time.Second
	backfillPagePause       = 2 * time.Second
	defaultProbeEvery       = 15 * time.Minute
	// defaultDaemonPhoneWait is how long the daemon keeps re-asking a silent
	// phone when the backfill was requested through WHATSAPP_BACKFILL_SINCE.
	defaultDaemonPhoneWait = 24 * time.Hour
	// backfillStatePath records a finished run so a daemon restart with the
	// same WHATSAPP_BACKFILL_* settings does not replay it again.
	backfillStatePath = "backfill-state.json"
	// anchorsPath keeps the newest live message per allowlisted group so a
	// later backfill can start from a message the phone certainly has.
	anchorsPath = "backfill-anchors.json"
)

type backfillConfig struct {
	Since    time.Time
	Until    time.Time
	PageSize int
	MaxPages int
	Wait     time.Duration
	DryRun   bool
	// PhoneWait keeps probing for this long when the phone does not answer
	// (0 = one attempt). ProbeEvery is the pause between probes.
	PhoneWait  time.Duration
	ProbeEvery time.Duration
	// SkipIfDone skips a run backfill-state.json already records.
	SkipIfDone bool
	// UntilSet is false when Until defaulted to the start time.
	UntilSet bool
}

// parseBackfillTime accepts 2006-01-02 (midnight in Đà Lạt), 2006-01-02T15:04
// (Đà Lạt clock), or a full RFC 3339 timestamp.
func parseBackfillTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	loc := mustLoc()
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"} {
		var (
			t   time.Time
			err error
		)
		if layout == time.RFC3339 {
			t, err = time.Parse(layout, value)
		} else {
			t, err = time.ParseInLocation(layout, value, loc)
		}
		if err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse %q (use 2026-09-25, 2026-09-25T08:00, or RFC 3339)", value)
}

func backfillConfigFromStrings(since, until string, now time.Time) (*backfillConfig, error) {
	cfg := &backfillConfig{
		PageSize:   defaultBackfillPageSize,
		MaxPages:   defaultBackfillMaxPages,
		Wait:       defaultBackfillWait,
		Until:      now,
		ProbeEvery: defaultProbeEvery,
	}
	start, err := parseBackfillTime(since)
	if err != nil {
		return nil, err
	}
	cfg.Since = start
	if strings.TrimSpace(until) != "" {
		end, err := parseBackfillTime(until)
		if err != nil {
			return nil, err
		}
		cfg.Until = end
		cfg.UntilSet = true
	}
	if !cfg.Since.Before(cfg.Until) {
		return nil, fmt.Errorf("since %s must be before until %s", cfg.Since.Format(time.RFC3339), cfg.Until.Format(time.RFC3339))
	}
	return cfg, nil
}

// runBackfillCommand is `whatsapp-ingest backfill -since 2026-09-25`.
func runBackfillCommand(args []string) {
	fs := flag.NewFlagSet("backfill", flag.ExitOnError)
	since := fs.String("since", "", "oldest message time to replay (2026-09-25, 2026-09-25T08:00 Đà Lạt time, or RFC 3339)")
	until := fs.String("until", "", "replay only messages sent before this time (default: now)")
	pageSize := fs.Int("page", defaultBackfillPageSize, "messages per history request")
	maxPages := fs.Int("max-pages", defaultBackfillMaxPages, "history requests per group")
	wait := fs.Duration("wait", defaultBackfillWait, "how long to wait for the phone to answer one request")
	dryRun := fs.Bool("dry-run", false, "fetch and list history without creating drafts")
	phoneWait := fs.Duration("phone-wait", 0, "keep re-asking a silent phone for this long (e.g. 12h); 0 = one attempt")
	probeEvery := fs.Duration("probe-every", defaultProbeEvery, "pause between probes while waiting for the phone")
	_ = fs.Parse(args)
	if strings.TrimSpace(*since) == "" {
		fatal("backfill: -since is required, e.g. -since 2026-09-25")
	}
	cfg, err := backfillConfigFromStrings(*since, *until, time.Now())
	if err != nil {
		fatal("backfill: %v", err)
	}
	if *pageSize > 0 {
		cfg.PageSize = *pageSize
	}
	if *maxPages > 0 {
		cfg.MaxPages = *maxPages
	}
	if *wait > 0 {
		cfg.Wait = *wait
	}
	cfg.DryRun = *dryRun
	cfg.PhoneWait = *phoneWait
	if *probeEvery > 0 {
		cfg.ProbeEvery = *probeEvery
	}
	runDaemon(cfg, true)
}

// backfillSession routes ON_DEMAND history-sync answers to the group
// request waiting for them.
type backfillSession struct {
	mu      sync.Mutex
	waiters map[string]chan *waHistorySync.Conversation
}

func newBackfillSession() *backfillSession {
	return &backfillSession{waiters: map[string]chan *waHistorySync.Conversation{}}
}

func (s *backfillSession) wait(chat string) chan *waHistorySync.Conversation {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch := make(chan *waHistorySync.Conversation, 16)
	s.waiters[chat] = ch
	return ch
}

func (s *backfillSession) drop(chat string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.waiters, chat)
}

// deliver hands every conversation in an ON_DEMAND blob to its waiter and
// reports whether the blob was an on-demand answer at all.
func (s *backfillSession) deliver(data *waHistorySync.HistorySync) bool {
	if data == nil || data.GetSyncType() != waHistorySync.HistorySync_ON_DEMAND {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, conv := range data.GetConversations() {
		ch, ok := s.waiters[conv.GetID()]
		if !ok {
			logf("backfill: on-demand history for %s arrived with no request waiting (late answer, ignored)", conv.GetID())
			continue
		}
		select {
		case ch <- conv:
		default:
			logf("backfill: dropped an extra history chunk for %s", conv.GetID())
		}
	}
	return true
}

// backfillClaims keeps ON_DEMAND answers away from handleHistory while a
// backfill is running, so a message is never replayed twice.
func (b *ingestBot) backfillClaims(evt *events.HistorySync) bool {
	b.backfillMu.Lock()
	session := b.backfill
	b.backfillMu.Unlock()
	if session == nil || evt == nil {
		return false
	}
	return session.deliver(evt.Data)
}

func (b *ingestBot) backfillActive() bool {
	b.backfillMu.Lock()
	defer b.backfillMu.Unlock()
	return b.backfill != nil
}

// logHistorySync records every history blob while a backfill runs, so a
// silent phone and an unrouted answer can be told apart in the log.
func (b *ingestBot) logHistorySync(evt *events.HistorySync) {
	if evt == nil || evt.Data == nil || !b.backfillActive() {
		return
	}
	logf("backfill: history sync received type=%s conversations=%d chunk=%d progress=%d",
		evt.Data.GetSyncType(), len(evt.Data.GetConversations()), evt.Data.GetChunkOrder(), evt.Data.GetProgress())
}

// logPeerResponse records the phone's peer-data answers (whatsmeow only acts
// on some of them), including error codes for refused history requests.
func (b *ingestBot) logPeerResponse(msg *events.Message) {
	if msg == nil || msg.Message == nil || !msg.Info.IsFromMe || msg.Info.IsGroup || !b.backfillActive() {
		return
	}
	pm := msg.Message.GetProtocolMessage()
	if pm == nil {
		return
	}
	resp := pm.GetPeerDataOperationRequestResponseMessage()
	if resp == nil {
		if pm.GetType() == waE2E.ProtocolMessage_HISTORY_SYNC_NOTIFICATION {
			n := pm.GetHistorySyncNotification()
			logf("backfill: phone sent a history sync notification type=%s chunk=%d", n.GetSyncType(), n.GetChunkOrder())
		}
		return
	}
	logf("backfill: phone peer response type=%s stanza=%s results=%d",
		resp.GetPeerDataOperationRequestType(), resp.GetStanzaID(), len(resp.GetPeerDataOperationResult()))
	for i, res := range resp.GetPeerDataOperationResult() {
		logf("backfill: peer result #%d media-upload=%s full-history=%s", i+1,
			res.GetMediaUploadResult(), res.GetFullHistorySyncOnDemandRequestResponse().GetResponseCode())
	}
}

func (b *ingestBot) setBackfillSession(s *backfillSession) {
	b.backfillMu.Lock()
	b.backfill = s
	b.backfillMu.Unlock()
}

// historyItem is one fetched message with the chat it came from.
type historyItem struct {
	Chat types.JID
	Name string
	Web  *waWeb.WebMessageInfo
}

func webTime(web *waWeb.WebMessageInfo) time.Time {
	return time.Unix(int64(web.GetMessageTimestamp()), 0)
}

// windowMessages keeps messages sent in [since, until).
func windowMessages(msgs []*waHistorySync.HistorySyncMsg, since, until time.Time) []*waWeb.WebMessageInfo {
	var out []*waWeb.WebMessageInfo
	for _, item := range msgs {
		web := item.GetMessage()
		if web == nil || web.GetKey().GetID() == "" {
			continue
		}
		at := webTime(web)
		if at.Before(since) || !at.Before(until) {
			continue
		}
		out = append(out, web)
	}
	return out
}

// oldestAnchor is the request anchor for the next (older) page.
func oldestAnchor(chat types.JID, msgs []*waHistorySync.HistorySyncMsg) (types.MessageInfo, bool) {
	var oldest *waWeb.WebMessageInfo
	for _, item := range msgs {
		web := item.GetMessage()
		if web == nil || web.GetKey().GetID() == "" || web.GetMessageTimestamp() == 0 {
			continue
		}
		if oldest == nil || web.GetMessageTimestamp() < oldest.GetMessageTimestamp() {
			oldest = web
		}
	}
	if oldest == nil {
		return types.MessageInfo{}, false
	}
	return anchorFromWeb(chat, oldest), true
}

func anchorFromWeb(chat types.JID, web *waWeb.WebMessageInfo) types.MessageInfo {
	info := types.MessageInfo{
		MessageSource: types.MessageSource{
			Chat:     chat,
			IsFromMe: web.GetKey().GetFromMe(),
			IsGroup:  chat.Server == types.GroupServer,
		},
		ID:        web.GetKey().GetID(),
		Timestamp: webTime(web),
	}
	participant := web.GetKey().GetParticipant()
	if participant == "" {
		participant = web.GetParticipant()
	}
	if sender, err := types.ParseJID(participant); err == nil {
		info.Sender = sender
	}
	return info
}

// orderHistory dedupes by message id and sorts oldest-first so replies are
// replayed after the announcement they answer.
func orderHistory(items []historyItem) []historyItem {
	seen := map[string]bool{}
	out := make([]historyItem, 0, len(items))
	for _, item := range items {
		id := item.Web.GetKey().GetID()
		key := item.Chat.String() + "/" + id
		if id == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, item)
	}
	sort.SliceStable(out, func(i, j int) bool {
		ti, tj := out[i].Web.GetMessageTimestamp(), out[j].Web.GetMessageTimestamp()
		if ti != tj {
			return ti < tj
		}
		return out[i].Web.GetKey().GetID() < out[j].Web.GetKey().GetID()
	})
	return out
}

// anchorBook remembers the newest live message per allowlisted group.
type anchorBook struct {
	mu      sync.Mutex
	path    string
	anchors map[string]storedAnchor
	seen    map[string]bool // message ids ingested live by this process
}

type storedAnchor struct {
	ID        string    `json:"id"`
	Sender    string    `json:"sender,omitempty"`
	FromMe    bool      `json:"from_me,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

func newAnchorBook(path string) *anchorBook {
	book := &anchorBook{path: path, anchors: map[string]storedAnchor{}, seen: map[string]bool{}}
	if path == "" {
		return book
	}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &book.anchors); err != nil {
			logf("ignoring unreadable %s: %v", path, err)
			book.anchors = map[string]storedAnchor{}
		}
	}
	return book
}

func (a *anchorBook) note(info types.MessageInfo) {
	if a == nil || info.ID == "" || info.Timestamp.IsZero() {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.seen[info.Chat.String()+"/"+info.ID] = true
	chat := info.Chat.String()
	if prev, ok := a.anchors[chat]; ok && prev.Timestamp.After(info.Timestamp) {
		return
	}
	a.anchors[chat] = storedAnchor{ID: info.ID, Sender: info.Sender.String(), FromMe: info.IsFromMe, Timestamp: info.Timestamp}
	a.saveLocked()
}

func (a *anchorBook) has(chat types.JID) bool {
	_, ok := a.get(chat)
	return ok
}

func (a *anchorBook) seenLive(chat types.JID, id string) bool {
	if a == nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.seen[chat.String()+"/"+id]
}

func (a *anchorBook) get(chat types.JID) (types.MessageInfo, bool) {
	if a == nil {
		return types.MessageInfo{}, false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	stored, ok := a.anchors[chat.String()]
	if !ok || stored.ID == "" {
		return types.MessageInfo{}, false
	}
	info := types.MessageInfo{
		MessageSource: types.MessageSource{Chat: chat, IsFromMe: stored.FromMe, IsGroup: chat.Server == types.GroupServer},
		ID:            stored.ID,
		Timestamp:     stored.Timestamp,
	}
	if sender, err := types.ParseJID(stored.Sender); err == nil {
		info.Sender = sender
	}
	return info, true
}

func (a *anchorBook) saveLocked() {
	if a.path == "" {
		return
	}
	data, err := json.MarshalIndent(a.anchors, "", "  ")
	if err != nil {
		return
	}
	tmp := a.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		logf("saving %s: %v", a.path, err)
		return
	}
	if err := os.Rename(tmp, a.path); err != nil {
		logf("saving %s: %v", a.path, err)
	}
}

// secretAnchor falls back to the newest message id whatsmeow stored a
// message secret for (live messages and the pairing history sync both store
// one). Its send time is unknown, so the request carries the current time.
func secretAnchor(ctx context.Context, chat types.JID, own []types.JID, now time.Time) (types.MessageInfo, error) {
	db, err := sql.Open("sqlite3", "file:store.db?mode=ro&_foreign_keys=on")
	if err != nil {
		return types.MessageInfo{}, err
	}
	defer db.Close()
	var id, sender string
	err = db.QueryRowContext(ctx,
		`SELECT message_id, sender_jid FROM whatsmeow_message_secrets WHERE chat_jid = ? ORDER BY rowid DESC LIMIT 1`,
		chat.String()).Scan(&id, &sender)
	if errors.Is(err, sql.ErrNoRows) {
		return types.MessageInfo{}, fmt.Errorf("no known message in %s", chat)
	}
	if err != nil {
		return types.MessageInfo{}, err
	}
	return secretAnchorInfo(chat, id, sender, own, now), nil
}

func secretAnchorInfo(chat types.JID, id, sender string, own []types.JID, now time.Time) types.MessageInfo {
	info := types.MessageInfo{
		MessageSource: types.MessageSource{Chat: chat, IsGroup: chat.Server == types.GroupServer},
		ID:            id,
		Timestamp:     now,
	}
	if parsed, err := types.ParseJID(sender); err == nil {
		info.Sender = parsed
		for _, me := range own {
			if !me.IsEmpty() && me.User == parsed.User {
				info.IsFromMe = true
			}
		}
	}
	return info
}

func (b *ingestBot) backfillAnchor(ctx context.Context, chat types.JID) (types.MessageInfo, string, error) {
	if info, ok := b.anchors.get(chat); ok {
		return info, "newest live message", nil
	}
	var own []types.JID
	if b.client != nil && b.client.Store != nil {
		if b.client.Store.ID != nil {
			own = append(own, b.client.Store.ID.ToNonAD())
		}
		own = append(own, b.client.Store.GetLID().ToNonAD())
	}
	info, err := secretAnchor(ctx, chat, own, time.Now())
	if err != nil {
		return types.MessageInfo{}, "", err
	}
	return info, "newest stored message id (send time unknown)", nil
}

// backfillTally is the summary the run logs at the end.
type backfillTally struct {
	Fetched   int
	InWindow  int
	Replayed  int
	Created   []ingestOutcome
	Updated   []ingestOutcome
	Cancelled []ingestOutcome
	Untouched []ingestOutcome
	Skips     map[string]int
}

func (t *backfillTally) add(out ingestOutcome) {
	switch {
	case out.Untouched:
		t.Untouched = append(t.Untouched, out)
	case out.Saved && out.Cancelled:
		t.Cancelled = append(t.Cancelled, out)
	case out.Saved && out.Created:
		t.Created = append(t.Created, out)
	case out.Saved:
		t.Updated = append(t.Updated, out)
	case out.Skip != "":
		if t.Skips == nil {
			t.Skips = map[string]int{}
		}
		t.Skips[out.Skip]++
	}
}

func (b *ingestBot) runBackfill(ctx context.Context, cfg backfillConfig) {
	if cfg.SkipIfDone {
		if state, ok := readBackfillState(backfillStatePath); ok && state.matches(cfg) {
			logf("backfill: %s → %s already finished at %s (delete %s to run it again)",
				cfg.Since.Format(time.RFC3339), cfg.Until.Format(time.RFC3339), state.CompletedAt.Format(time.RFC3339), backfillStatePath)
			return
		}
	}
	select {
	case <-b.connected:
	case <-time.After(3 * time.Minute):
		logf("backfill: not connected after 3 minutes, giving up")
		return
	}
	// Let the offline queue and app-state sync settle before asking the phone.
	time.Sleep(10 * time.Second)

	logf("backfill: replaying allowlisted history from %s to %s (page=%d max-pages=%d dry-run=%v phone-wait=%s)",
		cfg.Since.Format(time.RFC3339), cfg.Until.Format(time.RFC3339), cfg.PageSize, cfg.MaxPages, cfg.DryRun, cfg.PhoneWait)
	session := newBackfillSession()
	b.setBackfillSession(session)
	defer b.setBackfillSession(nil)

	chats := make([]types.JID, 0, len(b.allowlist))
	for jid := range b.allowlist {
		chats = append(chats, jid)
	}

	tally := backfillTally{}
	var items []historyItem

	// Probe with the group that has the best anchor until the phone answers.
	deadline := time.Now().Add(cfg.PhoneWait)
	var probe types.JID
	for {
		chats = orderChats(chats, b.anchors.has)
		probe = chats[0]
		res := b.fetchGroupHistory(ctx, session, probe, cfg)
		tally.Fetched += res.Fetched
		items = append(items, res.Kept...)
		if res.Answered {
			break
		}
		if cfg.PhoneWait <= 0 || time.Now().Add(cfg.ProbeEvery).After(deadline) {
			logf("backfill: the phone never answered a history request; no history fetched. Open WhatsApp on the paired phone (online, in the foreground) and run the backfill again")
			return
		}
		logf("backfill: the phone did not answer; asking again in %s (until %s)", cfg.ProbeEvery, deadline.Format(time.RFC3339))
		time.Sleep(cfg.ProbeEvery)
	}

	var silent []types.JID
	for _, chat := range chats {
		if chat == probe {
			continue
		}
		res := b.fetchGroupHistory(ctx, session, chat, cfg)
		tally.Fetched += res.Fetched
		items = append(items, res.Kept...)
		if !res.Answered {
			silent = append(silent, chat)
		}
	}
	// One more pass for groups that were silent: live chat may have given
	// them an exact anchor meanwhile.
	for _, chat := range silent {
		res := b.fetchGroupHistory(ctx, session, chat, cfg)
		tally.Fetched += res.Fetched
		items = append(items, res.Kept...)
	}

	ordered := orderHistory(items)
	tally.InWindow = len(ordered)
	logf("backfill: fetched %d message(s); %d unique in the window across %d group(s)", tally.Fetched, tally.InWindow, len(chats))

	memory := newGroupContext()
	for _, item := range ordered {
		msg, err := b.client.ParseWebMessage(item.Chat, item.Web)
		if err != nil {
			logf("backfill: unreadable message %s: %v", item.Web.GetKey().GetID(), err)
			continue
		}
		if cfg.DryRun {
			text, hasImage, _ := messageText(msg)
			logf("backfill [dry-run] %s %q from %s image=%v: %.80q",
				msg.Info.Timestamp.In(mustLoc()).Format("2006-01-02 15:04"), firstNonEmpty(item.Name, b.lookupGroupName(item.Chat)), msg.Info.Sender, hasImage, text)
			continue
		}
		if b.anchors.seenLive(item.Chat, string(msg.Info.ID)) {
			continue // the live handler already ran this message
		}
		out, ingested := b.processMessage(msg, memory, true)
		if !ingested {
			continue
		}
		tally.Replayed++
		tally.add(out)
	}
	if cfg.DryRun {
		logf("backfill [dry-run] done: %d message(s) listed, no drafts written", tally.InWindow)
		return
	}
	writeBackfillState(backfillStatePath, backfillState{
		Since: cfg.Since, Until: cfg.Until, CompletedAt: time.Now(),
		Fetched: tally.Fetched, Replayed: tally.Replayed, Created: len(tally.Created), Updated: len(tally.Updated),
	})
	logf("backfill done: fetched=%d in-window=%d replayed=%d created=%d updated=%d cancelled=%d untouched=%d",
		tally.Fetched, tally.InWindow, tally.Replayed, len(tally.Created), len(tally.Updated), len(tally.Cancelled), len(tally.Untouched))
	for _, out := range tally.Created {
		logf("backfill created: %q starting %s slug=%s", out.Title, out.StartsAt.In(mustLoc()).Format(time.RFC3339), out.Slug)
	}
	for _, out := range tally.Updated {
		logf("backfill updated: %q starting %s slug=%s", out.Title, out.StartsAt.In(mustLoc()).Format(time.RFC3339), out.Slug)
	}
	for _, out := range tally.Cancelled {
		logf("backfill cancelled: %q slug=%s", out.Title, out.Slug)
	}
	for _, out := range tally.Untouched {
		logf("backfill untouched (no longer a draft): %q slug=%s", out.Title, out.Slug)
	}
	skipKeys := make([]string, 0, len(tally.Skips))
	for k := range tally.Skips {
		skipKeys = append(skipKeys, k)
	}
	sort.Strings(skipKeys)
	for _, k := range skipKeys {
		logf("backfill skipped %d: %s", tally.Skips[k], k)
	}
}

// fetchGroupHistory pages backwards through one group. It returns how many
// messages the phone sent and the ones inside the window.
type groupFetch struct {
	Fetched  int
	Kept     []historyItem
	Answered bool
}

func (b *ingestBot) fetchGroupHistory(ctx context.Context, session *backfillSession, chat types.JID, cfg backfillConfig) (res groupFetch) {
	name := b.lookupGroupName(chat)
	anchor, source, err := b.backfillAnchor(ctx, chat)
	if err != nil {
		logf("backfill %q: no anchor message, skipping group: %v", name, err)
		return res
	}
	logf("backfill %q: starting before message %s (%s)", name, anchor.ID, source)

	for page := 1; page <= cfg.MaxPages; page++ {
		ch := session.wait(chat.String())
		req := b.client.BuildHistorySyncRequest(&anchor, cfg.PageSize)
		sent, err := b.client.SendPeerMessage(ctx, req)
		if err != nil {
			session.drop(chat.String())
			logf("backfill %q: history request failed: %v", name, err)
			break
		}
		logf("backfill %q page %d: asked the phone for %d message(s) before %s (request %s)", name, page, cfg.PageSize, anchor.ID, sent.ID)
		var msgs []*waHistorySync.HistorySyncMsg
		select {
		case conv := <-ch:
			msgs = append(msgs, conv.GetMessages()...)
			if conv.GetName() != "" {
				name = conv.GetName()
			}
		case <-time.After(cfg.Wait):
			session.drop(chat.String())
			logf("backfill %q page %d: no answer from the phone after %s (is it online?)", name, page, cfg.Wait)
			return res
		}
		res.Answered = true
		// An answer can arrive in more than one chunk.
	drain:
		for {
			select {
			case conv := <-ch:
				msgs = append(msgs, conv.GetMessages()...)
			case <-time.After(backfillChunkGrace):
				break drain
			}
		}
		session.drop(chat.String())

		res.Fetched += len(msgs)
		for _, web := range windowMessages(msgs, cfg.Since, cfg.Until) {
			res.Kept = append(res.Kept, historyItem{Chat: chat, Name: name, Web: web})
		}
		next, ok := oldestAnchor(chat, msgs)
		if !ok {
			logf("backfill %q page %d: phone returned no messages", name, page)
			break
		}
		logf("backfill %q page %d: %d message(s), oldest %s", name, page, len(msgs), next.Timestamp.In(mustLoc()).Format("2006-01-02 15:04"))
		if next.ID == anchor.ID || (!next.Timestamp.Before(anchor.Timestamp) && page > 1) {
			break // no progress
		}
		if next.Timestamp.Before(cfg.Since) {
			break
		}
		anchor = next
		time.Sleep(backfillPagePause)
	}
	return res
}

// orderChats puts groups with an exact live anchor first, then by JID.
func orderChats(chats []types.JID, hasLive func(types.JID) bool) []types.JID {
	out := append([]types.JID(nil), chats...)
	sort.SliceStable(out, func(i, j int) bool {
		li, lj := hasLive(out[i]), hasLive(out[j])
		if li != lj {
			return li
		}
		return out[i].String() < out[j].String()
	})
	return out
}

type backfillState struct {
	Since       time.Time `json:"since"`
	Until       time.Time `json:"until"`
	CompletedAt time.Time `json:"completed_at"`
	Fetched     int       `json:"fetched"`
	Replayed    int       `json:"replayed"`
	Created     int       `json:"created"`
	Updated     int       `json:"updated"`
}

func (s backfillState) matches(cfg backfillConfig) bool {
	if !s.Since.Equal(cfg.Since) {
		return false
	}
	return !cfg.UntilSet || s.Until.Equal(cfg.Until)
}

func readBackfillState(path string) (backfillState, bool) {
	var state backfillState
	data, err := os.ReadFile(path)
	if err != nil {
		return state, false
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, false
	}
	return state, true
}

func writeBackfillState(path string, state backfillState) {
	data, err := json.MarshalIndent(state, "", "  ")
	if err == nil {
		err = os.WriteFile(path, data, 0o600)
	}
	if err != nil {
		logf("backfill: could not record completion in %s: %v", path, err)
	}
}
