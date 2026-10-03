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
		}
	}
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

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
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
	case *events.LoggedOut:
		fatal("logged out by WhatsApp — delete store.db and run again to re-pair")
	case *events.HistorySync:
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
	b.ingest(in, false)
}

func (b *ingestBot) ingest(in inbound, fromHistory bool) {
	now := time.Now()
	at := in.Timestamp
	if at.IsZero() {
		at = now
	}
	history := b.memory.recent(in.GroupJID, now)
	draft, err := decide(in, history, b.extractor, now)
	remembered := memMsg{
		ID: in.ID, Sender: in.Sender, Text: in.Text, QuotedID: in.QuotedID,
		At: at, HasImage: in.HasImage || len(in.Image) > 0,
	}
	if err != nil {
		b.memory.add(in.GroupJID, remembered)
		logf("skipped: %v", err)
		return
	}
	outsideHorizon := draft.StartsAt.Before(now.Add(-6*time.Hour)) || draft.StartsAt.After(now.Add(45*24*time.Hour))
	if outsideHorizon && !draft.Cancelled {
		b.memory.add(in.GroupJID, remembered)
		if draft.StartsAt.Before(now) {
			logf("skipped %q: starts in the past (%s)", draft.Title, draft.StartsAt)
		} else {
			logf("skipped %q: beyond the 45-day horizon (%s)", draft.Title, draft.StartsAt)
		}
		return
	}
	if outsideHorizon && draft.Cancelled {
		existing, err := b.supa.lookupSlug(context.Background(), draft.Slug)
		if err != nil || existing == nil || existing.Status != "draft" {
			b.memory.add(in.GroupJID, remembered)
			logf("skipped %q: cancellation is outside the horizon and there is no draft to update", draft.Title)
			return
		}
	}
	if fromHistory {
		draft.Meta["from_history_sync"] = true
	}
	if len(in.Image) > 0 && draft.ImageURL == "" {
		if imageURL, err := b.supa.uploadFlyer(context.Background(), in.ID, in.Image, in.ImageMIME); err != nil {
			logf("flyer upload failed (continuing without image): %v", err)
		} else {
			draft.ImageURL = imageURL
			draft.ImageAlt = fmt.Sprintf("Event flyer shared by the organizer in the %s WhatsApp group", in.GroupName)
		}
	}

	row := draft.toRow(b.createdBy)
	saved, err := b.supa.saveDraft(context.Background(), row)
	if errors.Is(err, errNotMutable) {
		logf("left %q untouched: slug %s is no longer a draft", draft.Title, draft.Slug)
		remembered.IsEvent = true
		remembered.DraftSlug = draft.Slug
		remembered.Draft = draft
		b.memory.add(in.GroupJID, remembered)
		return
	}
	if err != nil {
		logf("insert failed for %q: %v", draft.Title, err)
		b.memory.add(in.GroupJID, remembered)
		return
	}
	remembered.IsEvent = true
	remembered.DraftSlug = draft.Slug
	remembered.Draft = draft
	b.memory.add(in.GroupJID, remembered)
	if draft.Cancelled {
		logf("draft cancelled: %q (%s)", draft.Title, draft.Slug)
	} else {
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
}

func (b *ingestBot) lookupGroupName(jid types.JID) string {
	if name, ok := b.groupName[jid]; ok {
		return name
	}
	name := "unknown"
	if info, err := b.client.GetGroupInfo(context.Background(), jid); err == nil && info != nil {
		name = info.Name
	}
	b.groupName[jid] = name
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
