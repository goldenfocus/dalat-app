package main

import "regexp"

var secretRe = regexp.MustCompile(`(sk-[A-Za-z0-9_-]{8,}|Bearer [A-Za-z0-9._-]+)`)

// redactSecrets strips API keys from provider error text before logging, and
// caps the length so a provider HTML error page does not flood the log.
func redactSecrets(s string) string {
	s = secretRe.ReplaceAllString(s, "[redacted]")
	if len(s) > 400 {
		s = s[:400] + "…"
	}
	return s
}
