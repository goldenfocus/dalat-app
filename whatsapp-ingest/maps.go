package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// mapsHit is a place resolved from a Google Maps URL. Name and coordinates
// come from the URL Google redirects to; they are not guessed.
type mapsHit struct {
	Name     string
	Address  string
	FinalURL string
	Lat      *float64
	Lng      *float64
}

var mapsLinkRe = regexp.MustCompile(`(?i)https?://(?:maps\.app\.goo\.gl/[A-Za-z0-9_\-]+|goo\.gl/maps/[A-Za-z0-9_\-]+|(?:www\.)?google\.[a-z.]+/maps\S+|maps\.google\.[a-z.]+\S+)`)

var mapsResolver = func(ctx context.Context, raw string) (mapsHit, error) {
	return resolveMapsLink(ctx, nil, raw)
}

func firstMapsLink(text string) string {
	match := mapsLinkRe.FindString(text)
	return strings.TrimRight(match, ".,);]>\"'")
}

func resolveMapsLink(ctx context.Context, client *http.Client, raw string) (mapsHit, error) {
	final, err := expandMapsURL(ctx, client, raw)
	if err != nil {
		return mapsHit{}, err
	}
	hit, ok := parseMapsTarget(final)
	if !ok {
		return mapsHit{}, fmt.Errorf("maps link did not resolve to a place")
	}
	if hit.FinalURL == "" {
		hit.FinalURL = final
	}
	return hit, nil
}

func expandMapsURL(ctx context.Context, client *http.Client, raw string) (string, error) {
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	current := raw
	startHost := hostOf(raw)
	for hop := 0; hop < 5; hop++ {
		if hit, ok := parseMapsTarget(current); ok && (hit.Name != "" || hit.Lat != nil) && hop > 0 {
			return current, nil
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, current, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)")
		noFollow := *client
		noFollow.CheckRedirect = func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}
		resp, err := noFollow.Do(req)
		if err != nil {
			return "", err
		}
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		if resp.StatusCode < 300 || resp.StatusCode >= 400 {
			return current, nil
		}
		loc := strings.TrimSpace(resp.Header.Get("Location"))
		if loc == "" {
			return "", fmt.Errorf("maps redirect missing location")
		}
		next, err := url.Parse(loc)
		if err != nil {
			return "", err
		}
		base, err := url.Parse(current)
		if err != nil {
			return "", err
		}
		next = base.ResolveReference(next)
		if !allowedMapsHost(next.Host) && !strings.EqualFold(next.Host, startHost) && !strings.EqualFold(hostOf(next.String()), startHost) {
			return "", fmt.Errorf("maps redirect left Google")
		}
		current = next.String()
		if hit, ok := parseMapsTarget(current); ok && (hit.Name != "" || hit.Lat != nil) {
			return current, nil
		}
	}
	return "", fmt.Errorf("maps redirect did not settle")
}

func hostOf(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

func allowedMapsHost(host string) bool {
	host = strings.ToLower(host)
	if h, _, ok := strings.Cut(host, ":"); ok {
		host = h
	}
	switch host {
	case "maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com", "google.com":
		return true
	}
	return strings.HasSuffix(host, ".google.com") || strings.HasSuffix(host, ".google.com.vn") || strings.HasSuffix(host, ".goo.gl")
}

var mapsAtRe = regexp.MustCompile(`@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)`)
var mapsDataRe = regexp.MustCompile(`!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)`)

func parseMapsTarget(raw string) (mapsHit, bool) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return mapsHit{}, false
	}
	if !allowedMapsHost(parsed.Host) {
		return mapsHit{}, false
	}
	hit := mapsHit{FinalURL: parsed.String()}
	path := parsed.EscapedPath()
	if i := strings.Index(strings.ToLower(path), "/place/"); i >= 0 {
		rest := path[i+len("/place/"):]
		rest, _, _ = strings.Cut(rest, "/")
		if name, err := url.PathUnescape(rest); err == nil {
			name = strings.ReplaceAll(name, "+", " ")
			name = strings.TrimSpace(name)
			if publicVenue(name) {
				hit.Name = name
			}
		}
	}
	if lat, lng, ok := coordsFrom(parsed.String()); ok {
		hit.Lat, hit.Lng = &lat, &lng
	}
	q := parsed.Query().Get("q")
	if q == "" {
		q = parsed.Query().Get("query")
	}
	if hit.Lat == nil {
		if lat, lng, ok := coordsFrom(q); ok {
			hit.Lat, hit.Lng = &lat, &lng
		}
	}
	if hit.Name == "" && q != "" && !coordString(q) && publicVenue(q) {
		name, addr := splitVenueValue(strings.TrimSpace(q))
		if name = normalizeVenueName(name); plausibleVenueName(name) {
			hit.Name = name
		}
		hit.Address = normalizeStreetAddress(addr)
		if hit.Name == "" && hit.Address == "" && hit.Lat == nil {
			return mapsHit{}, false
		}
	}
	if ll := parsed.Query().Get("ll"); hit.Lat == nil {
		if lat, lng, ok := splitCoords(ll); ok {
			hit.Lat, hit.Lng = &lat, &lng
		}
	}
	if hit.Name == "" && hit.Lat == nil && hit.Address == "" {
		return mapsHit{}, false
	}
	return hit, true
}

func coordsFrom(text string) (float64, float64, bool) {
	if m := mapsAtRe.FindStringSubmatch(text); m != nil {
		return splitCoords(m[1] + "," + m[2])
	}
	if m := mapsDataRe.FindStringSubmatch(text); m != nil {
		return splitCoords(m[1] + "," + m[2])
	}
	return splitCoords(text)
}

func splitCoords(text string) (float64, float64, bool) {
	text = strings.TrimSpace(text)
	latText, lngText, ok := strings.Cut(text, ",")
	if !ok {
		return 0, 0, false
	}
	lat, errLat := strconv.ParseFloat(strings.TrimSpace(latText), 64)
	lng, errLng := strconv.ParseFloat(strings.TrimSpace(lngText), 64)
	if errLat != nil || errLng != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return 0, 0, false
	}
	return lat, lng, true
}

func coordString(text string) bool {
	_, _, ok := splitCoords(text)
	return ok
}
