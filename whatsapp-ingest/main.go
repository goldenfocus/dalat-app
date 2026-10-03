// whatsapp-ingest listens to allowlisted WhatsApp groups via the WhatsApp Web
// multidevice protocol (whatsmeow), extracts event announcements, and inserts
// them into the dalat.app `events` table as drafts owned by the import profile.
//
// It never sends messages — read-only keeps the bot account's ban risk low.
//
// Config comes from environment variables, falling back to ../.env.local:
//
//	NEXT_PUBLIC_SUPABASE_URL     (required)
//	SUPABASE_SERVICE_ROLE_KEY    (required)
//	IMPORT_CREATED_BY            (profile UUID; defaults to resolving username "yan")
//	WHATSAPP_GROUP_JIDS          (comma-separated group JID allowlist;
//	                              empty = discovery mode: log every group + JID, ingest nothing)
//	REVIEW_HOOK_URL              (optional POST target after a draft upsert)
//	REVIEW_INGEST_KEY            (optional Bearer for REVIEW_HOOK_URL)
//	OPENAI_API_KEY               (optional vision/text; ANTHROPIC_API_KEY and
//	                              OPENROUTER_API_KEY are fallbacks)
//	WHATSAPP_EVENT_LLM           (optional openai|anthropic|openrouter|off)
//	WHATSAPP_EVENT_MODEL         (optional model override)
//	CLOUDFLARE_R2_ACCESS_KEY_ID  (required to store a flyer as the hero)
//	CLOUDFLARE_R2_SECRET_ACCESS_KEY
//	CLOUDFLARE_R2_ENDPOINT
//	CLOUDFLARE_R2_PUBLIC_URL     (https://cdn.dalat.app)
//	CLOUDFLARE_R2_BUCKET_NAME    (optional, default dalat-app-media)
//
// First run prints a QR code — scan it from the bot phone (Linked devices).
// The session persists in ./store.db, later runs reconnect silently.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/mdp/qrterminal/v3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	_ "github.com/mattn/go-sqlite3"
)

// maxMessageAge guards against ingesting backlog that WhatsApp replays on connect.
const maxMessageAge = 24 * time.Hour

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "pair":
			runPair(os.Args[2:])
			return
		case "groups":
			runGroups(os.Args[2:])
			return
		case "backfill":
			runBackfillCommand(os.Args[2:])
			return
		}
	}
	var backfill *backfillConfig
	if since := strings.TrimSpace(os.Getenv("WHATSAPP_BACKFILL_SINCE")); since != "" {
		cfg, err := backfillConfigFromStrings(since, os.Getenv("WHATSAPP_BACKFILL_UNTIL"), time.Now())
		if err != nil {
			fatal("WHATSAPP_BACKFILL_SINCE: %v", err)
		}
		backfill = cfg
	}
	runDaemon(backfill, false)
}

