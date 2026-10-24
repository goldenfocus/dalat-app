package main

import (
	"regexp"
	"strings"
)

// Schedule / agenda lines ("💃 6:30–7:30 PM — Dance class", "18h-19h: Yoga",
// "7:30 PM onwards — Social dancing") describe one slot of an event, never
// its name. Mirrored in lib/import/review-gate.ts isScheduleLine.
const (
	schedTime  = `(?:\d{1,2}(?:[:.h]\d{2})\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?|\d{1,2}h(?:\d{2})?|\d{1,2}\s*giờ(?:\s*\d{2})?)`
	schedRange = `(?:` + schedTime + `|\d{1,2})\s*(?:[-–—~]|to|until|đến)\s*` + schedTime
	schedSep   = `\s*(?:[-–—:•·|>→»]|onwards?\s*[-–—:•]?|trở đi\s*[-–—:•]?)\s*`
)

var (
	scheduleSepRe  = regexp.MustCompile(`(?i)(?:^|[\s(])(?:from\s+|từ\s+)?(?:` + schedRange + `|` + schedTime + `)(?:\s*(?:onwards?|trở đi))?` + schedSep + `\p{L}`)
	scheduleLeadRe = regexp.MustCompile(`(?i)^(?:from\s+|từ\s+)?(?:` + schedRange + `|` + schedTime + `)\s+\p{L}`)
)

func isScheduleLine(line string) bool {
	core := strings.TrimSpace(trimLeadingSymbols(stripEmoji(cleanLine(line))))
	if core == "" {
		return false
	}
	return scheduleSepRe.MatchString(core) || scheduleLeadRe.MatchString(core)
}
