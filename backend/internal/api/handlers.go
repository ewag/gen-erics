package api

import (
    "fmt" // <--- Make sure this is imported if you use fmt.Printf below
    "net/http"

    "github.com/gin-gonic/gin"
    // Make sure this import path matches your go.mod module path + directory structure
    "github.com/ewag/gen-erics/backend/internal/orthanc"
)

// APIHandler holds dependencies for API handlers
// DEFINED ONLY HERE
type APIHandler struct {
    orthancClient *orthanc.Client
}

// NewAPIHandler creates a new handler instance
// DEFINED ONLY HERE
func NewAPIHandler(orthancClient *orthanc.Client) *APIHandler {
    return &APIHandler{
        orthancClient: orthancClient,
    }
}

// ListStudiesHandler handles requests to list studies
// DEFINED ONLY HERE
func (h *APIHandler) ListStudiesHandler(c *gin.Context) {
    studies, err := h.orthancClient.ListStudies()
    if err != nil {
        fmt.Printf("Error getting studies from Orthanc: %v\n", err) // Uses fmt
        c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Failed to retrieve studies from Orthanc"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"studies": studies})
}

// HealthCheckHandler handles health check requests
// DEFINED ONLY HERE
func (h *APIHandler) HealthCheckHandler(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"status": "ok"})
}