package main

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	dalatCity       = "Đà Lạt"
	lamDongProvince = "Lâm Đồng"
	// Same alt Scout writes for an owner-authorized hero. It must not say
	// the picture is AI-generated.
	ownerHeroAlt = "Event image from the organizer or venue source."
	// Only used when vision confirms the image is an event flyer.
	flyerHeroAlt = "Event flyer shared by the organizer in the WhatsApp group."
	// Personal / non-flyer photos that somehow become a hero.
	personalPhotoAlt = "Photo of people shared in a WhatsApp group, not an event flyer."
)

// prepareReview is the last step before a draft can be saved. It attaches a
// flyer from this message or the group window, resolves Maps short links,
// and refuses chatter that Review would reject: no public venue, a tentative
// date, or no hero image.
func prepareReview(draft *eventDraft, in inbound, history []memMsg) error {
	if draft == nil {
		return fmt.Errorf("not an event")
	}
	attachHero(draft, in, history)
	corpus := strings.Join([]string{in.Text, in.QuotedText, stripCommunity(draft.Description)}, "\n")
	applyMaps(draft, corpus)
	if !publicVenue(draft.Location) {
		if name, address := extractLocation(corpus); plausibleVenueName(name) {
			draft.Location = name
			if strings.TrimSpace(draft.Address) == "" {
				draft.Address = address
			}
		}
	}
	if dateIsTentative(corpus) {
		return fmt.Errorf("tentative date")
	}
	if !publicVenue(draft.Location) {
		return fmt.Errorf("no public venue")
	}
	stampLocality(draft)
	if draft.ImageURL == "" && len(draft.Hero) == 0 {
		return fmt.Errorf("no flyer for hero")
	}
	return nil
}

func reviewableDraft(d *eventDraft) bool {
	if d == nil || d.Cancelled || d.ImageURL == "" || d.StartsAt.IsZero() {
		return false
	}
	if !publicVenue(d.Location) {
		return false
	}
	return !dateIsTentative(d.Title) && !dateIsTentative(d.Description)
}

func stampLocality(d *eventDraft) {
	if d.Meta == nil {
		d.Meta = map[string]any{}
	}
	d.Meta["city"] = dalatCity
	d.Meta["province"] = lamDongProvince
	if publicVenue(d.Location) {
		d.Address = ensureLocalityAddress(d.Address)
	}
}

// ensureLocalityAddress puts the city and province on the address column.
// evaluateDraftQuality reads address for not_dalat_locality.
func ensureLocalityAddress(address string) string {
	address = strings.TrimSpace(address)
	hasCity := mentionsLocality(address, "đà lạt", "da lat", "dalat")
	hasProvince := mentionsLocality(address, "lâm đồng", "lam dong")
	switch {
	case address == "":
		return dalatCity + ", " + lamDongProvince
	case !hasCity && !hasProvince:
		return strings.TrimRight(address, ", ") + ", " + dalatCity + ", " + lamDongProvince
	case !hasProvince:
		return strings.TrimRight(address, ", ") + ", " + lamDongProvince
	case !hasCity:
		return strings.TrimRight(address, ", ") + ", " + dalatCity
	default:
		return address
	}
}

func mentionsLocality(text string, phrases ...string) bool {
	low := strings.ToLower(text)
	for _, phrase := range phrases {
		if strings.Contains(low, phrase) {
			return true
		}
	}
	return false
}

func (d *eventDraft) googleMapsURL() string {
	if d == nil {
		return ""
	}
	// A clean "name, street, Đà Lạt, Lâm Đồng" search beats a pasted Maps
	// link full of tracking parameters, and never carries emoji or prose.
	if publicVenue(d.Location) {
		q := url.QueryEscape(d.Location + ", " + ensureLocalityAddress(d.Address))
		return "https://www.google.com/maps/search/?api=1&query=" + q
	}
	if strings.TrimSpace(d.MapsURL) != "" {
		return d.MapsURL
	}
	if d.Latitude != nil && d.Longitude != nil {
		return fmt.Sprintf("https://www.google.com/maps?q=%f,%f", *d.Latitude, *d.Longitude)
	}
	return ""
}

var tentativeDateRe = regexp.MustCompile(`(?i)(?:\btentative\b|\btbc\b|date\s+(?:tba|tbd|tbc)|chưa\s+chốt|chua\s+chot|dự\s+kiến|du\s+kien|ngày\s+chưa|maybe\s+(?:this|next|on)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|thứ))`)

func dateIsTentative(text string) bool {
	return tentativeDateRe.MatchString(text)
}

