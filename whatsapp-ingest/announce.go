package main

import (
	"fmt"
	"strings"
)

// skipIncompleteAnnouncement is the pre-filter for plain chat and personal
// replies. A draft is only created when the text (or a flyer) has an explicit
// future calendar date or a clock time, and at least two of: a title-like
// line, a venue, and a start time. Relative words (today/tonight/tomorrow)
// and inferred default hours are not enough on their own.
func skipIncompleteAnnouncement(text string, flyer bool, title, venue string, hasClock bool, titleNeedsReview bool) string {
	if !hasCalendarSignal(text) && !hasClock && !flyer {
		return "no literal date or time in the text, and no flyer"
	}
	titleLike := isTitleLikeLine(title, titleNeedsReview)
	hasVenue := (strings.TrimSpace(venue) != "" && !isSectionHeader(venue) && !containsURL(venue)) || hasMapsURL(text)
	signals := 0
	if titleLike {
		signals++
	}
	if hasVenue {
		signals++
	}
	if hasClock {
		signals++
	}
	if signals < 2 {
		return fmt.Sprintf("need two of title, venue, start time (title-like=%v venue=%v clock=%v)", titleLike, hasVenue, hasClock)
	}
	return ""
}

func isTitleLikeLine(title string, needsReview bool) bool {
	title = strings.TrimSpace(title)
	if title == "" || needsReview || isRejectedTitle(title) || isChatSentenceTitle(title) || isScheduleLine(title) {
		return false
	}
	if strings.HasPrefix(strings.ToLower(title), "event at ") {
		return false
	}
	return true
}

func announcementCorpus(in inbound, draft *eventDraft) string {
	parts := []string{in.Text, in.QuotedText}
	if draft != nil && draft.IsEventFlyer {
		parts = append(parts, draft.ReadableText)
	}
	return strings.Join(parts, "\n")
}

func announcementHasClock(corpus string) bool {
	c, ok := findClock(corpus)
	return ok && !c.ambiguous
}

func hasMapsURL(text string) bool {
	low := strings.ToLower(text)
	return strings.Contains(low, "maps.app.goo.gl") || strings.Contains(low, "goo.gl/maps") || strings.Contains(low, "maps.google.") || strings.Contains(low, "google.com/maps")
}
