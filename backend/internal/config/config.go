// File: internal/config/config.go
package config

import (
	"os"
	"strconv"
	"time"
    // "fmt"
)

// Config holds application configuration.
type Config struct {
	ListenAddress     string
	OrthancURL        string
	HttpClientTimeout time.Duration
	Debug             bool
	OtelEndpoint       string // e.g., OTEL_EXPORTER_OTLP_ENDPOINT
	OtelServiceName    string // e.g., OTEL_SERVICE_NAME
	OtelServiceVersion string // e.g., OTEL_SERVICE_VERSION
     // --- DATABASE CONFIG FIELDS ---
     DBHost            string // e.g., DB_HOST -> dev-postgresql
     DBPort            string // e.g., DB_PORT -> 5432
     DBUser            string // e.g., DB_USER -> pacsuser
     DBPassword        string // e.g., DB_PASSWORD -> localdevpassword
     DBName            string // e.g., DB_NAME -> pacs_status

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
    
     // Defaults should match your Kubernetes Service name and Helm values
     DBHost:            GetEnv("DB_HOST", "dev-postgresql"), // Service name is '<release-name>-<chart-name>' -> dev-postgresql
     DBPort:            GetEnv("DB_PORT", "5432"),           // Standard Postgres port
     DBUser:            GetEnv("DB_USER", "pacsuser"),       // From values.yaml postgresql.auth.username
     DBPassword:        GetEnv("DB_PASSWORD", "localdevpassword"), // From values.yaml postgresql.auth.password (WARN: Insecure default)
     DBName:            GetEnv("DB_NAME", "pacs_status"),    // From values.yaml postgresql.auth.database
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