// File: backend/internal/api/handlers.go
package api

import (
	"fmt"
	"net/http"
	"strings"
	// "sync" // No longer needed here if using setStudyStatus helper

	"github.com/gin-gonic/gin"
	// Ensure correct import path for your project structure
	"github.com/ewag/gen-erics/backend/internal/orthanc"
)

// Constants used by handlers
const (
	contentTypeDICOM = "application/dicom"
)

// APIHandler holds dependencies for API handlers
// DEFINED ONLY HERE
type APIHandler struct {
	orthancClient *orthanc.Client
	// Add other dependencies like DB later
}

// NewAPIHandler creates a new handler instance
// DEFINED ONLY HERE
func NewAPIHandler(orthancClient *orthanc.Client) *APIHandler {
	InitializeMockStatus() // Call initialization from state.go
	return &APIHandler{
		orthancClient: orthancClient,
	}
}

// MoveRequest defines the expected JSON body for move requests
// DEFINED ONLY HERE (related to MoveStudyHandler input)
type MoveRequest struct {
	TargetTier     string `json:"targetTier" binding:"required"`
	TargetLocation string `json:"targetLocation,omitempty"`
}

// --- Handler Methods ---

func (h *APIHandler) HealthCheckHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ListStudiesHandler - kept for reference, may need rework later
func (h *APIHandler) ListStudiesHandler(c *gin.Context) {
	studies, err := h.orthancClient.ListStudies()
	if err != nil {
		fmt.Printf("Error getting studies from Orthanc: %v\n", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Failed to retrieve studies from Orthanc"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"studies": studies})
}

// GetStudyLocationHandler retrieves the location status for a given study.
func (h *APIHandler) GetStudyLocationHandler(c *gin.Context) {
	studyUID := c.Param("studyUID")
	if studyUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID parameter"})
		return
	}

	status, found := getStudyStatus(studyUID) // Use helper from state.go

	if !found {
		fmt.Printf("Status not found for study %s, assuming default: %v\n", studyUID, status)
		// status variable already holds the default from getStudyStatus
		c.JSON(http.StatusOK, status)
		return
	}

	fmt.Printf("Found status for study %s: %v\n", studyUID, status)
	c.JSON(http.StatusOK, status)
}

// MoveStudyHandler handles requests to move a study.
func (h *APIHandler) MoveStudyHandler(c *gin.Context) {
	studyUID := c.Param("studyUID")
	if studyUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID parameter"})
		return
	}

	var req MoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request body: %v", err)})
		return
	}

	fmt.Printf("Received request to move study %s to Tier: %s, Location: %s\n",
		studyUID, req.TargetTier, req.TargetLocation)

	// --- Mock Implementation ---
	newStatus := LocationStatus{ Tier: req.TargetTier }
	if req.TargetTier == "hot" && req.TargetLocation != "" {
		newStatus.LocationType = "edge"
		newStatus.EdgeID = req.TargetLocation
	} else if req.TargetTier != "hot" {
		newStatus.LocationType = "cloud"
		newStatus.EdgeID = ""
	} else {
		newStatus.LocationType = "unknown"
	}

	setStudyStatus(studyUID, newStatus) // Use helper from state.go

	fmt.Printf("Updated mock status for study %s: %v\n", studyUID, newStatus)

	c.JSON(http.StatusAccepted, gin.H{
		"message":      "Move request received, processing initiated (mock).",
		"currentStatus": newStatus,
	})
}

// GetInstancePreviewHandler - checks status before calling client
func (h *APIHandler) GetInstancePreviewHandler(c *gin.Context) {
	studyUID := c.Param("studyUID")
	instanceUID := c.Param("instanceUID")
	if studyUID == "" || instanceUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID or instanceUID parameter"})
		return
	}

	status, _ := getStudyStatus(studyUID) // Use helper from state.go
	fmt.Printf("Checking preview for instance %s in study %s. Status: %+v\n", instanceUID, studyUID, status)

	if status.Tier != "hot" {
		c.JSON(http.StatusAccepted, gin.H{
			"message": fmt.Sprintf("Image is in '%s' storage (Location: %s). Direct retrieval not available or implemented yet.", status.Tier, status.LocationType),
			"status":  status,
		})
		return
	}

	// If hot, proceed...
	imageData, contentType, err := h.orthancClient.GetInstancePreview(instanceUID)
	if err != nil {
		fmt.Printf("Error getting instance preview (UID: %s): %v\n", instanceUID, err)
		if strings.Contains(err.Error(), "not found (404)") {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Instance %s not found", instanceUID)})
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to retrieve instance preview from Orthanc"})
		}
		return
	}

	c.Header("Content-Type", contentType)
	c.Data(http.StatusOK, contentType, imageData)
}

// GetInstanceSimplifiedTagsHandler - checks status before calling client
func (h *APIHandler) GetInstanceSimplifiedTagsHandler(c *gin.Context) {
    studyUID := c.Param("studyUID")
	instanceUID := c.Param("instanceUID")
	if studyUID == "" || instanceUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID or instanceUID parameter"})
		return
	}

	status, _ := getStudyStatus(studyUID) // Use helper from state.go
    fmt.Printf("Checking tags for instance %s in study %s. Status: %+v\n", instanceUID, studyUID, status)

	if status.Tier != "hot" {
		c.JSON(http.StatusAccepted, gin.H{
			"message": fmt.Sprintf("Image is in '%s' storage (Location: %s). Metadata retrieval not available or implemented yet.", status.Tier, status.LocationType),
			"status":  status,
		})
		return
	}

	// If hot, proceed...
	tags, err := h.orthancClient.GetInstanceSimplifiedTags(instanceUID)
	if err != nil {
		fmt.Printf("Error getting instance simplified tags (UID: %s): %v\n", instanceUID, err)
		if strings.Contains(err.Error(), "not found (404)") {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Instance %s not found", instanceUID)})
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to retrieve instance tags from Orthanc"})
		}
		return
	}
	c.JSON(http.StatusOK, tags)
}

// GetInstanceFileHandler - checks status before calling client
func (h *APIHandler) GetInstanceFileHandler(c *gin.Context) {
    studyUID := c.Param("studyUID")
	instanceUID := c.Param("instanceUID")
	if studyUID == "" || instanceUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID or instanceUID parameter"})
		return
	}

	status, _ := getStudyStatus(studyUID) // Use helper from state.go
    fmt.Printf("Checking file for instance %s in study %s. Status: %+v\n", instanceUID, studyUID, status)

	if status.Tier != "hot" {
		c.JSON(http.StatusAccepted, gin.H{
			"message": fmt.Sprintf("Image is in '%s' storage (Location: %s). Direct retrieval not available or implemented yet.", status.Tier, status.LocationType),
			"status":  status,
		})
		return
	}

	// If hot, proceed...
	dicomData, err := h.orthancClient.GetInstanceFile(instanceUID)
	if err != nil {
		fmt.Printf("Error getting instance file (UID: %s): %v\n", instanceUID, err)
		if strings.Contains(err.Error(), "not found (404)") {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Instance %s not found", instanceUID)})
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to retrieve instance file from Orthanc"})
		}
		return
	}
	c.Header("Content-Type", contentTypeDICOM)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.dcm\"", instanceUID))
	c.Data(http.StatusOK, contentTypeDICOM, dicomData)
}