package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// extractRequest is one vision or text call. Images is empty for text-only.
type extractRequest struct {
	Text      string
	Context   string
	GroupName string
	Image     []byte   // first / only image (kept for callers and tests)
	Images    [][]byte // full burst when several photos share one candidate
	MIME      string
	Now       time.Time
}

// extractResult is the model JSON. Evidence strings have to appear in the
// conversation or in readable_text before a field is trusted. FromImage is
// only valid when is_event_flyer is true and the words were read from the image.
type extractResult struct {
	IsEvent           bool   `json:"is_event"`
	IsEventFlyer      bool   `json:"is_event_flyer"`
	ImageKind         string `json:"image_kind"`
	ReadableText      string `json:"readable_text"`
	Title             string `json:"title"`
	Date              string `json:"date"`
	Time              string `json:"time"`
	EndDate           string `json:"end_date"`
	EndTime           string `json:"end_time"`
	VenueName         string `json:"venue_name"`
	StreetAddress     string `json:"street_address"`
	Location          string `json:"location"` // legacy alias of venue_name
	Address           string `json:"address"`  // legacy alias of street_address
	Price             string `json:"price"`
	Organizer         string `json:"organizer"`
	Cancelled         bool   `json:"cancelled"`
	UpdatesMessageID  string `json:"updates_message_id"`
	FromImage         bool   `json:"from_image"`
	DateEvidence      string `json:"date_evidence"`
	TimeEvidence      string `json:"time_evidence"`
	LocationEvidence  string `json:"location_evidence"`
	PriceEvidence     string `json:"price_evidence"`
	OrganizerEvidence string `json:"organizer_evidence"`
}

// extractor is the vision/text client. Tests substitute a fake.
type extractor interface {
	Extract(ctx context.Context, req extractRequest) (extractResult, error)
}

type llmClient struct {
	http            *http.Client
	openAIKey       string
	anthropicKey    string
	openRouterKey   string
	openAIBase      string
	anthropicBase   string
	openRouterBase  string
	openAIModel     string
	anthropicModel  string
	openRouterModel string
	force           string
}

func newExtractorFromEnv() extractor {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("WHATSAPP_EVENT_LLM")), "off") {
		return nil
	}
	client := &llmClient{
		http:            &http.Client{Timeout: 45 * time.Second},
		openAIKey:       firstEnv("OPENAI_API_KEY", "OPENAI_KEY"),
		anthropicKey:    os.Getenv("ANTHROPIC_API_KEY"),
		openRouterKey:   os.Getenv("OPENROUTER_API_KEY"),
		openAIBase:      "https://api.openai.com/v1",
		anthropicBase:   "https://api.anthropic.com/v1",
		openRouterBase:  "https://openrouter.ai/api/v1",
		openAIModel:     "gpt-4.1-mini",
		anthropicModel:  "claude-sonnet-4-20250514",
		openRouterModel: "google/gemini-2.5-flash-lite",
		force:           strings.ToLower(strings.TrimSpace(os.Getenv("WHATSAPP_EVENT_LLM"))),
	}
	if model := strings.TrimSpace(os.Getenv("WHATSAPP_EVENT_MODEL")); model != "" {
		client.openAIModel = model
		client.anthropicModel = model
		client.openRouterModel = model
	}
	if client.openAIKey == "" && client.anthropicKey == "" && client.openRouterKey == "" {
		return nil
	}
	return client
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}

