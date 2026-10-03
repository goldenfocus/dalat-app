package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// errNotMutable means the slug already belongs to a published or cancelled row.
// The daemon only writes drafts.
var errNotMutable = errors.New("event is not a draft; left unchanged")

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

type insertedEvent struct {
	ID       string `json:"id"`
	Slug     string `json:"slug"`
	Title    string `json:"title"`
	Reopened bool   `json:"-"`
	Created  bool   `json:"-"`
}

type storedEvent struct {
	ID             string         `json:"id"`
	Slug           string         `json:"slug"`
	Status         string         `json:"status"`
	SourceMetadata map[string]any `json:"source_metadata"`
}

// saveDraft inserts a new draft or patches the same slug or source URL.
// A draft Review already rejected is reopened. Published and cancelled rows
// are left alone so a replay cannot unpublish an event.
func (s *supabaseClient) saveDraft(ctx context.Context, row map[string]any) (*insertedEvent, error) {
	slug, _ := row["slug"].(string)
	sourceURL := sourceURLFromRow(row)
	existing, err := s.findExisting(ctx, slug, sourceURL)
	if err != nil {
		return nil, err
	}
	if existing != nil && existing.Status != "draft" {
		return &insertedEvent{ID: existing.ID, Slug: existing.Slug, Title: ""}, errNotMutable
	}
	if existing == nil {
		saved, err := s.insertEvent(ctx, row)
		if saved != nil {
			saved.Created = true
		}
		return saved, err
	}
	saved, err := s.patchEvent(ctx, existing.ID, patchableRow(row))
	if err != nil {
		return nil, err
	}
	if saved.Slug == "" {
		saved.Slug = existing.Slug
	}
	saved.Reopened = reviewResult(existing) == "rejected"
	return saved, nil
}

func sourceURLFromRow(row map[string]any) string {
	if chat, _ := row["external_chat_url"].(string); chat != "" {
		return chat
	}
	meta, _ := row["source_metadata"].(map[string]any)
	if meta == nil {
		return ""
	}
	source, _ := meta["source_url"].(string)
	return source
}

func reviewResult(existing *storedEvent) string {
	if existing == nil || existing.SourceMetadata == nil {
		return ""
	}
	result, _ := existing.SourceMetadata["review_result"].(string)
	return result
}

func patchableRow(row map[string]any) map[string]any {
	patch := make(map[string]any, len(row))
	for key, value := range row {
		if key == "slug" || key == "created_by" {
			continue
		}
		patch[key] = value
	}
	return patch
}

func (s *supabaseClient) lookupSlug(ctx context.Context, slug string) (*storedEvent, error) {
	if slug == "" {
		return nil, fmt.Errorf("missing slug")
	}
	return s.lookupQuery(ctx, url.Values{
		"slug":   {"eq." + slug},
		"select": {"id,slug,status,source_metadata"},
	})
}

// findExisting matches the idempotent slug or, when Review stored the same
// source URL under that row, the source URL. A re-post must update the
// rejected draft instead of inserting a second wa-<id> row.
func (s *supabaseClient) findExisting(ctx context.Context, slug, sourceURL string) (*storedEvent, error) {
	if slug != "" {
		existing, err := s.lookupSlug(ctx, slug)
		if err != nil || existing != nil {
			return existing, err
		}
	}
	if sourceURL == "" {
		return nil, nil
	}
	quoted := `"` + strings.ReplaceAll(sourceURL, `"`, `\"`) + `"`
	return s.lookupQuery(ctx, url.Values{
		"or":     {`(external_chat_url.eq.` + quoted + `,source_metadata->>source_url.eq.` + quoted + `)`},
		"select": {"id,slug,status,source_metadata"},
		"limit":  {"1"},
	})
}

func (s *supabaseClient) lookupQuery(ctx context.Context, query url.Values) (*storedEvent, error) {
	endpoint := s.base + "/rest/v1/events?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	s.authHeaders(req)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("lookup event: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	var rows []storedEvent
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

func (s *supabaseClient) patchEvent(ctx context.Context, id string, row map[string]any) (*insertedEvent, error) {
	body, err := json.Marshal(row)
	if err != nil {
		return nil, err
	}
	endpoint := s.base + "/rest/v1/events?id=eq." + url.QueryEscape(id)
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	s.authHeaders(req)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("patch event: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	var rows []insertedEvent
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("patch event decode: %w", err)
	}
	if len(rows) == 0 {
		return &insertedEvent{ID: id}, nil
	}
	return &rows[0], nil
}

// insertEvent upserts an events row on slug so reconnects and retries stay
// idempotent. Returns the stored id/slug for the review hook.
func (s *supabaseClient) insertEvent(ctx context.Context, row map[string]any) (*insertedEvent, error) {
	body, err := json.Marshal(row)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/rest/v1/events", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	s.authHeaders(req)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")

	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("insert event: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	var rows []insertedEvent
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("insert event decode: %w", err)
	}
	if len(rows) == 0 {
		return &insertedEvent{}, nil
	}
	return &rows[0], nil
}

// notifyReviewHook POSTs a draft-ready payload to REVIEW_HOOK_URL so the
// Review bot can pick the row up. Failures are logged by the caller — a
// missed ping must not roll back the draft (Review can also poll
// source_metadata.needs_review).
func (s *supabaseClient) notifyReviewHook(ctx context.Context, hookURL, bearer string, payload map[string]any) error {
	if hookURL == "" {
		return nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, hookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("review hook: %s: %s", resp.Status, readSnippet(resp.Body))
	}
	return nil
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
