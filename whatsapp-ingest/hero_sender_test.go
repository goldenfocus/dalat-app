package main

import (
	"testing"
	"time"
)

// Regression: Haven Jazz (sender B, text-only) borrowed INN's Dance Night
// flyer (sender A, captioned, skipped) posted 42 minutes earlier.
func TestHeroNeverCrossesSenders(t *testing.T) {
	at := time.Date(2026, 10, 14, 16, 25, 0, 0, testLoc)
	history := []memMsg{
		{ID: "INN1", Sender: "jess", Text: "We are holding an adult's one this Saturday same place 6:30-7:30pm", HasImage: true, Image: []byte("dance-night"), At: at.Add(-42 * time.Minute)},
	}
	if _, _, ok := imageFromHistory(history, "haven1", "wa-haven1", "haven", at); ok {
		t.Fatal("borrowed another sender's image")
	}
	// Same sender, too long ago: no.
	if _, _, ok := imageFromHistory(history, "x", "wa-x", "jess", at); ok {
		t.Fatal("borrowed own image beyond heroFollowWindow")
	}
	// Same sender within the window: yes.
	history[0].At = at.Add(-3 * time.Minute)
	if b, _, ok := imageFromHistory(history, "x", "wa-x", "jess", at); !ok || string(b) != "dance-night" {
		t.Fatal("own recent image not used")
	}
	// Different sender within the window: still no.
	if _, _, ok := imageFromHistory(history, "x", "wa-x", "haven", at); ok {
		t.Fatal("borrowed another sender's recent image")
	}
}

func TestDetailFollowUpDoesNotJoinOtherSendersImageDraft(t *testing.T) {
	history := []memMsg{{ID: "FLY1", Sender: "alice", HasImage: true, DraftSlug: "wa-fly1", At: ref}}
	if _, _, ok := recentImageDraft(history, "bob", ref.Add(5*time.Minute)); ok {
		t.Fatal("bob's message joined alice's flyer draft")
	}
	if slug, _, ok := recentImageDraft(history, "alice", ref.Add(5*time.Minute)); !ok || slug != "wa-fly1" {
		t.Fatal("alice's own follow-up should join")
	}
}
