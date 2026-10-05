package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
)

// inbound is one allowlisted group message, already downloaded when it has an image.
type inbound struct {
	ID          string
	GroupJID    string
	GroupName   string
	Sender      string
	Text        string
	QuotedID    string
	QuotedText  string
	ImageMIME   string
	Timestamp   time.Time
	HasImage    bool
	Image       []byte
	AlbumParent string // WhatsApp MEDIA_ALBUM parent message id when present
	Message     *waE2E.Message
	IsEdit      bool
	FromHistory bool
}

func baseDraft(in inbound) *eventDraft {
	shared := in.Timestamp
	if shared.IsZero() {
		shared = time.Now()
	}
	return &eventDraft{
		Slug:        "wa-" + strings.ToLower(in.ID),
		Description: strings.TrimSpace(in.Text),
		Meta: map[string]any{
			"channel":    "whatsapp-group",
			"group_jid":  in.GroupJID,
			"group_name": in.GroupName,
			"sender":     in.Sender,
			"message_id": in.ID,
			"shared_at":  shared.UTC().Format(time.RFC3339),
		},
	}
}

func withCommunityLine(desc, group string) string {
	name := strings.TrimSpace(group)
	if name == "" {
		name = "unknown"
	}
	line := fmt.Sprintf("Shared in the %q WhatsApp group of the Life in Đà Lạt community.", name)
	desc = stripCommunity(desc)
	if desc == "" {
		return line
	}
	return desc + "\n\n" + line
}

func stripCommunity(desc string) string {
	const marker = "\n\nShared in the "
	if i := strings.Index(desc, marker); i >= 0 && strings.Contains(desc[i:], "Life in Đà Lạt community.") {
		return strings.TrimSpace(desc[:i])
	}
	return strings.TrimSpace(desc)
}

func nativeFromInbound(in inbound) (*eventDraft, bool) {
	draft, handled, err := applyNative(in, nil)
	return draft, handled && err == nil && draft != nil
}

