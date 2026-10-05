package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestVisionRequestIncludesFixtureImage(t *testing.T) {
	png := testFlyerPNG(t)
	var body []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("path=%s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("auth=%s", r.Header.Get("Authorization"))
		}
		body, _ = io.ReadAll(r.Body)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{
				"message": map[string]string{"content": `{
					"is_event": true,
					"title": "Sunday canyon ride",
					"date": "2026-10-04",
					"time": "08:00",
					"location": "Langbiang",
					"from_image": true
				}`},
			}},
		})
	}))
	defer server.Close()

	client := &llmClient{
		http:        server.Client(),
		openAIKey:   "test-key",
		openAIBase:  server.URL,
		openAIModel: "gpt-4.1-mini",
		force:       "openai",
	}
	result, err := client.Extract(context.Background(), extractRequest{
		Text:      "Poster with upcoming rides",
		Context:   "[id=FLY1] Poster with upcoming rides",
		GroupName: "Motorcycle Ride Squad",
		Image:     png,
		MIME:      "image/png",
		Now:       ref,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsEvent || result.Title != "Sunday canyon ride" || result.Location != "Langbiang" {
		t.Fatalf("%+v", result)
	}
	if !strings.Contains(string(body), "image_url") || !strings.Contains(string(body), "data:image/png;base64,") {
		t.Fatalf("request did not carry the fixture image: %.200s", body)
	}
	if !strings.Contains(string(body), "Poster with upcoming rides") {
		t.Fatal("caption missing from prompt")
	}
}

func TestExtractorDisabledWithoutKeys(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OPENAI_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("WHATSAPP_EVENT_LLM", "")
	os.Unsetenv("OPENAI_API_KEY")
	os.Unsetenv("OPENAI_KEY")
	os.Unsetenv("ANTHROPIC_API_KEY")
	os.Unsetenv("OPENROUTER_API_KEY")
	os.Unsetenv("WHATSAPP_EVENT_LLM")
	if newExtractorFromEnv() != nil {
		t.Fatal("expected no extractor")
	}
	t.Setenv("WHATSAPP_EVENT_LLM", "off")
	t.Setenv("OPENAI_API_KEY", "secret")
	if newExtractorFromEnv() != nil {
		t.Fatal("off switch ignored")
	}
}

func TestSingleFlyerDocumentsPromoGap(t *testing.T) {
	draft := &eventDraft{
		Slug: "wa-fly", Title: "Sunday canyon ride", Description: "Poster",
		StartsAt: ref, ImageURL: "https://cdn.example/flyer.png", IsEventFlyer: true,
		ImageAlt: "Event flyer shared by the organizer in the Motorcycle Ride Squad WhatsApp group",
		Meta:     map[string]any{"message_id": "FLY", "group_jid": "120363@g.us"},
	}
	row := draft.toRow("profile")
	meta := row["source_metadata"].(map[string]any)
	gap := meta["visual_gap"].(map[string]any)
	covers := gap["covers"].([]string)
	if len(covers) != 1 || covers[0] != "promo" {
		t.Fatalf("gap=%v", gap)
	}
	if row["image_url"] == "" {
		t.Fatal("missing hero")
	}
	if meta["visual_provenance"] != "owner_authorized_source" {
		t.Fatalf("provenance=%v", meta["visual_provenance"])
	}
	if strings.Contains(strings.ToLower(row["image_alt"].(string)), "ai-generated") {
		t.Fatalf("alt=%v", row["image_alt"])
	}
}

func TestSaveDraftDoesNotClobberPublished(t *testing.T) {
	var patched bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode([]storedEvent{{ID: "evt-1", Slug: "wa-fly", Status: "published"}})
		default:
			patched = true
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer server.Close()
	client := newSupabaseClient(server.URL, "service")
	_, err := client.saveDraft(context.Background(), map[string]any{"slug": "wa-fly", "status": "draft"})
	if err != errNotMutable {
		t.Fatalf("err=%v", err)
	}
	if patched {
		t.Fatal("published row was patched")
	}
}

func TestSaveDraftPatchesExistingDraft(t *testing.T) {
	var method, path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode([]storedEvent{{ID: "evt-1", Slug: "wa-fly", Status: "draft"}})
			return
		}
		method, path = r.Method, r.URL.String()
		_ = json.NewEncoder(w).Encode([]insertedEvent{{ID: "evt-1", Slug: "wa-fly"}})
	}))
	defer server.Close()
	client := newSupabaseClient(server.URL, "service")
	saved, err := client.saveDraft(context.Background(), map[string]any{
		"slug": "wa-fly", "title": "Sunday canyon ride", "status": "draft",
	})
	if err != nil {
		t.Fatal(err)
	}
	if method != http.MethodPatch || !strings.Contains(path, "id=eq.evt-1") {
		t.Fatalf("%s %s", method, path)
	}
	if saved.ID != "evt-1" {
		t.Fatalf("%+v", saved)
	}
}

func TestSaveDraftReopensRejectedDraft(t *testing.T) {
	var patched bool
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			if strings.Contains(r.URL.RawQuery, "slug=eq.") && strings.Contains(r.URL.RawQuery, "wa-missing") {
				_ = json.NewEncoder(w).Encode([]storedEvent{})
				return
			}
			if strings.Contains(r.URL.RawQuery, "source_url") {
				_ = json.NewEncoder(w).Encode([]storedEvent{{
					ID: "evt-9", Slug: "wa-old", Status: "draft",
					SourceMetadata: map[string]any{"review_result": "rejected", "needs_review": false},
				}})
				return
			}
			_ = json.NewEncoder(w).Encode([]storedEvent{{
				ID: "evt-9", Slug: "wa-old", Status: "draft",
				SourceMetadata: map[string]any{"review_result": "rejected"},
			}})
			return
		}
		patched = true
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_ = json.NewEncoder(w).Encode([]insertedEvent{{ID: "evt-9", Slug: "wa-old"}})
	}))
	defer server.Close()
	client := newSupabaseClient(server.URL, "service")
	saved, err := client.saveDraft(context.Background(), map[string]any{
		"slug": "wa-missing", "title": "TECHNO CALLING", "status": "draft",
		"external_chat_url": "whatsapp:120363@g.us/OLD",
		"source_metadata":   map[string]any{"source_url": "whatsapp:120363@g.us/OLD", "needs_review": true, "review_result": nil},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !patched || !saved.Reopened || saved.ID != "evt-9" {
		t.Fatalf("patched=%v saved=%+v", patched, saved)
	}
	if _, ok := body["slug"]; ok {
		t.Fatal("patch rewrote slug")
	}
	meta, _ := body["source_metadata"].(map[string]any)
	if meta["needs_review"] != true {
		t.Fatalf("needs_review=%v", meta["needs_review"])
	}
}

func testFlyerPNG(t *testing.T) []byte {
	t.Helper()
	// 1×1 PNG fixture. The bytes are what a vision call must receive; the
	// model is stubbed, so the picture does not need to depict a real flyer.
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
		0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
		0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
		0x44, 0xae, 0x42, 0x60, 0x82,
	}
}
