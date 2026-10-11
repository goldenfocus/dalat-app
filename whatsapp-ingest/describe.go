package main

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	phoneRe   = regexp.MustCompile(`(?:\+|\b)\d[\d\s.\-()]{7,}\d\b`)
	handleRe  = regexp.MustCompile(`(^|\s)@[\p{L}\p{N}_.]+`)
	contactRe = regexp.MustCompile(`(?i)^\W*(contact|liên hệ|lien he|lh|hotline|zalo|call|phone|sđt|sdt|đt|inbox|dm|whatsapp|ib|posted by|shared by|người đăng|đăng ký qua|reg(?:ister)? with)\b[\s:.\-–]`)
	urlRe     = regexp.MustCompile(`https?://\S+`)
)

// cleanFacts keeps the event facts from a caption or flyer OCR text and drops
// phone numbers, @handles and contact/poster lines, which name people.
func cleanFacts(raw string) string {
	var out []string
	blank := false
	for _, line := range strings.Split(strings.ReplaceAll(raw, "\r", ""), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			blank = len(out) > 0
			continue
		}
		if contactRe.MatchString(line) {
			continue
		}
		line = urlRe.ReplaceAllStringFunc(line, func(u string) string {
			if strings.Contains(u, "wa.me") || strings.Contains(u, "zalo.me") {
				return ""
			}
			return u
		})
		line = phoneRe.ReplaceAllStringFunc(line, func(m string) string {
			digits := 0
			for _, r := range m {
				if unicode.IsDigit(r) {
					digits++
				}
			}
			// 9+ digits is a phone number; shorter runs are dates, prices, times.
			if digits >= 9 && !strings.ContainsAny(m, "/:") {
				return ""
			}
			return m
		})
		line = handleRe.ReplaceAllString(line, "$1")
		line = strings.Join(strings.Fields(line), " ")
		line = strings.Trim(line, " -–—:|,")
		if line == "" || !strings.ContainsFunc(line, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }) {
			continue
		}
		if blank {
			out = append(out, "")
			blank = false
		}
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// composeDescription is the caption plus the flyer's readable text, both
// cleaned. Flyer lines the caption already says are not repeated.
func composeDescription(caption, flyer string) string {
	c := cleanFacts(caption)
	f := cleanFacts(flyer)
	if f == "" {
		return c
	}
	if c == "" {
		return f
	}
	low := strings.ToLower(c)
	var extra []string
	for _, line := range strings.Split(f, "\n") {
		if line == "" || strings.Contains(low, strings.ToLower(line)) {
			continue
		}
		extra = append(extra, line)
	}
	if len(extra) == 0 {
		return c
	}
	return c + "\n\n" + strings.Join(extra, "\n")
}

// normalizeTitleKey folds a title for repost matching: case, accents,
// emoji and punctuation do not count.
func normalizeTitleKey(title string) string {
	var b strings.Builder
	space := false
	for _, r := range strings.ToLower(foldVietnamese(title)) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			space = false
		case !space && b.Len() > 0:
			b.WriteByte(' ')
			space = true
		}
	}
	return strings.TrimSpace(b.String())
}

func foldVietnamese(s string) string {
	repl := strings.NewReplacer("đ", "d", "Đ", "D")
	s = repl.Replace(s)
	var b strings.Builder
	for _, r := range s {
		if base, ok := vnBase[r]; ok {
			b.WriteRune(base)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

var vnBase = func() map[rune]rune {
	m := map[rune]rune{}
	groups := map[rune]string{
		'a': "àáạảãâầấậẩẫăằắặẳẵ", 'e': "èéẹẻẽêềếệểễ", 'i': "ìíịỉĩ",
		'o': "òóọỏõôồốộổỗơờớợởỡ", 'u': "ùúụủũưừứựửữ", 'y': "ỳýỵỷỹ",
	}
	for base, chars := range groups {
		for _, r := range chars {
			m[r] = base
			m[unicode.ToUpper(r)] = unicode.ToUpper(base)
		}
	}
	return m
}()
