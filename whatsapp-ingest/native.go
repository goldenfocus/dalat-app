package main

import (
	"strings"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// nativeKind classifies a WhatsApp-structured event payload.
type nativeKind string

const (
	nativeNone   nativeKind = ""
	nativeEvent  nativeKind = "event"
	nativeInvite nativeKind = "invite"
	nativeEdit   nativeKind = "edit"
	nativeRevoke nativeKind = "revoke"
)

type nativePayload struct {
	Kind       nativeKind
	OriginalID string
	Title      string
	Text       string
	Location   string
	Address    string
	JoinLink   string
	Start      time.Time
	End        *time.Time
	Cancelled  bool
	Latitude   *float64
	Longitude  *float64
	ExtraGuest bool
	CoverJPEG  []byte
}

// unwrapPayload walks edit wrappers and event-cover envelopes. whatsmeow does
// not unwrap EventCoverImage itself; the inner message is still protobuf, so
// nothing has to be rendered.
func unwrapPayload(msg *waE2E.Message) (inner *waE2E.Message, kind nativeKind, originalID string) {
	inner = msg
	for depth := 0; depth < 4 && inner != nil; depth++ {
		if cover := inner.GetEventCoverImage().GetMessage(); cover != nil {
			inner = cover
			continue
		}
		if edited := inner.GetEditedMessage().GetMessage(); edited != nil {
			inner = edited
			kind = nativeEdit
			continue
		}
		if pm := inner.GetProtocolMessage(); pm != nil && pm.Type != nil {
			switch pm.GetType() {
			case waE2E.ProtocolMessage_MESSAGE_EDIT:
				if pm.GetKey().GetID() != "" {
					originalID = pm.GetKey().GetID()
				}
				kind = nativeEdit
				if pm.GetEditedMessage() != nil {
					inner = pm.GetEditedMessage()
					continue
				}
			case waE2E.ProtocolMessage_REVOKE:
				kind = nativeRevoke
				originalID = pm.GetKey().GetID()
				return inner, kind, originalID
			}
		}
		break
	}
	return inner, kind, originalID
}

func parseNativeMessage(msg *waE2E.Message) (nativePayload, bool) {
	inner, kind, originalID := unwrapPayload(msg)
	if kind == nativeRevoke {
		return nativePayload{Kind: nativeRevoke, OriginalID: originalID, Cancelled: true}, originalID != ""
	}
	for _, candidate := range []*waE2E.Message{inner, msg} {
		if candidate == nil {
			continue
		}
		if em := candidate.GetEventMessage(); em != nil {
			payload := eventPayload(em)
			payload.Kind = nativeEvent
			if kind == nativeEdit {
				payload.Kind = nativeEdit
			}
			payload.OriginalID = originalID
			if cover := jpegFromMessage(candidate); len(cover) > 0 {
				payload.CoverJPEG = cover
			}
			return payload, payload.Title != "" || !payload.Start.IsZero() || payload.Cancelled
		}
		if inv := candidate.GetEventInviteMessage(); inv != nil {
			payload := invitePayload(inv)
			payload.Kind = nativeInvite
			if kind == nativeEdit {
				payload.Kind = nativeEdit
			}
			payload.OriginalID = originalID
			return payload, payload.Title != "" || !payload.Start.IsZero() || payload.Cancelled
		}
	}
	return nativePayload{}, false
}

func eventPayload(em *waE2E.EventMessage) nativePayload {
	payload := nativePayload{
		Title:      strings.TrimSpace(em.GetName()),
		Text:       strings.TrimSpace(em.GetName() + "\n" + em.GetDescription()),
		JoinLink:   strings.TrimSpace(em.GetJoinLink()),
		Cancelled:  em.GetIsCanceled(),
		ExtraGuest: em.GetExtraGuestsAllowed(),
	}
	if em.GetStartTime() > 0 {
		payload.Start = time.Unix(em.GetStartTime(), 0)
	}
	if em.GetEndTime() > 0 {
		end := time.Unix(em.GetEndTime(), 0)
		payload.End = &end
	}
	if loc := em.GetLocation(); loc != nil {
		payload.Location = strings.TrimSpace(loc.GetName())
		payload.Address = strings.TrimSpace(loc.GetAddress())
		if loc.DegreesLatitude != nil && loc.DegreesLongitude != nil {
			lat, lng := loc.GetDegreesLatitude(), loc.GetDegreesLongitude()
			payload.Latitude = &lat
			payload.Longitude = &lng
		}
	}
	if isCityOnly(payload.Location) {
		payload.Location = ""
	}
	return payload
}

func invitePayload(inv *waE2E.EventInviteMessage) nativePayload {
	payload := nativePayload{
		Title:     strings.TrimSpace(inv.GetEventTitle()),
		Text:      strings.TrimSpace(inv.GetEventTitle() + "\n" + inv.GetCaption()),
		JoinLink:  strings.TrimSpace(inv.GetCallLink()),
		Cancelled: inv.GetIsCanceled(),
		CoverJPEG: inv.GetJPEGThumbnail(),
	}
	if inv.GetStartTime() > 0 {
		payload.Start = time.Unix(inv.GetStartTime(), 0)
	}
	if inv.GetEndTime() > 0 {
		end := time.Unix(inv.GetEndTime(), 0)
		payload.End = &end
	}
	return payload
}

func jpegFromMessage(msg *waE2E.Message) []byte {
	if img := msg.GetImageMessage(); img != nil && len(img.GetJPEGThumbnail()) > 0 {
		return img.GetJPEGThumbnail()
	}
	return nil
}

func nativeDraft(in inbound, payload nativePayload) *eventDraft {
	id := in.ID
	if payload.OriginalID != "" {
		id = payload.OriginalID
	}
	draft := baseDraft(in)
	draft.Slug = "wa-" + strings.ToLower(id)
	draft.Title = payload.Title
	if draft.Title == "" {
		draft.Title = firstLine(payload.Text)
	}
	draft.Description = strings.TrimSpace(payload.Text)
	if draft.Description == "" {
		draft.Description = in.Text
	}
	draft.Description = withCommunityLine(draft.Description, in.GroupName)
	draft.Location = payload.Location
	draft.Address = payload.Address
	draft.ExternalURL = payload.JoinLink
	draft.StartsAt = payload.Start
	draft.EndsAt = payload.End
	draft.Cancelled = payload.Cancelled
	draft.Latitude = payload.Latitude
	draft.Longitude = payload.Longitude
	draft.Native = true
	draft.Extraction = "native"
	if payload.ExtraGuest {
		draft.Meta["extra_guests_allowed"] = true
	}
	if payload.Kind == nativeEdit {
		draft.Meta["native_edit"] = true
	}
	if payload.Kind == nativeRevoke || payload.Cancelled {
		draft.Cancelled = true
		draft.Meta["native_canceled"] = true
	}
	draft.Meta["message_id"] = id
	return draft
}

// historyNativeEvents returns structured events from a history blob for the
// allowlisted groups. whatsmeow has no group or community event-list RPC;
// history sync is the only backfill of events that were created before the
// daemon connected. Chat photos in history are ignored.
func historyNativeEvents(sync *waHistorySync.HistorySync, allow map[types.JID]bool) []inbound {
	if sync == nil {
		return nil
	}
	var out []inbound
	for _, conv := range sync.GetConversations() {
		jid, err := types.ParseJID(conv.GetID())
		if err != nil {
			continue
		}
		if len(allow) > 0 && !allow[jid] {
			continue
		}
		name := conv.GetName()
		if name == "" {
			name = conv.GetDisplayName()
		}
		for _, item := range conv.GetMessages() {
			web := item.GetMessage()
			if web == nil || web.GetMessage() == nil {
				continue
			}
			if _, ok := parseNativeMessage(web.GetMessage()); !ok {
				continue
			}
			id := web.GetKey().GetID()
			sender := web.GetKey().GetParticipant()
			if sender == "" {
				sender = web.GetParticipant()
			}
			out = append(out, inbound{
				ID:          id,
				GroupJID:    jid.String(),
				GroupName:   name,
				Sender:      sender,
				Timestamp:   time.Unix(int64(web.GetMessageTimestamp()), 0),
				Text:        messagePlainText(web.GetMessage()),
				Message:     web.GetMessage(),
				FromHistory: true,
			})
		}
	}
	return out
}

func messagePlainText(msg *waE2E.Message) string {
	inner, _, _ := unwrapPayload(msg)
	if inner == nil {
		return ""
	}
	if em := inner.GetEventMessage(); em != nil {
		return strings.TrimSpace(em.GetName() + "\n" + em.GetDescription())
	}
	if inv := inner.GetEventInviteMessage(); inv != nil {
		return strings.TrimSpace(inv.GetEventTitle() + "\n" + inv.GetCaption())
	}
	if t := inner.GetConversation(); t != "" {
		return t
	}
	if ext := inner.GetExtendedTextMessage(); ext != nil && ext.GetText() != "" {
		return ext.GetText()
	}
	if img := inner.GetImageMessage(); img != nil {
		return img.GetCaption()
	}
	return ""
}

// quotedRef reads the reply target WhatsApp puts on text and image messages.
func quotedRef(msg *waE2E.Message) (id, text string) {
	inner, _, _ := unwrapPayload(msg)
	if inner == nil {
		inner = msg
	}
	var info *waE2E.ContextInfo
	switch {
	case inner.GetExtendedTextMessage() != nil:
		info = inner.GetExtendedTextMessage().GetContextInfo()
	case inner.GetImageMessage() != nil:
		info = inner.GetImageMessage().GetContextInfo()
	case inner.GetConversation() != "" && inner.GetExtendedTextMessage() == nil:
		return "", ""
	}
	if info == nil && inner.GetEventMessage() != nil {
		info = inner.GetEventMessage().GetContextInfo()
	}
	if info == nil {
		return "", ""
	}
	quoted := ""
	if q := info.GetQuotedMessage(); q != nil {
		quoted = messagePlainText(q)
	}
	return info.GetStanzaID(), quoted
}

func inboundFromEvent(msg *events.Message, text, groupName string) inbound {
	in := inbound{
		ID:        string(msg.Info.ID),
		GroupJID:  msg.Info.Chat.String(),
		GroupName: groupName,
		Sender:    msg.Info.Sender.String(),
		Timestamp: msg.Info.Timestamp,
		Text:      text,
		IsEdit:    msg.IsEdit,
	}
	if msg.Message != nil {
		in.Message = msg.Message
		in.QuotedID, in.QuotedText = quotedRef(msg.Message)
	}
	return in
}
