package main

import (
	"strings"
	"sync"
	"time"
)

const (
	contextMaxMessages = 40
	contextWindow      = 2 * time.Hour
	imageFollowWindow  = 45 * time.Minute
)

// memMsg is one allowlisted group message kept so a later reply can update
// the same draft instead of becoming a second event.
type memMsg struct {
	ID        string
	Sender    string
	Text      string
	QuotedID  string
	DraftSlug string
	Draft     *eventDraft
	At        time.Time
	HasImage  bool
	Image     []byte
	ImageMIME string
	IsEvent   bool
}

type groupContext struct {
	mu     sync.Mutex
	groups map[string][]memMsg
}

func newGroupContext() *groupContext {
	return &groupContext{groups: map[string][]memMsg{}}
}

func (g *groupContext) add(group string, msg memMsg) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.groups[group] = append(prune(g.groups[group], msg.At), msg)
	trimStoredImages(g.groups[group])
}

func trimStoredImages(msgs []memMsg) {
	kept := 0
	for i := len(msgs) - 1; i >= 0; i-- {
		if len(msgs[i].Image) == 0 {
			continue
		}
		kept++
		if kept > 4 {
			msgs[i].Image = nil
		}
	}
}

func (g *groupContext) recent(group string, now time.Time) []memMsg {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := prune(append([]memMsg(nil), g.groups[group]...), now)
	g.groups[group] = out
	return out
}

func (g *groupContext) noteDraft(group, messageID, slug string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	msgs := g.groups[group]
	for i := range msgs {
		if msgs[i].ID == messageID {
			msgs[i].DraftSlug = slug
			msgs[i].IsEvent = true
		}
	}
	g.groups[group] = msgs
}

func prune(msgs []memMsg, now time.Time) []memMsg {
	cutoff := now.Add(-contextWindow)
	kept := msgs[:0]
	for _, msg := range msgs {
		if msg.At.Before(cutoff) {
			continue
		}
		kept = append(kept, msg)
	}
	if len(kept) > contextMaxMessages {
		kept = kept[len(kept)-contextMaxMessages:]
	}
	return kept
}

// anchorSlug chooses the idempotent draft key for this message.
// A quote of an earlier announcement, a same-sender follow-up, or a short
// detail posted just after a flyer reuses that announcement's slug.
func anchorSlug(history []memMsg, id, sender, quotedID, text string, at time.Time) (slug, anchorID string, merged bool) {
	if id == "" {
		return "", "", false
	}
	own := "wa-" + strings.ToLower(id)
	if slug, anchor := quotedDraft(history, quotedID, 4); slug != "" {
		return slug, anchor, true
	}
	if !isDetailFollowUp(text) {
		return own, id, false
	}
	if slug, anchor, ok := sameSenderDraft(history, sender, at); ok {
		return slug, anchor, true
	}
	if slug, anchor, ok := recentImageDraft(history, at); ok {
		return slug, anchor, true
	}
	if asksForLocation(text) {
		return own, id, false
	}
	if slug, anchor, ok := draftAfterLocationAsk(history, at); ok && runeLen(text) <= 80 {
		return slug, anchor, true
	}
	return own, id, false
}

func quotedDraft(history []memMsg, quotedID string, hops int) (slug, anchorID string) {
	if quotedID == "" || hops == 0 {
		return "", ""
	}
	for i := len(history) - 1; i >= 0; i-- {
		msg := history[i]
		if !strings.EqualFold(msg.ID, quotedID) {
			continue
		}
		if msg.DraftSlug != "" {
			return msg.DraftSlug, msg.ID
		}
		if msg.QuotedID != "" {
			return quotedDraft(history, msg.QuotedID, hops-1)
		}
	}
	return "", ""
}

func sameSenderDraft(history []memMsg, sender string, at time.Time) (string, string, bool) {
	for i := len(history) - 1; i >= 0; i-- {
		msg := history[i]
		if msg.DraftSlug == "" || !strings.EqualFold(msg.Sender, sender) {
			continue
		}
		if at.Sub(msg.At) > contextWindow {
			continue
		}
		return msg.DraftSlug, msg.ID, true
	}
	return "", "", false
}

func recentImageDraft(history []memMsg, at time.Time) (string, string, bool) {
	for i := len(history) - 1; i >= 0; i-- {
		msg := history[i]
		if msg.DraftSlug == "" || !msg.HasImage {
			continue
		}
		if at.Sub(msg.At) > imageFollowWindow || at.Sub(msg.At) < 0 {
			continue
		}
		return msg.DraftSlug, msg.ID, true
	}
	return "", "", false
}

func draftAfterLocationAsk(history []memMsg, at time.Time) (string, string, bool) {
	var askAt time.Time
	asked := false
	for _, msg := range history {
		if asksForLocation(msg.Text) {
			askAt = msg.At
			asked = true
		}
	}
	if !asked || at.Sub(askAt) > imageFollowWindow {
		return "", "", false
	}
	for i := len(history) - 1; i >= 0; i-- {
		msg := history[i]
		if msg.DraftSlug != "" && !at.Before(msg.At.Add(-contextWindow)) {
			return msg.DraftSlug, msg.ID, true
		}
	}
	return "", "", false
}

func transcript(history []memMsg, current memMsg) string {
	var b strings.Builder
	write := func(msg memMsg) {
		text := strings.TrimSpace(msg.Text)
		if len(text) > 500 {
			text = text[:500]
		}
		b.WriteString("[id=")
		b.WriteString(msg.ID)
		b.WriteString(" sender=")
		b.WriteString(msg.Sender)
		if msg.HasImage {
			b.WriteString(" image=1")
		}
		b.WriteString("] ")
		b.WriteString(text)
		b.WriteByte('\n')
	}
	for _, msg := range history {
		write(msg)
	}
	write(current)
	out := b.String()
	if len(out) > 6000 {
		out = out[len(out)-6000:]
	}
	return out
}