func publicVenue(name string) bool {
	name = strings.TrimSpace(name)
	if name == "" || isCityOnly(name) || isDMVenue(name) || looksLikeURL(name) {
		return false
	}
	low := strings.ToLower(name)
	switch low {
	case "dropped pin", "dropped+pin", "ghim đã thả", "unknown", "tbd", "tba":
		return false
	}
	return true
}

func isDMVenue(name string) bool {
	low := strings.ToLower(strings.TrimSpace(name))
	if low == "" {
		return false
	}
	phrases := []string{
		"dm for location", "dm for the location", "dm for address", "dm me",
		"pm for location", "pm for address", "inbox for location",
		"message for location", "message me for", "nhắn để biết", "nhan de biet",
		"nhắn mình", "ib để biết", "inbox me",
	}
	for _, phrase := range phrases {
		if strings.Contains(low, phrase) {
			return true
		}
	}
	asks := regexp.MustCompile(`(?i)\b(dm|pm|inbox|nhắn|nhan)\b`).MatchString(low)
	place := regexp.MustCompile(`(?i)(location|address|địa điểm|dia diem|địa chỉ|where)`).MatchString(low)
	return asks && place
}

func looksLikeURL(name string) bool {
	low := strings.ToLower(name)
	return strings.Contains(low, "://") || strings.Contains(low, "maps.app.goo.gl") || strings.Contains(low, "goo.gl/maps")
}

func attachHero(draft *eventDraft, in inbound, history []memMsg) {
	if draft.ImageURL != "" || len(draft.Hero) > 0 {
		if draft.HeroMIME == "" && len(draft.Hero) > 0 {
			draft.HeroMIME = "image/jpeg"
		}
		return
	}
	if bytes, mime := inboundImage(in); len(bytes) > 0 {
		draft.Hero = bytes
		draft.HeroMIME = mime
		return
	}
	anchor := strings.TrimPrefix(strings.ToLower(draft.Slug), "wa-")
	if bytes, mime, ok := imageFromHistory(history, anchor, draft.Slug, in.Timestamp); ok {
		draft.Hero = bytes
		draft.HeroMIME = mime
	}
}

func inboundImage(in inbound) ([]byte, string) {
	if len(in.Image) > 0 {
		mime := in.ImageMIME
		if mime == "" {
			mime = "image/jpeg"
		}
		return in.Image, mime
	}
	return nil, ""
}

func imageFromHistory(history []memMsg, anchor, slug string, at time.Time) ([]byte, string, bool) {
	var fallback memMsg
	fallbackOK := false
	for i := len(history) - 1; i >= 0; i-- {
		msg := history[i]
		if len(msg.Image) == 0 {
			continue
		}
		sameDraft := strings.EqualFold(msg.ID, anchor) || (slug != "" && msg.DraftSlug == slug)
		if sameDraft {
			return msg.Image, imageMIME(msg), true
		}
		if msg.DraftSlug != "" && msg.DraftSlug != slug {
			continue
		}
		if at.IsZero() || msg.At.IsZero() || at.Sub(msg.At) > imageFollowWindow || at.Before(msg.At) {
			continue
		}
		if !fallbackOK {
			fallback = msg
			fallbackOK = true
		}
	}
	if fallbackOK {
		return fallback.Image, imageMIME(fallback), true
	}
	return nil, "", false
}

func imageMIME(msg memMsg) string {
	if msg.ImageMIME != "" {
		return msg.ImageMIME
	}
	return "image/jpeg"
}

func applyMaps(draft *eventDraft, corpus string) {
	link := firstMapsLink(corpus)
	if link == "" {
		return
	}
	if hit, ok := parseMapsTarget(link); ok && (publicVenue(hit.Name) || hit.Lat != nil) {
		useMapsHit(draft, hit)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	hit, err := mapsResolver(ctx, link)
	if err != nil {
		return
	}
	useMapsHit(draft, hit)
}

func useMapsHit(draft *eventDraft, hit mapsHit) {
	if draft.MapsURL == "" && hit.FinalURL != "" {
		draft.MapsURL = hit.FinalURL
	}
	if !publicVenue(draft.Location) && plausibleVenueName(hit.Name) {
		draft.Location = hit.Name
	}
	if strings.TrimSpace(draft.Address) == "" && !isCityOnly(hit.Address) && !looksLikeURL(hit.Address) {
		draft.Address = normalizeStreetAddress(hit.Address)
	}
	if draft.Latitude == nil && hit.Lat != nil && hit.Lng != nil {
		lat, lng := *hit.Lat, *hit.Lng
		draft.Latitude = &lat
		draft.Longitude = &lng
	}
}