// decide turns one message plus the recent group window into a draft, or an
// error the caller logs as a skip. It calls the LLM only for images and for
// texts that pass mightBeEvent.
func decide(in inbound, history []memMsg, ex extractor, now time.Time) (*eventDraft, error) {
	normalizeEdit(&in)
	if in.Message != nil {
		if draft, handled, err := applyNative(in, history); handled {
			if err != nil || draft == nil || draft.Cancelled {
				return draft, err
			}
			return draft, prepareReview(draft, in, history)
		}
	}
	if isChitChat(in.Text) || isPersonalMealPlan(in.Text) {
		return nil, fmt.Errorf("not an event")
	}
	if !in.HasImage && !mightBeEvent(in.Text) {
		return nil, fmt.Errorf("not an event")
	}

	loc := mustLoc()
	ref := in.Timestamp
	if ref.IsZero() {
		ref = now
	}

	burst := collectPhotoBurst(history, in, ref)

	var llm extractResult
	llmOK := false
	if ex != nil {
		parsed, err := ex.Extract(context.Background(), extractRequest{
			Text:      burst.Caption,
			Context:   transcript(history, memMsg{ID: in.ID, Sender: in.Sender, Text: burst.Caption, HasImage: in.HasImage}),
			GroupName: in.GroupName,
			Image:     firstImage(burst.Images, in.Image),
			Images:    burst.Images,
			MIME:      in.ImageMIME,
			Now:       now,
		})
		if err == nil {
			llm = parsed
			llmOK = true
		}
	}

	if in.HasImage && !hasCaptionEventText(burst.Caption) && !(llmOK && flyerHasEventText(llm)) {
		return nil, fmt.Errorf("image is not an event flyer")
	}
	if in.HasImage && llmOK && !llm.IsEvent && !hasCaptionEventText(burst.Caption) && !flyerHasEventText(llm) {
		return nil, fmt.Errorf("image is not an event")
	}
	if llmOK && !llm.IsEvent && !in.HasImage && !hasCalendarSignal(in.Text) && !hasWeekdaySignal(in.Text) {
		return nil, fmt.Errorf("not an event")
	}

	slug, anchorID, merged := anchorSlug(history, in.ID, in.Sender, in.QuotedID, in.Text, ref)
	if burst.AnchorID != "" && burst.AnchorID != in.ID {
		slug = "wa-" + strings.ToLower(burst.AnchorID)
		anchorID = burst.AnchorID
		merged = true
	}
	if in.IsEdit {
		slug = "wa-" + strings.ToLower(in.ID)
		anchorID = in.ID
		if latestDraft(history, slug) != nil {
			merged = true
		}
	}
	if llmOK && llm.UpdatesMessageID != "" {
		if linked, linkedID := quotedDraft(history, llm.UpdatesMessageID, 1); linked != "" {
			slug, anchorID, merged = linked, linkedID, true
		}
	}

	var draft *eventDraft
	if merged {
		if prev := latestDraft(history, slug); prev != nil {
			draft = cloneDraft(prev)
		}
	}
	if draft == nil {
		draft = baseDraft(in)
		draft.Slug = slug
		draft.Meta["message_id"] = anchorID
		merged = false
	} else {
		draft.Meta["message_id"] = anchorID
		if in.ID != "" && !strings.EqualFold(in.ID, anchorID) {
			draft.MergedIDs = append(draft.MergedIDs, in.ID)
		}
	}

	corpus := in.Text
	if in.QuotedText != "" {
		corpus += "\n" + in.QuotedText
	}
	if llmOK && llm.IsEvent {
		applyLLM(draft, llm, corpus, in.HasImage, loc)
	}
	if llmOK {
		stampVisionMeta(draft, llm, in.HasImage)
	}
	for _, mateID := range burst.MateIDs {
		if mateID != "" && !strings.EqualFold(mateID, anchorID) && !strings.EqualFold(mateID, in.ID) {
			draft.MergedIDs = appendUnique(draft.MergedIDs, mateID)
		}
	}

	captionForTime := firstNonEmpty(burst.Caption, in.Text)
	if start, inferred, err := extractStartTime(captionForTime, loc, ref); err == nil {
		// A follow-up that actually names a day replaces the schedule. A
		// message with only a venue leaves the previous start alone because
		// extractStartTime fails when it cannot see a date.
		draft.StartsAt = start
		draft.TimeInferred = inferred
	}
	if location, address := venueFrom(in); location != "" {
		draft.Location = location
		if address != "" {
			draft.Address = address
		}
	}
	if in.IsEdit || !merged || draft.Title == "" || weakTitle(draft.Title) {
		if llmOK && in.HasImage && llm.IsEventFlyer && strings.TrimSpace(llm.Title) != "" && !in.IsEdit {
			draft.Title = strings.TrimSpace(llm.Title)
		} else if title := firstLine(firstNonEmpty(burst.Caption, in.Text)); title != "" {
			draft.Title = title
		}
	}
	if caption := firstNonEmpty(burst.Caption, in.Text); caption != "" {
		if in.IsEdit {
			draft.Description = caption
		} else {
			draft.Description = mergeText(stripCommunity(draft.Description), caption)
		}
	}
	draft.Description = withCommunityLine(draft.Description, in.GroupName)
	if textSaysCancelled(in.Text) || (llmOK && llm.Cancelled && (in.HasImage && llm.FromImage && llm.IsEventFlyer || textSaysCancelled(corpus))) {
		draft.Cancelled = true
	}
	switch {
	case in.HasImage && llmOK:
		draft.Extraction = "vision"
	case llmOK:
		draft.Extraction = "llm"
	default:
		if draft.Extraction == "" {
			draft.Extraction = "heuristic"
		}
	}

	if draft.StartsAt.IsZero() {
		return nil, fmt.Errorf("no date found in message")
	}
	if strings.TrimSpace(draft.Title) == "" {
		return nil, fmt.Errorf("no title extractable")
	}
	return draft, prepareReview(draft, in, history)
}

func normalizeEdit(in *inbound) {
	if in == nil || in.Message == nil {
		return
	}
	_, kind, original := unwrapPayload(in.Message)
	if kind == nativeEdit && original != "" {
		in.ID = original
		in.IsEdit = true
	}
}