// runDaemon connects, ingests live allowlisted messages, and optionally runs
// one history backfill after the connection is up. With exitAfterBackfill
// the process disconnects as soon as the backfill finishes.
func runDaemon(backfill *backfillConfig, exitAfterBackfill bool) {
	ctx := context.Background()

	cfg, err := loadConfig()
	if err != nil {
		fatal("config: %v", err)
	}

	supa := newSupabaseClient(cfg.supabaseURL, cfg.supabaseServiceKey)
	createdBy := cfg.importCreatedBy
	if createdBy == "" {
		createdBy, err = supa.resolveProfileID(ctx, "yan")
		if err != nil {
			fatal("resolving import profile: %v (set IMPORT_CREATED_BY)", err)
		}
	}
	logf("draft events will be owned by profile %s", createdBy)

	bot := &ingestBot{
		supa:          supa,
		createdBy:     createdBy,
		allowlist:     cfg.groupAllowlist,
		groupName:     map[types.JID]string{},
		reviewHookURL: cfg.reviewHookURL,
		reviewHookKey: cfg.reviewHookKey,
		memory:        newGroupContext(),
		extractor:     newExtractorFromEnv(),
		media:         newEventMediaFromEnv(),
		connected:     make(chan struct{}),
		anchors:       newAnchorBook(anchorsPath),
	}
	if !bot.media.configured() {
		logf("Cloudflare R2 is not configured — flyer heroes cannot be stored, so announcements will be skipped")
	}
	if bot.extractor == nil {
		logf("event LLM is off (no OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY, or WHATSAPP_EVENT_LLM=off) — text dates still parse; flyer images need a key")
	} else {
		logf("event LLM enabled for flyer images and announcement-shaped messages")
	}

	client := newWAClient(ctx)
	bot.client = client
	client.AddEventHandler(bot.handleEvent)

	if client.Store.ID == nil {
		qrChan, _ := client.GetQRChannel(ctx)
		if err := client.Connect(); err != nil {
			fatal("connect: %v", err)
		}
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				fmt.Println("\nScan this QR code from the bot phone (WhatsApp → Linked devices → Link a device):")
				qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
			case "success":
				logf("pairing successful")
			default:
				logf("login event: %s", evt.Event)
			}
		}
	} else {
		if err := client.Connect(); err != nil {
			fatal("connect: %v", err)
		}
	}

	if len(bot.allowlist) == 0 {
		logf("WHATSAPP_GROUP_JIDS is empty — discovery mode: logging group JIDs, ingesting nothing")
	} else {
		logf("ingesting from %d allowlisted group(s)", len(bot.allowlist))
	}

	done := make(chan struct{})
	if backfill != nil {
		if len(bot.allowlist) == 0 {
			fatal("backfill needs WHATSAPP_GROUP_JIDS")
		}
		go func() {
			defer close(done)
			bot.runBackfill(ctx, *backfill)
		}()
	}

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	if exitAfterBackfill && backfill != nil {
		select {
		case <-c:
		case <-done:
		}
	} else {
		<-c
	}
	client.Disconnect()
}

type config struct {
	supabaseURL        string
	supabaseServiceKey string
	importCreatedBy    string
	reviewHookURL      string
	reviewHookKey      string
	groupAllowlist     map[types.JID]bool
}

