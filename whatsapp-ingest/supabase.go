package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"time"
)

// supabaseClient talks to Supabase over PostgREST and the Storage API using the
// service role key, mirroring how the repo's import-worker writes drafts.
type supabaseClient struct {
	base string
	key  string
	http *http.Client
}

func newSupabaseClient(base, key string) *supabaseClient {
	return &supabaseClient{base: base, key: key, http: &http.Client{Timeout: 30 * time.Second}}
}

// insertEvent upserts an events row on slug so reconnects and retries stay
// idempotent.
func (s *supabaseClient) insertEvent(ctx context.Context, row map[string]any) error {
	body, err := json.Marshal(row)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/rest/v1/events", bytes.NewReader(body))
	if err != nil {
		return err
	}
	s.authHeaders(req)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")

	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("insert event: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	return nil
}

// uploadFlyer stores a flyer image in the public event-media bucket under
// whatsapp/{messageID} and returns its public URL.
func (s *supabaseClient) uploadFlyer(ctx context.Context, msgID string, data []byte, mime string) (string, error) {
	ext := ".jpg"
	switch mime {
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	}
	objectPath := path.Join("whatsapp", msgID+ext)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.base+"/storage/v1/object/event-media/"+objectPath, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	s.authHeaders(req)
	req.Header.Set("Content-Type", mime)
	req.Header.Set("x-upsert", "true")

	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("upload flyer: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	return s.base + "/storage/v1/object/public/event-media/" + objectPath, nil
}

// resolveProfileID looks up a profile UUID by username.
func (s *supabaseClient) resolveProfileID(ctx context.Context, username string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		s.base+"/rest/v1/profiles?username=eq."+username+"&select=id", nil)
	if err != nil {
		return "", err
	}
	s.authHeaders(req)

	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("resolve profile: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	var rows []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", fmt.Errorf("profile %q not found", username)
	}
	return rows[0].ID, nil
}

func (s *supabaseClient) authHeaders(req *http.Request) {
	req.Header.Set("apikey", s.key)
	req.Header.Set("Authorization", "Bearer "+s.key)
}

func readSnippet(r io.Reader) string {
	b, _ := io.ReadAll(io.LimitReader(r, 512))
	return string(b)
}
