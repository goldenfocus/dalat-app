package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseMapsTarget(t *testing.T) {
	hit, ok := parseMapsTarget("https://www.google.com/maps/place/C%C3%B9+R%C3%BA/@11.94059,108.45818,17z")
	if !ok {
		t.Fatal("expected a place")
	}
	if hit.Name != "Cù Rú" {
		t.Fatalf("name=%q", hit.Name)
	}
	if hit.Lat == nil || *hit.Lat != 11.94059 || hit.Lng == nil || *hit.Lng != 108.45818 {
		t.Fatalf("coords=%v,%v", hit.Lat, hit.Lng)
	}
}

func TestExpandMapsShortLink(t *testing.T) {
	const place = "https://www.google.com/maps/place/C%C3%B9+R%C3%BA/@11.94,108.44,17z"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, place, http.StatusFound)
	}))
	defer server.Close()

	final, err := expandMapsURL(t.Context(), server.Client(), server.URL+"/abcDEF123")
	if err != nil {
		t.Fatal(err)
	}
	hit, ok := parseMapsTarget(final)
	if !ok || hit.Name != "Cù Rú" {
		t.Fatalf("final=%s hit=%+v", final, hit)
	}
}

func TestExpandMapsRejectsForeignRedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.com/phish", http.StatusFound)
	}))
	defer server.Close()
	if _, err := expandMapsURL(t.Context(), server.Client(), server.URL+"/abc"); err == nil {
		t.Fatal("followed a non-Google redirect")
	}
}
