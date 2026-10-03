package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// eventMedia uploads flyer bytes the same way Scout does: logical bucket
// event-media, object key {slug}/{unixMilli}.{ext}, public URL
// {CLOUDFLARE_R2_PUBLIC_URL}/event-media/{slug}/{unixMilli}.{ext}.
type eventMedia struct {
	accessKey string
	secret    string
	endpoint  string
	publicURL string
	bucket    string
	http      *http.Client
}

func newEventMediaFromEnv() *eventMedia {
	endpoint := strings.TrimRight(strings.TrimSpace(os.Getenv("CLOUDFLARE_R2_ENDPOINT")), "/")
	publicURL := strings.TrimRight(strings.TrimSpace(os.Getenv("CLOUDFLARE_R2_PUBLIC_URL")), "/")
	accessKey := strings.TrimSpace(os.Getenv("CLOUDFLARE_R2_ACCESS_KEY_ID"))
	secret := strings.TrimSpace(os.Getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"))
	bucket := strings.TrimSpace(os.Getenv("CLOUDFLARE_R2_BUCKET_NAME"))
	if bucket == "" {
		bucket = "dalat-app-media"
	}
	if endpoint == "" || publicURL == "" || accessKey == "" || secret == "" {
		return &eventMedia{}
	}
	return &eventMedia{
		accessKey: accessKey,
		secret:    secret,
		endpoint:  endpoint,
		publicURL: publicURL,
		bucket:    bucket,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

func (m *eventMedia) configured() bool {
	return m != nil && m.endpoint != "" && m.accessKey != "" && m.secret != "" && m.publicURL != ""
}

// uploadEventImage stores one organizer flyer and returns its public CDN URL.
// Files under 5KB are rejected, matching downloadAndUploadImage in the Scout lane.
func (m *eventMedia) uploadEventImage(ctx context.Context, slug string, data []byte, mime string, now time.Time) (string, error) {
	if !m.configured() {
		return "", fmt.Errorf("Cloudflare R2 is not configured")
	}
	if len(data) < 5000 {
		return "", fmt.Errorf("flyer is smaller than a real photo")
	}
	if len(data) > 10*1024*1024 {
		return "", fmt.Errorf("flyer is larger than 10MB")
	}
	ext := extForMIME(mime)
	objectPath := fmt.Sprintf("%s/%d.%s", sanitizeSlug(slug), now.UTC().UnixMilli(), ext)
	key := "event-media/" + objectPath
	publicURL := m.publicURL + "/" + key

	endpoint, err := url.Parse(m.endpoint)
	if err != nil {
		return "", err
	}
	putPath := "/" + m.bucket + "/" + key
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint.Scheme+"://"+endpoint.Host+putPath, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	if mime == "" {
		mime = "image/jpeg"
	}
	amzDate := now.UTC().Format("20060102T150405Z")
	sum := sha256.Sum256(data)
	payloadHash := hex.EncodeToString(sum[:])
	req.Header.Set("Content-Type", mime)
	req.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
	req.Header.Set("Host", endpoint.Host)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("Authorization", m.authorization(http.MethodPut, putPath, endpoint.Host, mime, amzDate, payloadHash, now.UTC()))

	client := m.http
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("upload flyer: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	io.Copy(io.Discard, resp.Body)
	return publicURL, nil
}

func (m *eventMedia) authorization(method, path, host, contentType, amzDate, payloadHash string, now time.Time) string {
	date := now.UTC().Format("20060102")
	region := "auto"
	canonicalHeaders := "" +
		"cache-control:public, max-age=31536000, immutable\n" +
		"content-type:" + contentType + "\n" +
		"host:" + host + "\n" +
		"x-amz-content-sha256:" + payloadHash + "\n" +
		"x-amz-date:" + amzDate + "\n"
	signed := "cache-control;content-type;host;x-amz-content-sha256;x-amz-date"
	canonical := method + "\n" + path + "\n\n" + canonicalHeaders + signed + "\n" + payloadHash
	scope := date + "/" + region + "/s3/aws4_request"
	hash := sha256.Sum256([]byte(canonical))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hex.EncodeToString(hash[:]),
	}, "\n")
	signingKey := hmacSHA256(hmacSHA256(hmacSHA256(hmacSHA256([]byte("AWS4"+m.secret), date), region), "s3"), "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))
	return "AWS4-HMAC-SHA256 Credential=" + m.accessKey + "/" + scope + ", SignedHeaders=" + signed + ", Signature=" + signature
}

func hmacSHA256(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}

func extForMIME(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	default:
		return "jpg"
	}
}

func sanitizeSlug(slug string) string {
	slug = strings.ToLower(strings.TrimSpace(slug))
	var b strings.Builder
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "event"
	}
	return b.String()
}