const extractSystem = `You extract public event announcements from a Đà Lạt WhatsApp group. Return one JSON object and nothing else.
Rules:
- First classify any attached image: image_kind is one of flyer, photo_of_people, scenery, food, other. Put every character of event text you can actually read from the image into readable_text (OCR). If there is no readable event text, readable_text is "".
- is_event_flyer is true only when the image is a promotional flyer/poster AND readable_text contains both an event title and a date. Uncaptioned photos of people, scenery, food, or selfies are never flyers.
- is_event is true only when the caption announces a meetup/show/ride/workshop/class/market, OR is_event_flyer is true. False for chatter, thank-yous, questions, emoji, private meal plans ("lunch", "cơm tấm"), and photos with no event text.
- Never invent a title, venue, address, price, organizer, date, or time. Use empty strings when the conversation and readable_text do not show that fact. Do not guess from scenery, clothing, group names, or prior knowledge.
- date is YYYY-MM-DD in Asia/Ho_Chi_Minh. time and end_time are 24-hour HH:MM or "".
- When the fact comes from the written conversation, date_evidence, time_evidence, location_evidence, price_evidence, and organizer_evidence must be exact substrings of that conversation.
- When the fact is visible only on a flyer, set from_image true, set is_event_flyer true, and copy only text that appears in readable_text. Evidence fields must be exact substrings of readable_text.
- If this message only adds details to an earlier announcement, set updates_message_id to that transcript message id. Otherwise "".
- cancelled is true only when the source says the event is cancelled.
- title is the event name read from the caption or readable_text. Do not invent a name for a photo of people.
- venue_name is only the place's own name exactly as written in the caption or readable_text (for example "Q Coffee Roastery Dalat" or "Socialhouse"): no street, no "at the", no emoji. Never copy a phrase or sentence from the description into venue_name. "" when no place is named.
- street_address is the house number and street (plus ward/city when written) copied from the caption or readable_text, for example "305 Đ. Tô Ngọc Vân, Xuân Hương, Đà Lạt". "" when no street address is written. Do not put the venue name in it.
- location_evidence is the exact substring that names the venue or address.
- JSON keys: is_event, is_event_flyer, image_kind, readable_text, title, date, time, end_date, end_time, venue_name, street_address, price, organizer, cancelled, updates_message_id, from_image, date_evidence, time_evidence, location_evidence, price_evidence, organizer_evidence.`

func (c *llmClient) Extract(ctx context.Context, req extractRequest) (extractResult, error) {
	for _, img := range requestImages(req) {
		if len(img) > 8<<20 {
			return extractResult{}, fmt.Errorf("image too large")
		}
	}
	prompt := buildExtractPrompt(req)
	var errs []string
	for _, provider := range c.order() {
		raw, err := provider(ctx, prompt, req)
		if err != nil {
			errs = append(errs, err.Error())
			continue
		}
		parsed, err := parseExtractJSON(raw)
		if err != nil {
			errs = append(errs, err.Error())
			continue
		}
		return parsed, nil
	}
	if len(errs) == 0 {
		return extractResult{}, fmt.Errorf("no vision provider configured")
	}
	return extractResult{}, fmt.Errorf("event extraction failed: %s", strings.Join(errs, " | "))
}

func (c *llmClient) order() []func(context.Context, string, extractRequest) (string, error) {
	openAI := func(ctx context.Context, prompt string, req extractRequest) (string, error) {
		if c.openAIKey == "" {
			return "", fmt.Errorf("openai not configured")
		}
		return c.openAIChat(ctx, c.openAIBase, c.openAIKey, c.openAIModel, prompt, req, false)
	}
	anthropic := func(ctx context.Context, prompt string, req extractRequest) (string, error) {
		if c.anthropicKey == "" {
			return "", fmt.Errorf("anthropic not configured")
		}
		return c.anthropicChat(ctx, prompt, req)
	}
	openRouter := func(ctx context.Context, prompt string, req extractRequest) (string, error) {
		if c.openRouterKey == "" {
			return "", fmt.Errorf("openrouter not configured")
		}
		return c.openAIChat(ctx, c.openRouterBase, c.openRouterKey, c.openRouterModel, prompt, req, true)
	}
	switch c.force {
	case "openai":
		return []func(context.Context, string, extractRequest) (string, error){openAI}
	case "anthropic":
		return []func(context.Context, string, extractRequest) (string, error){anthropic}
	case "openrouter":
		return []func(context.Context, string, extractRequest) (string, error){openRouter}
	default:
		return []func(context.Context, string, extractRequest) (string, error){openAI, anthropic, openRouter}
	}
}

