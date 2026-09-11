package main

import (
	"os"
	"path/filepath"
	"strings"
)

// dotEnvPath locates the app's .env.local: DOTENV_PATH override, else
// ../.env.local relative to the working directory (running from whatsapp-ingest/).
func dotEnvPath() string {
	if p := os.Getenv("DOTENV_PATH"); p != "" {
		return p
	}
	return filepath.Join("..", ".env.local")
}

// loadDotEnv populates missing environment variables from a .env-style file.
// Existing environment variables win. Missing file is fine.
func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for line := range strings.Lines(string(data)) {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		// Tolerate escaped newlines accidentally saved into values.
		value = strings.ReplaceAll(value, `\n`, "")
		value = strings.TrimSpace(value)
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}
