// File: internal/config/config.go
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds application configuration.
type Config struct {
	ListenAddress     string
	OrthancURL        string
	HttpClientTimeout time.Duration
	Debug             bool
	// --- ADD THESE FIELDS ---
	OtelEndpoint       string // e.g., OTEL_EXPORTER_OTLP_ENDPOINT
	OtelServiceName    string // e.g., OTEL_SERVICE_NAME
	OtelServiceVersion string // e.g., OTEL_SERVICE_VERSION
    // --- END ADDED FIELDS ---
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
    cfg := &Config{
        // Load existing fields using GetEnv
        ListenAddress:      GetEnv("LISTEN_ADDRESS", ":8080"),
        OrthancURL:         GetEnv("ORTHANC_URL", "http://localhost:8042"), // Adjust default if needed

        // --- LOAD NEW OTEL FIELDS using GetEnv ---
        OtelEndpoint:       GetEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "signoz-otel-collector.observability.svc.cluster.local:4317"), // Default SigNoz collector endpoint
        OtelServiceName:    GetEnv("OTEL_SERVICE_NAME", "gen-erics-backend"), // Default service name
        OtelServiceVersion: GetEnv("OTEL_SERVICE_VERSION", "1.0.0"), // Default version
        // --- END LOAD NEW OTEL FIELDS ---
    }

    // Load other fields (Timeout, Debug) using GetEnv
    timeoutStr := GetEnv("HTTP_CLIENT_TIMEOUT_SECONDS", "15")
    timeoutSec, err := strconv.Atoi(timeoutStr)
    if err != nil {
        cfg.HttpClientTimeout = 15 * time.Second // Default on error
    } else {
        cfg.HttpClientTimeout = time.Duration(timeoutSec) * time.Second
    }

    debugStr := GetEnv("DEBUG", "false")
    cfg.Debug, _ = strconv.ParseBool(debugStr) // Ignore error, default to false

    return cfg, nil // Assuming no other fatal errors during load
}

// GetEnv retrieves an environment variable or returns a default value.
// (Keep the exported version from the previous fix)
func GetEnv(key, fallback string) string {
    if value, exists := os.LookupEnv(key); exists {
        return value
    }
    return fallback
}