func buildExtractPrompt(req extractRequest) string {
	now := req.Now
	if now.IsZero() {
		now = time.Now()
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Current time in Asia/Ho_Chi_Minh: %s\nGroup: %s\n\nConversation:\n%s\n",
		now.In(mustLoc()).Format(time.RFC3339), req.GroupName, req.Context)
	if strings.TrimSpace(req.Text) != "" {
		fmt.Fprintf(&b, "\nMessage text:\n%s\n", req.Text)
	}
	n := len(req.Images)
	if n == 0 && len(req.Image) > 0 {
		n = 1
	}
	if n == 1 {
		b.WriteString("\nAn image is attached. Decide whether it is an event flyer with readable event text. Copy only text you can see into readable_text. Do not invent details.\n")
	} else if n > 1 {
		fmt.Fprintf(&b, "\n%d images from the same burst are attached. Decide whether any is an event flyer with readable event text. Copy only text you can see into readable_text. Do not invent details.\n", n)
	}
	return b.String()
}

func requestImages(req extractRequest) [][]byte {
	if len(req.Images) > 0 {
		return req.Images
	}
	if len(req.Image) > 0 {
		return [][]byte{req.Image}
	}
	return nil
}

func mustLoc() *time.Location {
	loc, err := time.LoadLocation(defaultEventLocation)
	if err != nil {
		return time.FixedZone("ICT", 7*3600)
	}
	return loc
}

func (c *llmClient) openAIChat(ctx context.Context, base, key, model, prompt string, req extractRequest, openRouter bool) (string, error) {
	content := []map[string]any{{"type": "text", "text": prompt}}
	mime := req.MIME
	if mime == "" {
		mime = "image/jpeg"
	}
	for _, img := range requestImages(req) {
		content = append(content, map[string]any{
			"type": "image_url",
			"image_url": map[string]string{
				"url": "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(img),
			},
		})
	}
	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": extractSystem},
			{"role": "user", "content": content},
		},
		"temperature":     0,
		"max_tokens":      1200,
		"response_format": map[string]string{"type": "json_object"},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(base, "/")+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+key)
	httpReq.Header.Set("Content-Type", "application/json")
	if openRouter {
		httpReq.Header.Set("HTTP-Referer", "https://dalat.app")
		httpReq.Header.Set("X-Title", "Dalat WhatsApp ingest")
	}
	resp, err := c.http.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("openai chat: %s: %s", resp.Status, truncate(string(payload), 180))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("openai chat: empty content")
	}
	return parsed.Choices[0].Message.Content, nil
}

func (c *llmClient) anthropicChat(ctx context.Context, prompt string, req extractRequest) (string, error) {
	content := []map[string]any{}
	mime := req.MIME
	if mime == "" {
		mime = "image/jpeg"
	}
	for _, img := range requestImages(req) {
		content = append(content, map[string]any{
			"type": "image",
			"source": map[string]string{
				"type":       "base64",
				"media_type": mime,
				"data":       base64.StdEncoding.EncodeToString(img),
			},
		})
	}
	content = append(content, map[string]any{"type": "text", "text": prompt})
	body := map[string]any{
		"model":       c.anthropicModel,
		"max_tokens":  1200,
		"temperature": 0,
		"system":      extractSystem,
		"messages": []map[string]any{
			{"role": "user", "content": content},
		},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.anthropicBase, "/")+"/messages", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("x-api-key", c.anthropicKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("anthropic: %s: %s", resp.Status, truncate(string(payload), 180))
	}
	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return "", err
	}
	for _, block := range parsed.Content {
		if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
			return block.Text, nil
		}
	}
	return "", fmt.Errorf("anthropic: empty content")
}

func parseExtractJSON(raw string) (extractResult, error) {
	text := strings.TrimSpace(raw)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)
	var result extractResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		start := strings.Index(text, "{")
		end := strings.LastIndex(text, "}")
		if start < 0 || end <= start {
			return extractResult{}, fmt.Errorf("extractor json: %w", err)
		}
		if err := json.Unmarshal([]byte(text[start:end+1]), &result); err != nil {
			return extractResult{}, fmt.Errorf("extractor json: %w", err)
		}
	}
	return result, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
