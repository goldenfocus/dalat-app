package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestUploadEventImageUsesScoutPath(t *testing.T) {
	var gotPath, gotType, gotAuth string
	var gotLen int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotType = r.Header.Get("Content-Type")
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		gotLen = len(body)
		if r.Method != http.MethodPut {
			t.Errorf("method=%s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	media := &eventMedia{
		accessKey: "access",
		secret:    "secret",
		endpoint:  server.URL,
		publicURL: "https://cdn.dalat.app",
		bucket:    "dalat-app-media",
		http:      server.Client(),
	}
	when := time.Date(2026, 10, 3, 5, 0, 0, 0, time.UTC)
	data := bytesOf(6000)
	publicURL, err := media.uploadEventImage(t.Context(), "wa-msg1", data, "image/png", when)
	if err != nil {
		t.Fatal(err)
	}
	wantKey := fmt.Sprintf("/dalat-app-media/event-media/wa-msg1/%d.png", when.UnixMilli())
	if gotPath != wantKey {
		t.Fatalf("path=%s", gotPath)
	}
	if gotType != "image/png" || gotLen != len(data) {
		t.Fatalf("type=%s len=%d", gotType, gotLen)
	}
	if !strings.HasPrefix(gotAuth, "AWS4-HMAC-SHA256 ") || !strings.Contains(gotAuth, "Credential=access/") {
		t.Fatalf("auth=%s", gotAuth)
	}
	if publicURL != fmt.Sprintf("https://cdn.dalat.app/event-media/wa-msg1/%d.png", when.UnixMilli()) {
		t.Fatalf("url=%s", publicURL)
	}
}

func TestUploadEventImageRejectsTinyFlyer(t *testing.T) {
	media := &eventMedia{accessKey: "a", secret: "b", endpoint: "https://example.r2.cloudflarestorage.com", publicURL: "https://cdn.dalat.app", bucket: "dalat-app-media"}
	if _, err := media.uploadEventImage(t.Context(), "wa-x", testFlyerPNG(t), "image/png", time.Now()); err == nil {
		t.Fatal("accepted a tiny image")
	}
}

func bytesOf(n int) []byte {
	buf := make([]byte, n)
	for i := range buf {
		buf[i] = 0xab
	}
	return buf
}
