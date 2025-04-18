// File: backend/internal/config/config.go
package config // <-- Make sure this line is the very first thing

import (
	"os"
	"strconv"
	"time"
)

// Config holds application configuration
type Config struct {
	ListenAddress string
	OrthancURL    string
	HttpClientTimeout time.Duration
	// Add other config fields as needed (e.g., Auth keys, DB strings)
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Simple loading, add error handling and defaults as needed
	listenAddr := getEnv("LISTEN_ADDRESS", ":8080") // Default Gin port
	orthancURL := getEnv("ORTHANC_URL", "http://pacs-app-orthanc.default.svc.cluster.local:8042") // K8s service name default
    timeoutStr := getEnv("HTTP_CLIENT_TIMEOUT_SECONDS", "15")

    timeoutSec, err := strconv.Atoi(timeoutStr)
    if err != nil {
        timeoutSec = 15 // Default on error
    }

	cfg := &Config{
		ListenAddress: listenAddr,
		OrthancURL:    orthancURL,
		HttpClientTimeout: time.Duration(timeoutSec) * time.Second,
	}
	return cfg, nil
}

// Helper function to get environment variable or default
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}