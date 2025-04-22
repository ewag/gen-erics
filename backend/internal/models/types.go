// File: internal/models/types.go
package models

// LocationStatus defines where a study might be.
// Used by both API and Storage layers.
type LocationStatus struct {
	LocationType string  `json:"locationType"`         // e.g., "edge", "cloud", "unknown"
	EdgeID       *string `json:"edgeId,omitempty"`       // Use pointer for nullable DB field
	Tier         string  `json:"tier"`                   // e.g., "hot", "cold", "archive"
}