func applyNative(in inbound, history []memMsg) (*eventDraft, bool, error) {
	payload, ok := parseNativeMessage(in.Message)
	if !ok {
		return nil, false, nil
	}
	if payload.Kind == nativeRevoke {
		slug := "wa-" + strings.ToLower(payload.OriginalID)
		prev := latestDraft(history, slug)
		if prev == nil {
			return nil, true, fmt.Errorf("revoke of unknown event")
		}
		draft := cloneDraft(prev)
		draft.Cancelled = true
		draft.Meta["native_canceled"] = true
		draft.Extraction = "native"
		if in.ID != "" {
			draft.MergedIDs = append(draft.MergedIDs, in.ID)
		}
		return draft, true, nil
	}

	draft := nativeDraft(in, payload)
	if prev := latestDraft(history, draft.Slug); prev != nil {
		merged := cloneDraft(prev)
		if payload.Title != "" {
			merged.Title = payload.Title
		}
		if !payload.Start.IsZero() {
			merged.StartsAt = payload.Start
			merged.TimeInferred = false
		}
		if payload.End != nil {
			merged.EndsAt = payload.End
		}
		if payload.Location != "" {
			merged.Location = payload.Location
		}
		if payload.Address != "" {
			merged.Address = payload.Address
		}
		if payload.JoinLink != "" {
			merged.ExternalURL = payload.JoinLink
		}
		if payload.Latitude != nil && payload.Longitude != nil {
			merged.Latitude = payload.Latitude
			merged.Longitude = payload.Longitude
		}
		if payload.Cancelled {
			merged.Cancelled = true
		}
		merged.Description = withCommunityLine(mergeText(stripCommunity(merged.Description), payload.Text), in.GroupName)
		merged.Native = true
		merged.Extraction = "native"
		merged.Meta["native_event"] = true
		if payload.Kind == nativeEdit {
			merged.Meta["native_edit"] = true
		}
		if in.ID != "" && !strings.EqualFold(in.ID, strings.TrimPrefix(merged.Slug, "wa-")) {
			merged.MergedIDs = append(merged.MergedIDs, in.ID)
		}
		return merged, true, nil
	}
	if payload.Start.IsZero() && !payload.Cancelled {
		return nil, true, fmt.Errorf("event message %q has no start time", payload.Title)
	}
	if draft.Title == "" {
		return nil, true, fmt.Errorf("no title extractable")
	}
	return draft, true, nil
}

func venueFrom(in inbound) (string, string) {
	if name, address := extractLocation(in.Text); name != "" {
		return name, address
	}
	return extractLocation(in.QuotedText)
}

func applyLLM(draft *eventDraft, llm extractResult, corpus string, hasImage bool, loc *time.Location) {
	readable := strings.TrimSpace(llm.ReadableText)
	imageFact := hasImage && llm.FromImage && llm.IsEventFlyer && readable != ""
	evidenceCorpus := corpus
	if readable != "" {
		evidenceCorpus = corpus + "\n" + readable
	}
	if when, ok := groundedWhen(llm.Date, llm.Time, llm.DateEvidence, evidenceCorpus, imageFact, readable, loc); ok && draft.StartsAt.IsZero() {
		draft.StartsAt = when
		draft.TimeInferred = !literalEvidence(evidenceCorpus, llm.TimeEvidence, llm.Time)
	}
	if llm.EndTime != "" {
		if end, ok := groundedWhen(firstNonEmpty(llm.EndDate, llm.Date), llm.EndTime, llm.DateEvidence, evidenceCorpus, imageFact, readable, loc); ok {
			draft.EndsAt = &end
		}
	}
	if name, ok := groundedText(llm.Location, llm.LocationEvidence, evidenceCorpus, imageFact, readable); ok && draft.Location == "" && !isCityOnly(name) {
		draft.Location = name
	}
	if addr, ok := groundedText(llm.Address, llm.LocationEvidence, evidenceCorpus, imageFact, readable); ok && draft.Address == "" && !isCityOnly(addr) {
		draft.Address = addr
	}
	if price, ok := groundedText(llm.Price, llm.PriceEvidence, evidenceCorpus, imageFact, readable); ok && draft.PriceText == "" {
		draft.PriceText = price
		draft.PriceInferred = !literalEvidence(evidenceCorpus, llm.PriceEvidence, llm.Price)
	}
	if org, ok := groundedText(llm.Organizer, llm.OrganizerEvidence, evidenceCorpus, imageFact, readable); ok && draft.Organizer == "" {
		draft.Organizer = org
	}
}

func stampVisionMeta(draft *eventDraft, llm extractResult, hasImage bool) {
	if draft.Meta == nil {
		draft.Meta = map[string]any{}
	}
	if hasImage {
		draft.IsEventFlyer = llm.IsEventFlyer
		draft.ImageKind = strings.TrimSpace(llm.ImageKind)
		if draft.ImageKind == "" {
			if llm.IsEventFlyer {
				draft.ImageKind = "flyer"
			} else {
				draft.ImageKind = "other"
			}
		}
		draft.ReadableText = strings.TrimSpace(llm.ReadableText)
		draft.PersonalPhoto = isPersonalPhotoKind(draft.ImageKind) || (hasImage && !llm.IsEventFlyer && isPersonalPhotoKind(llm.ImageKind))
		if isPersonalPhotoKind(draft.ImageKind) {
			draft.PersonalPhoto = true
		}
		draft.Meta["is_event_flyer"] = llm.IsEventFlyer
		draft.Meta["image_kind"] = draft.ImageKind
		if draft.ReadableText != "" {
			draft.Meta["readable_text"] = draft.ReadableText
			draft.Meta["source_text_evidence"] = draft.ReadableText
		}
		if draft.PersonalPhoto {
			draft.Meta["personal_photo_hero"] = true
		}
	}
}

func isPersonalPhotoKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "photo_of_people", "scenery", "food":
		return true
	default:
		return false
	}
}

func groundedWhen(date, clock, evidence, corpus string, imageFact bool, readable string, loc *time.Location) (time.Time, bool) {
	if strings.TrimSpace(date) == "" {
		return time.Time{}, false
	}
	if imageFact {
		if !evidenceIn(readable, evidence) && !evidenceIn(readable, date) && !evidenceIn(corpus, evidence) {
			return time.Time{}, false
		}
	} else if !evidenceIn(corpus, evidence) {
		return time.Time{}, false
	}
	return composeWhen(date, clock, loc)
}

func groundedText(value, evidence, corpus string, imageFact bool, readable string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	if imageFact {
		if evidenceIn(readable, value) || evidenceIn(readable, evidence) || evidenceIn(corpus, value) {
			return value, true
		}
		return "", false
	}
	if evidenceIn(corpus, value) || (evidenceIn(corpus, evidence) && evidenceIn(evidence, value)) {
		return value, true
	}
	return "", false
}

func literalEvidence(corpus string, evidence, value string) bool {
	if evidenceIn(corpus, evidence) {
		return true
	}
	return evidenceIn(corpus, value)
}

func hasCaptionEventText(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	return mightBeEvent(text) || hasCalendarSignal(text) || hasWeekdaySignal(text)
}

func flyerHasEventText(llm extractResult) bool {
	return llm.IsEventFlyer &&
		strings.TrimSpace(llm.Title) != "" &&
		strings.TrimSpace(llm.Date) != "" &&
		strings.TrimSpace(llm.ReadableText) != ""
}

func firstImage(images [][]byte, fallback []byte) []byte {
	if len(images) > 0 && len(images[0]) > 0 {
		return images[0]
	}
	return fallback
}

func appendUnique(ids []string, id string) []string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ids
	}
	for _, existing := range ids {
		if strings.EqualFold(existing, id) {
			return ids
		}
	}
	return append(ids, id)
}

func evidenceIn(corpus, evidence string) bool {
	evidence = strings.TrimSpace(evidence)
	if len([]rune(evidence)) < 2 {
		return false
	}
	return strings.Contains(strings.ToLower(corpus), strings.ToLower(evidence))
}

func composeWhen(date, clock string, loc *time.Location) (time.Time, bool) {
	date = strings.TrimSpace(date)
	t, err := time.ParseInLocation("2006-01-02", date, loc)
	if err != nil {
		return time.Time{}, false
	}
	clock = strings.TrimSpace(clock)
	if clock == "" {
		return t, true
	}
	parsed, err := time.Parse("15:04", clock)
	if err != nil {
		return t, true
	}
	return time.Date(t.Year(), t.Month(), t.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc), true
}

func latestDraft(history []memMsg, slug string) *eventDraft {
	var found *eventDraft
	for i := range history {
		if history[i].DraftSlug == slug && history[i].Draft != nil {
			found = history[i].Draft
		}
	}
	return found
}

func cloneDraft(d *eventDraft) *eventDraft {
	cp := *d
	if d.EndsAt != nil {
		end := *d.EndsAt
		cp.EndsAt = &end
	}
	if d.Latitude != nil {
		lat := *d.Latitude
		cp.Latitude = &lat
	}
	if d.Longitude != nil {
		lng := *d.Longitude
		cp.Longitude = &lng
	}
	cp.Meta = map[string]any{}
	for k, v := range d.Meta {
		cp.Meta[k] = v
	}
	cp.MergedIDs = append([]string(nil), d.MergedIDs...)
	if len(d.Hero) > 0 {
		cp.Hero = append([]byte(nil), d.Hero...)
	}
	return &cp
}

func mergeText(base, extra string) string {
	extra = strings.TrimSpace(extra)
	base = strings.TrimSpace(base)
	if extra == "" || base == extra {
		return base
	}
	if base == "" {
		return extra
	}
	if strings.Contains(base, extra) {
		return base
	}
	return base + "\n\n" + extra
}

func weakTitle(title string) bool {
	low := strings.ToLower(strings.TrimSpace(title))
	return low == "" || strings.Contains(low, "poster") || strings.Contains(low, "flyer") || strings.Contains(low, "upcoming")
}

func textSaysCancelled(text string) bool {
	low := strings.ToLower(text)
	for _, cue := range []string{"cancelled", "canceled", "đã hủy", "hủy sự kiện", "huy su kien"} {
		if strings.Contains(low, cue) {
			return true
		}
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
