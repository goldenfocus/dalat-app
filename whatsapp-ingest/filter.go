package main

import (
	"regexp"
	"strings"
)

// mightBeEvent is the cheap gate in front of the LLM. Images are handled by
// the caller (every allowlisted image is vision-checked). Plain chatter never
// reaches the model.
func mightBeEvent(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || isChitChat(trimmed) || isPersonalMealPlan(trimmed) {
		return false
	}
	if hasCalendarSignal(trimmed) && (hasStrongCue(trimmed) || hasClockSignal(trimmed) || hasLocationLabel(trimmed) || runeLen(trimmed) >= 80) {
		return true
	}
	if hasWeekdaySignal(trimmed) && (hasStrongCue(trimmed) || hasRecurringCue(trimmed) || hasLocationLabel(trimmed)) {
		return true
	}
	if hasRelativeSignal(trimmed) && (hasStrongCue(trimmed) || hasClockSignal(trimmed) || hasLocationLabel(trimmed)) {
		return true
	}
	return false
}

func isChitChat(text string) bool {
	norm := strings.ToLower(strings.Trim(text, " \t\r\n.!?…~"))
	switch norm {
	case "yes", "yeah", "yep", "yup", "ok", "okay", "k", "kk",
		"thank you", "thanks", "thankyou", "ty", "tks",
		"cảm ơn", "cam on", "cám ơn",
		"where do you sit", "where do you sit?",
		"haha", "hahaha", "lol", "hi", "hello", "hey",
		"👍", "🙏", "❤️", "ok bạn", "được", "duoc", "vâng", "vang", "dạ", "da":
		return true
	default:
		return false
	}
}

// isPersonalMealPlan rejects short lunch plans such as "Lunch / Cơm tấm Nguyễn"
// that mention a date but are not an invitation. A real announcement that also
// says "join us", "weekly", or carries a Location: label is kept.
func isPersonalMealPlan(text string) bool {
	if hasStrongCue(text) || hasExplicitLocationLabel(text) || hasRecurringCue(text) {
		return false
	}
	if runeLen(text) > 180 {
		return false
	}
	low := strings.ToLower(text)
	for _, meal := range []string{"lunch", "breakfast", "dinner", "brunch", "cơm tấm", "com tam", "cơm", "ăn trưa", "ăn tối", "an trua"} {
		if strings.Contains(low, meal) {
			return true
		}
	}
	return false
}

func hasStrongCue(text string) bool {
	low := strings.ToLower(text)
	cues := []string{
		"join us", "come join", "tham gia", "đăng ký", "dang ky", "rsvp",
		"ticket", "workshop", "meetup", "meet-up", "meet up", "weekly", "hàng tuần",
		"calling", "lineup", "line-up", "concert", "festival", "improv",
		"stand-up", "standup", "comedy", "techno", "acoustic", "yoga",
		"poster", "flyer", "ride", "rides", "hike", "exhibition", "opening",
		"tournament", "sự kiện", "su kien", "họp mặt", "hop mat", "buổi",
		"live music", "dj set", "cộng đồng", "community",
	}
	for _, cue := range cues {
		if strings.Contains(low, cue) {
			return true
		}
	}
	return false
}

func hasCalendarSignal(text string) bool {
	return dateRe.MatchString(text) || monthDateRe.MatchString(text) || vietDayMonthRe.MatchString(text)
}

func hasWeekdaySignal(text string) bool {
	return weekdayPhraseRe.MatchString(text)
}

func hasRelativeSignal(text string) bool {
	low := strings.ToLower(text)
	for _, phrase := range []string{"tomorrow", "tonight", "today", "this evening", "ngày mai", "ngay mai", "tối nay", "toi nay", "hôm nay", "hom nay", "tối mai"} {
		if strings.Contains(low, phrase) {
			return true
		}
	}
	return false
}

func hasClockSignal(text string) bool {
	_, _, ok := parseClock(text)
	return ok
}

func hasExplicitLocationLabel(text string) bool {
	return regexp.MustCompile(`(?i)\b(location|venue|địa điểm|dia diem|địa chỉ|dia chi)\s*:`).MatchString(text)
}

func hasLocationLabel(text string) bool {
	return hasExplicitLocationLabel(text) ||
		regexp.MustCompile(`(?i)(?:^|\s)(?:tại|at)\s+\S`).MatchString(text)
}

func runeLen(text string) int {
	return len([]rune(text))
}

// isDetailFollowUp reports messages that add a time or place to an announcement
// already in the window, rather than introducing a new event.
func isDetailFollowUp(text string) bool {
	if isFreshAnnouncement(text) || isChitChat(text) || isPersonalMealPlan(text) {
		return false
	}
	if hasClockSignal(text) || hasRelativeSignal(text) || hasCalendarSignal(text) {
		return true
	}
	low := strings.ToLower(text)
	if strings.Contains(low, "location") || strings.Contains(low, "địa điểm") || strings.Contains(low, "at ") || strings.Contains(low, "tại ") {
		return runeLen(text) <= 160
	}
	return false
}

func isFreshAnnouncement(text string) bool {
	if runeLen(text) < 40 && !hasStrongCue(text) {
		return false
	}
	if !(hasCalendarSignal(text) || hasWeekdaySignal(text) || hasRelativeSignal(text)) {
		return false
	}
	return hasStrongCue(text) || hasLocationLabel(text)
}

func asksForLocation(text string) bool {
	low := strings.ToLower(text)
	return strings.Contains(low, "location") || strings.Contains(low, "địa điểm") ||
		strings.Contains(low, "dia diem") || strings.Contains(low, "where is") ||
		strings.Contains(low, "where's") || strings.Contains(low, "repost")
}
