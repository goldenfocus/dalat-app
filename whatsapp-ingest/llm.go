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

// extractRequest is one vision or text call. Image is nil for text-only.
type extractRequest struct {
	Text      string
	Context   string
	GroupName string
	Image     []byte
	MIME      string
	Now       time.Time
}

// extractResult is the model JSON. Evidence strings have to appear in the
// conversation before a text-only field is trusted. Flyer fields may set
// FromImage when the words are visible only in the picture.
type extractResult struct {
	IsEvent           bool   `json:"is_event"`
	Title             string `json:"title"`
	Date              string `json:"date"`
	Time              string `json:"time"`
	EndDate           string `json:"end_date"`
	EndTime           string `json:"end_time"`
	Location          string `json:"location"`
	Address           string `json:"address"`
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
- is_event is true only for a meetup, show, ride, workshop, class, market, or similar announcement. False for chatter, thank-yous, questions, emoji, and private meal plans ("lunch", "cơm tấm") that are not invitations.
- Never invent a venue, address, price, organizer, date, or time. Use empty strings when the conversation or image does not show that fact.
- date is YYYY-MM-DD in Asia/Ho_Chi_Minh. time and end_time are 24-hour HH:MM or "".
- When the fact comes from the written conversation, date_evidence, time_evidence, location_evidence, price_evidence, and organizer_evidence must be exact substrings of that conversation.
- When the fact is visible only on a flyer image, set from_image true and copy only text you can see. Do not guess a venue from the scenery.
- If this message only adds details to an earlier announcement, set updates_message_id to that transcript message id. Otherwise "".
- cancelled is true only when the source says the event is cancelled.
- title is the event name. Do not use a caption such as "Poster with upcoming rides" when the image shows a real name.`

func (c *llmClient) Extract(ctx context.Context, req extractRequest) (extractResult, error) {
	if len(req.Image) > 8<<20 {
		return extractResult{}, fmt.Errorf("image too large")
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
	if len(req.Image) > 0 {
		b.WriteString("\nA flyer image is attached. Read the text in the image.\n")
	}
	return b.String()
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
	if len(req.Image) > 0 {
		mime := req.MIME
		if mime == "" {
			mime = "image/jpeg"
		}
		content = append(content, map[string]any{
			"type": "image_url",
			"image_url": map[string]string{
				"url": "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(req.Image),
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
		"max_tokens":      500,
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
	if len(req.Image) > 0 {
		mime := req.MIME
		if mime == "" {
			mime = "image/jpeg"
		}
		content = append(content, map[string]any{
			"type": "image",
			"source": map[string]string{
				"type":       "base64",
				"media_type": mime,
				"data":       base64.StdEncoding.EncodeToString(req.Image),
			},
		})
	}
	content = append(content, map[string]any{"type": "text", "text": prompt})
	body := map[string]any{
		"model":       c.anthropicModel,
		"max_tokens":  500,
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