func loadConfig() (*config, error) {
	loadDotEnv(dotEnvPath())

	cfg := &config{
		supabaseURL:        strings.TrimRight(os.Getenv("NEXT_PUBLIC_SUPABASE_URL"), "/"),
		supabaseServiceKey: os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		importCreatedBy:    os.Getenv("IMPORT_CREATED_BY"),
		reviewHookURL:      strings.TrimSpace(os.Getenv("REVIEW_HOOK_URL")),
		reviewHookKey:      os.Getenv("REVIEW_INGEST_KEY"),
		groupAllowlist:     map[types.JID]bool{},
	}
	if cfg.supabaseURL == "" || cfg.supabaseServiceKey == "" {
		return nil, fmt.Errorf("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
	}
	for _, jid := range strings.Split(os.Getenv("WHATSAPP_GROUP_JIDS"), ",") {
		jid = strings.TrimSpace(jid)
		if jid == "" {
			continue
		}
		parsed, err := types.ParseJID(jid)
		if err != nil {
			return nil, fmt.Errorf("invalid group JID %q: %w", jid, err)
		}
		cfg.groupAllowlist[parsed] = true
	}
	return cfg, nil
}

// handleEvent is the whatsmeow event handler.
func (b *ingestBot) handleEvent(evt any) {
	switch v := evt.(type) {
	case *events.Connected:
		logf("connected to WhatsApp")
		b.markConnected()
	case *events.LoggedOut:
		fatal("logged out by WhatsApp — delete store.db and run again to re-pair")
	case *events.HistorySync:
		if b.backfillClaims(v) {
			return
		}
		b.handleHistory(v)
	case *events.Message:
		b.handleMessage(v)
	}
}

type ingestBot struct {
	client        *whatsmeow.Client
	supa          *supabaseClient
	createdBy     string
	allowlist     map[types.JID]bool
	groupName     map[types.JID]string
	reviewHookURL string
	reviewHookKey string
	memory        *groupContext
	extractor     extractor
	media         *eventMedia

	groupMu       sync.Mutex
	connected     chan struct{}
	connectedOnce sync.Once
	anchors       *anchorBook
	backfillMu    sync.Mutex
	backfill      *backfillSession
}

func (b *ingestBot) markConnected() {
	if b.connected == nil {
		return
	}
	b.connectedOnce.Do(func() { close(b.connected) })
}

func (b *ingestBot) handleHistory(evt *events.HistorySync) {
	if evt == nil || len(b.allowlist) == 0 {
		return
	}
	// whatsmeow exposes no group/community event list. History sync is the
	// only backfill, and only structured event messages are read from it.
	found := historyNativeEvents(evt.Data, b.allowlist)
	if len(found) == 0 {
		return
	}
	logf("history sync: %d native event message(s) in allowlisted groups", len(found))
	for _, in := range found {
		b.ingest(in, true)
	}
}

func (b *ingestBot) handleMessage(msg *events.Message) {
	info := msg.Info
	if !info.IsGroup || info.IsFromMe {
		return
	}
	revoke := isRevokeMessage(msg)
	if time.Since(info.Timestamp) > maxMessageAge && !msg.IsEdit && !revoke {
		return // replayed backlog, not a live announcement
	}
	if len(b.allowlist) > 0 && b.allowlist[info.Chat] && b.anchors != nil {
		b.anchors.note(info)
	}
	b.processMessage(msg, b.memory, false)
}

// processMessage runs one group message through the event pipeline. Live
// messages use the daemon's shared context window; a backfill passes its
// own window so replayed history never interleaves with live chat.
func (b *ingestBot) processMessage(msg *events.Message, memory *groupContext, fromHistory bool) (out ingestOutcome, ingested bool) {
	info := msg.Info
	if !info.IsGroup || info.IsFromMe {
		return
	}
	revoke := isRevokeMessage(msg)

	groupName := b.lookupGroupName(info.Chat)
	if len(b.allowlist) > 0 && !b.allowlist[info.Chat] {
		return
	}

	text, hasImage, mime := messageText(msg)
	if len(b.allowlist) == 0 {
		logf("[discovery] group=%q jid=%s sender=%s text=%.80q", groupName, info.Chat, info.Sender, text)
		return
	}
	if text == "" && !hasImage && !revoke && !hasNativeEvent(msg) {
		if mime == "application/pdf" {
			logf("skipped pdf in %q: rendering a document is the only way to read it, and this bot does not render", groupName)
		}
		return
	}

	logf("message in %q from %s: %.80q", groupName, info.Sender, text)
	in := inboundFromEvent(msg, text, groupName)
	in.FromHistory = fromHistory
	in.HasImage = hasImage
	in.ImageMIME = mime
	if hasImage {
		data, downloadedMIME, err := b.downloadImage(msg)
		if err != nil {
			logf("image download failed (continuing with text): %v", err)
		} else {
			in.Image = data
			if downloadedMIME != "" {
				in.ImageMIME = downloadedMIME
			}
		}
	}
	if msg.Message != nil {
		if invite := msg.Message.GetEventInviteMessage(); invite != nil && len(invite.GetJPEGThumbnail()) > 0 && len(in.Image) == 0 {
			in.Image = invite.GetJPEGThumbnail()
			in.HasImage = true
			in.ImageMIME = "image/jpeg"
		}
	}
	return b.ingestWithResult(memory, in, fromHistory), true
}

func (b *ingestBot) ingest(in inbound, fromHistory bool) {
	b.ingestWithResult(b.memory, in, fromHistory)
}

// pipelineClock is the "current time" the context window and the event LLM
// see. Live messages use the wall clock. Replayed history uses the time the
// message was sent, so "tomorrow" and the 2h context window mean what they
// meant then. The 45-day horizon always uses the wall clock.
func pipelineClock(in inbound, fromHistory bool, now time.Time) time.Time {
	if fromHistory && !in.Timestamp.IsZero() && in.Timestamp.Before(now) {
		return in.Timestamp
	}
	return now
}

// ingestOutcome is what happened to one message; the backfill tallies it.
type ingestOutcome struct {
	Saved     bool
	Created   bool
	Cancelled bool
	Untouched bool
	Title     string
	Slug      string
	StartsAt  time.Time
	Skip      string
}

func (b *ingestBot) ingestWithResult(memory *groupContext, in inbound, fromHistory bool) (out ingestOutcome) {
	if memory == nil {
		memory = b.memory
	}
	now := time.Now()
	at := in.Timestamp
	if at.IsZero() {
		at = now
	}
	clock := pipelineClock(in, fromHistory, now)
	history := memory.recent(in.GroupJID, clock)
	draft, err := decide(in, history, b.extractor, clock)
	remembered := memMsg{
		ID: in.ID, Sender: in.Sender, Text: in.Text, QuotedID: in.QuotedID,
		At: at, HasImage: in.HasImage || len(in.Image) > 0,
		Image: in.Image, ImageMIME: in.ImageMIME,
	}
	if err != nil {
		memory.add(in.GroupJID, remembered)
		logf("skipped: %v", err)
		out.Skip = err.Error()
		return
	}
	out.Title, out.Slug, out.StartsAt = draft.Title, draft.Slug, draft.StartsAt
	outsideHorizon := draft.StartsAt.Before(now.Add(-6*time.Hour)) || draft.StartsAt.After(now.Add(45*24*time.Hour))
	if outsideHorizon && !draft.Cancelled {
		memory.add(in.GroupJID, remembered)
		if draft.StartsAt.Before(now) {
			logf("skipped %q: starts in the past (%s)", draft.Title, draft.StartsAt)
			out.Skip = "starts in the past"
		} else {
			logf("skipped %q: beyond the 45-day horizon (%s)", draft.Title, draft.StartsAt)
			out.Skip = "beyond the 45-day horizon"
		}
		return
	}
	if outsideHorizon && draft.Cancelled {
		existing, err := b.supa.lookupSlug(context.Background(), draft.Slug)
		if err != nil || existing == nil || existing.Status != "draft" {
			memory.add(in.GroupJID, remembered)
			logf("skipped %q: cancellation is outside the horizon and there is no draft to update", draft.Title)
			out.Skip = "cancellation outside horizon"
			return
		}
	}
	if fromHistory {
		draft.Meta["from_history_sync"] = true
	}
	if draft.ImageURL == "" && len(draft.Hero) > 0 && !draft.Cancelled {
		imageURL, err := b.media.uploadEventImage(context.Background(), draft.Slug, draft.Hero, draft.HeroMIME, now)
		if err != nil {
			memory.add(in.GroupJID, remembered)
			logf("skipped: flyer upload failed: %v", err)
			out.Skip = "flyer upload failed"
			return
		}
		draft.ImageURL = imageURL
		draft.ImageAlt = ownerHeroAlt
	}
	if draft.ImageURL == "" && !draft.Cancelled {
		memory.add(in.GroupJID, remembered)
		logf("skipped: no flyer for hero")
		out.Skip = "no flyer for hero"
		return
	}

	row := draft.toRow(b.createdBy)
	saved, err := b.supa.saveDraft(context.Background(), row)
	if errors.Is(err, errNotMutable) {
		logf("left %q untouched: slug %s is no longer a draft", draft.Title, draft.Slug)
		out.Untouched = true
		remembered.IsEvent = true
		remembered.DraftSlug = draft.Slug
		remembered.Draft = draft
		memory.add(in.GroupJID, remembered)
		return
	}
	if err != nil {
		logf("insert failed for %q: %v", draft.Title, err)
		memory.add(in.GroupJID, remembered)
		out.Skip = "insert failed"
		return
	}
	remembered.IsEvent = true
	remembered.DraftSlug = draft.Slug
	remembered.Draft = draft
	memory.add(in.GroupJID, remembered)
	out.Saved = true
	out.Cancelled = draft.Cancelled
	out.Created = saved != nil && saved.Created
	switch {
	case draft.Cancelled:
		logf("draft cancelled: %q (%s)", draft.Title, draft.Slug)
	case saved != nil && saved.Reopened:
		logf("draft reopened: %q slug=%s", draft.Title, draft.Slug)
	default:
		logf("draft upserted: %q starting %s slug=%s", draft.Title, draft.StartsAt, draft.Slug)
	}
	if b.reviewHookURL != "" && saved != nil && saved.ID != "" && !draft.Cancelled {
		payload := map[string]any{
			"type":            "draft_ready",
			"id":              saved.ID,
			"slug":            firstNonEmpty(saved.Slug, draft.Slug),
			"title":           draft.Title,
			"status":          "draft",
			"source_platform": "whatsapp",
		}
		if err := b.supa.notifyReviewHook(context.Background(), b.reviewHookURL, b.reviewHookKey, payload); err != nil {
			logf("review hook failed (draft kept): %v", err)
		}
	}
	return out
}

func (b *ingestBot) lookupGroupName(jid types.JID) string {
	b.groupMu.Lock()
	name, ok := b.groupName[jid]
	b.groupMu.Unlock()
	if ok {
		return name
	}
	name = "unknown"
	if info, err := b.client.GetGroupInfo(context.Background(), jid); err == nil && info != nil {
		name = info.Name
	}
	b.groupMu.Lock()
	b.groupName[jid] = name
	b.groupMu.Unlock()
	return name
}

// messageText returns the best text, whether the message carries an image,
// and the MIME type when one is known. PDF documents are not images: reading
// them would require rendering, which this process does not do.
func messageText(msg *events.Message) (text string, hasImage bool, mime string) {
	m := msg.Message
	if m == nil {
		return "", false, ""
	}
	inner, kind, _ := unwrapPayload(m)
	if kind == nativeRevoke {
		return "", false, ""
	}
	if inner == nil {
		inner = m
	}
	if em := inner.GetEventMessage(); em != nil {
		return strings.TrimSpace(em.GetName() + "\n" + em.GetDescription()), false, ""
	}
	if inv := inner.GetEventInviteMessage(); inv != nil {
		return strings.TrimSpace(inv.GetEventTitle() + "\n" + inv.GetCaption()), len(inv.GetJPEGThumbnail()) > 0, "image/jpeg"
	}
	if t := inner.GetConversation(); t != "" {
		return t, false, ""
	}
	if ext := inner.GetExtendedTextMessage(); ext != nil && ext.GetText() != "" {
		return ext.GetText(), false, ""
	}
	if img := inner.GetImageMessage(); img != nil {
		return img.GetCaption(), true, img.GetMimetype()
	}
	if img := m.GetImageMessage(); img != nil {
		return img.GetCaption(), true, img.GetMimetype()
	}
	if doc := m.GetDocumentMessage(); doc != nil {
		if strings.HasPrefix(doc.GetMimetype(), "image/") {
			return doc.GetCaption(), true, doc.GetMimetype()
		}
		if doc.GetMimetype() == "application/pdf" {
			return doc.GetCaption(), false, "application/pdf"
		}
	}
	return "", false, ""
}

func hasNativeEvent(msg *events.Message) bool {
	if msg == nil || msg.Message == nil {
		return false
	}
	_, ok := parseNativeMessage(msg.Message)
	return ok
}

func isRevokeMessage(msg *events.Message) bool {
	if msg == nil || msg.Message == nil {
		return false
	}
	_, kind, _ := unwrapPayload(msg.Message)
	return kind == nativeRevoke
}

// downloadImage fetches a photo or an image document. Stickers are ignored.
// A PDF is reported as an error so the caller can keep the caption only.
func (b *ingestBot) downloadImage(msg *events.Message) ([]byte, string, error) {
	if msg.Message == nil {
		return nil, "", fmt.Errorf("no message")
	}
	if img := msg.Message.GetImageMessage(); img != nil {
		data, err := b.client.Download(context.Background(), img)
		if err != nil {
			return nil, "", fmt.Errorf("download: %w", err)
		}
		return data, img.GetMimetype(), nil
	}
	inner, _, _ := unwrapPayload(msg.Message)
	if inner != nil && inner != msg.Message {
		if img := inner.GetImageMessage(); img != nil {
			data, err := b.client.Download(context.Background(), img)
			if err != nil {
				return nil, "", fmt.Errorf("download: %w", err)
			}
			return data, img.GetMimetype(), nil
		}
	}
	if doc := msg.Message.GetDocumentMessage(); doc != nil {
		if strings.HasPrefix(doc.GetMimetype(), "image/") {
			data, err := b.client.Download(context.Background(), doc)
			if err != nil {
				return nil, "", fmt.Errorf("download: %w", err)
			}
			return data, doc.GetMimetype(), nil
		}
		if doc.GetMimetype() == "application/pdf" {
			return nil, "application/pdf", fmt.Errorf("pdf flyers are not rendered")
		}
	}
	return nil, "", fmt.Errorf("no image")
}

func logf(format string, args ...any) {
	fmt.Printf(time.Now().Format("2006-01-02 15:04:05 ")+format+"\n", args...)
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "fatal: "+format+"\n", args...)
	os.Exit(1)
}
