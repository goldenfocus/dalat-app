package main

import (
	"crypto/sha256"
	"encoding/hex"
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

// TestAuthorizationMatchesBotocoreSigV4 pins the hand-written R2 signer to
// botocore 1.43.108 S3SigV4Auth (service s3, region auto) for this fixture:
//
//	access key "access", secret "secret"
//	time 2026-10-03T05:00:00Z (unix milli 1791003600000)
//	host example.r2.cloudflarestorage.com
//	PUT /dalat-app-media/event-media/wa-msg1/1791003600000.png
//	body 6000 bytes of 0xAB, Content-Type image/png
//	Cache-Control: public, max-age=31536000, immutable
//
// The signed header block must be separated from canonical headers by a blank
// line. Dropping that newline changes the signature and R2 rejects the upload.
func TestAuthorizationMatchesBotocoreSigV4(t *testing.T) {
	when := time.Date(2026, 10, 3, 5, 0, 0, 0, time.UTC)
	if when.UnixMilli() != 1791003600000 {
		t.Fatalf("fixture milli=%d", when.UnixMilli())
	}
	data := bytesOf(6000)
	sum := sha256.Sum256(data)
	payloadHash := hex.EncodeToString(sum[:])
	media := &eventMedia{accessKey: "access", secret: "secret"}
	got := media.authorization(
		http.MethodPut,
		"/dalat-app-media/event-media/wa-msg1/1791003600000.png",
		"example.r2.cloudflarestorage.com",
		"image/png",
		when.Format("20060102T150405Z"),
		payloadHash,
		when,
	)
	const want = "AWS4-HMAC-SHA256 Credential=access/20261003/auto/s3/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=39d6b39ea8693a13b78b5068a376969372a41b2040ec5790da3f12f0937dc5f5"
	if got != want {
		t.Fatalf("authorization=%s", got)
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
