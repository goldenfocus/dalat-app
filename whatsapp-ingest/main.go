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
//
// First run prints a QR code — scan it from the bot phone (Linked devices).
// The session persists in ./store.db, later runs reconnect silently.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mdp/qrterminal/v3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"

	_ "github.com/mattn/go-sqlite3"
)

// maxMessageAge guards against ingesting backlog that WhatsApp replays on connect.
const maxMessageAge = 24 * time.Hour

func main() {
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
	}

	dbLog := waLog.Stdout("Database", "WARN", true)
	container, err := sqlstore.New(ctx, "sqlite3", "file:store.db?_foreign_keys=on", dbLog)
	if err != nil {
		fatal("session store: %v", err)
	}
	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		fatal("session store: %v", err)
	}

	clientLog := waLog.Stdout("Client", "INFO", true)
	client := whatsmeow.NewClient(deviceStore, clientLog)
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
}

func (b *ingestBot) handleMessage(msg *events.Message) {
	info := msg.Info
	if !info.IsGroup || info.IsFromMe {
		return
	}
	if time.Since(info.Timestamp) > maxMessageAge {
		return // replayed backlog, not a live announcement
	}

	groupName := b.lookupGroupName(info.Chat)
	if len(b.allowlist) > 0 && !b.allowlist[info.Chat] {
		return
	}

	text, hasFlyer := messageText(msg)
	if len(b.allowlist) == 0 {
		logf("[discovery] group=%q jid=%s sender=%s text=%.80q", groupName, info.Chat, info.Sender, text)
		return
	}
	if text == "" && msg.Message.GetEventMessage() == nil {
		return
	}

	logf("message in %q from %s: %.80q", groupName, info.Sender, text)

	draft, err := buildDraft(msg, text, groupName)
	if err != nil {
		logf("skipped: %v", err)
		return
	}

	now := time.Now()
	if draft.StartsAt.Before(now.Add(-6 * time.Hour)) {
		logf("skipped %q: starts in the past (%s)", draft.Title, draft.StartsAt)
		return
	}
	if draft.StartsAt.After(now.Add(45 * 24 * time.Hour)) {
		logf("skipped %q: beyond the 45-day horizon (%s)", draft.Title, draft.StartsAt)
		return
	}

	if hasFlyer {
		if imageURL, err := b.saveFlyer(msg); err != nil {
			logf("flyer download/upload failed (continuing without image): %v", err)
		} else {
			draft.ImageURL = imageURL
			draft.ImageAlt = fmt.Sprintf("Event flyer shared by the organizer in the %s WhatsApp group", groupName)
		}
	}

	row := draft.toRow(b.createdBy)
	saved, err := b.supa.insertEvent(context.Background(), row)
	if err != nil {
		logf("insert failed for %q: %v", draft.Title, err)
		return
	}
	logf("draft created: %q starting %s", draft.Title, draft.StartsAt)
	if b.reviewHookURL != "" && saved != nil {
		payload := map[string]any{
			"type":            "draft_ready",
			"id":              saved.ID,
			"slug":            saved.Slug,
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

// messageText returns the best text content of a message and whether it carries
// an image (a potential event flyer).
func messageText(msg *events.Message) (text string, hasFlyer bool) {
	m := msg.Message
	if m == nil {
		return "", false
	}
	if em := m.GetEventMessage(); em != nil {
		return em.GetName() + "\n" + em.GetDescription(), false
	}
	if t := m.GetConversation(); t != "" {
		return t, false
	}
	if ext := m.GetExtendedTextMessage(); ext != nil && ext.GetText() != "" {
		return ext.GetText(), false
	}
	if img := m.GetImageMessage(); img != nil {
		return img.GetCaption(), true
	}
	if doc := m.GetDocumentMessage(); doc != nil {
		return doc.GetCaption(), true
	}
	return "", false
}

// saveFlyer downloads the message image and uploads it to the public
// event-media storage bucket, returning its public URL.
func (b *ingestBot) saveFlyer(msg *events.Message) (string, error) {
	img := msg.Message.GetImageMessage()
	if img == nil {
		return "", fmt.Errorf("no image message")
	}
	data, err := b.client.Download(context.Background(), img)
	if err != nil {
		return "", fmt.Errorf("download: %w", err)
	}
	return b.supa.uploadFlyer(context.Background(), string(msg.Info.ID), data, img.GetMimetype())
}

func logf(format string, args ...any) {
	fmt.Printf(time.Now().Format("2006-01-02 15:04:05 ")+format+"\n", args...)
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "fatal: "+format+"\n", args...)
	os.Exit(1)
}
