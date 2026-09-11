package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNotifyReviewHook(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	client := newSupabaseClient("https://example.supabase.co", "service-role")
	err := client.notifyReviewHook(context.Background(), server.URL, "review-secret", map[string]any{
		"type": "draft_ready",
		"slug": "wa-abcd",
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer review-secret" {
		t.Fatalf("auth=%q", gotAuth)
	}
	if gotBody["type"] != "draft_ready" {
		t.Fatalf("body=%v", gotBody)
	}
}

func TestNotifyReviewHookSkippedWhenEmpty(t *testing.T) {
	client := newSupabaseClient("https://example.supabase.co", "service-role")
	if err := client.notifyReviewHook(context.Background(), "", "key", map[string]any{"x": 1}); err != nil {
		t.Fatal(err)
	}
}
