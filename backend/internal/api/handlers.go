// File: backend/internal/api/handlers.go
package api

import (
	"fmt"
	"log/slog"
	"net/http"
	// "strings"
	// "sync" // No longer needed here if using setStudyStatus helper

	"github.com/gin-gonic/gin"
	// Ensure correct import path for your project structure
	"github.com/ewag/gen-erics/backend/internal/orthanc"
	models "github.com/ewag/gen-erics/backend/internal/models"
	"github.com/ewag/gen-erics/backend/internal/storage"
)

// Constants used by handlers
const (
	contentTypeDICOM = "application/dicom"
)

// APIHandler holds dependencies for API handlers
// DEFINED ONLY HERE
type APIHandler struct {
	orthancClient 	*orthanc.Client
	db				storage.StatusStore
	// Add other dependencies like DB later
}

// NewAPIHandler creates a new handler instance
// DEFINED ONLY HERE
func NewAPIHandler(orthancClient *orthanc.Client, db storage.StatusStore) *APIHandler {
	return &APIHandler{
		orthancClient: 	orthancClient,
		db:				db,
	}
}

// MoveRequest defines the expected JSON body for move requests
// DEFINED ONLY HERE (related to MoveStudyHandler input)
type MoveRequest struct {
	TargetTier     string `json:"targetTier" binding:"required"`
	TargetLocation string `json:"targetLocation,omitempty"`
}

// MoveStudyHandler updates status in the database
func (h *APIHandler) MoveStudyHandler(c *gin.Context) {
    ctx := c.Request.Context()
    studyUID := c.Param("studyUID")
    if studyUID == "" { /* ... handle error ... */ return }

    var req MoveRequest
    if err := c.ShouldBindJSON(&req); err != nil { /* ... handle error ... */ return }

    logAttrs := []any{"studyUID", studyUID, "targetTier", req.TargetTier, "targetLocation", req.TargetLocation}
    slog.InfoContext(ctx, "Received move study request", logAttrs...)

    // Calculate new status struct (using models.LocationStatus)
    newStatus := models.LocationStatus{Tier: req.TargetTier}
    if req.TargetTier == "hot" && req.TargetLocation != "" {
        newStatus.LocationType = "edge"
        edgeId := req.TargetLocation // Create variable to take address
        newStatus.EdgeID = &edgeId     // Assign address for pointer
    } else if req.TargetTier != "hot" {
        newStatus.LocationType = "cloud"
        newStatus.EdgeID = nil // Explicitly set to nil for non-edge
    } else {
        slog.WarnContext(ctx, "Move to 'hot' tier requested without specific edge location", logAttrs...)
        newStatus.LocationType = "unknown"
        newStatus.EdgeID = nil
    }

    // Set status in DB via storage layer
    err := h.db.SetStatus(ctx, studyUID, newStatus)
    if err != nil {
        // Error already logged in storage layer
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update study status"})
        return
    }

    logAttrs = append(logAttrs, "newStatus", newStatus)
    slog.InfoContext(ctx, "Updated status for study in DB", logAttrs...)

    c.JSON(http.StatusAccepted, gin.H{
        "message":      "Move request received and status updated.", // Updated message
        "currentStatus": newStatus,
    })
}

// GetInstancePreviewHandler needs modification to use DB status check
func (h *APIHandler) GetInstancePreviewHandler(c *gin.Context) {
    ctx := c.Request.Context()
    studyUID := c.Param("studyUID")
    instanceUID := c.Param("instanceUID")
     if studyUID == "" || instanceUID == "" { /* ... handle error ... */ return }

    // Check status from DB
    status, found, err := h.db.GetStatus(ctx, studyUID)
     logAttrs := []any{"studyUID", studyUID, "instanceUID", instanceUID}
     if err != nil {
         c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check study status"})
         return
     }
     if !found { // Treat not found in DB as not 'hot' (or return 404 maybe?)
         logAttrs = append(logAttrs, "status", "unknown (not in DB)")
         slog.InfoContext(ctx, "Instance preview requested but study status unknown", logAttrs...)
         c.JSON(http.StatusPreconditionFailed, gin.H{"error": "Study status unknown"})
         return
     }

    logAttrs = append(logAttrs, "status", status)
    slog.DebugContext(ctx, "Checking preview status from DB", logAttrs...)

    // --- IMPORTANT: Only serve preview if 'hot' ---
    if status.Tier != "hot" { // Compare against actual tier string
        slog.InfoContext(ctx, "Instance preview requested but study not 'hot'", logAttrs...)
        c.JSON(http.StatusAccepted, gin.H{ // Or 412
            "message": fmt.Sprintf("Preview not available (Study status: %s)", status.Tier),
            "status":  status,
        })
        return
    }
    // ------------------------------------------

    // If hot, proceed...
    slog.InfoContext(ctx, "Fetching instance preview from Orthanc", logAttrs...)
    imageData, contentType, err := h.orthancClient.GetInstancePreview(instanceUID)
     // ... (rest of existing preview handler error handling and response) ...
    if err != nil { /* ... handle Orthanc errors ... */ return }
    c.Header("Content-Type", contentType)
    c.Data(http.StatusOK, contentType, imageData)
}

// GetInstanceSimplifiedTagsHandler - needs modification to use DB status check
func (h *APIHandler) GetInstanceSimplifiedTagsHandler(c *gin.Context) {
    ctx := c.Request.Context()
    studyUID := c.Param("studyUID")
    instanceUID := c.Param("instanceUID")
    if studyUID == "" || instanceUID == "" { /* ... handle error ... */ return }

    // Check status from DB
    status, found, err := h.db.GetStatus(ctx, studyUID)
     logAttrs := []any{"studyUID", studyUID, "instanceUID", instanceUID}
     if err != nil { /* ... handle internal error ... */ return }
     if !found { /* ... handle not found / return default ... */
         c.JSON(http.StatusPreconditionFailed, gin.H{"error": "Study status unknown"})
         return
     }

    logAttrs = append(logAttrs, "status", status)
    slog.DebugContext(ctx, "Checking tags status from DB", logAttrs...)

    // Only proceed if 'hot'
    if status.Tier != "hot" { /* ... return error/message ... */ return }

    // If hot, proceed...
    slog.InfoContext(ctx, "Fetching instance tags from Orthanc", logAttrs...)
    tags, err := h.orthancClient.GetInstanceSimplifiedTags(instanceUID)
    // ... (rest of existing tags handler error handling and response) ...
     if err != nil { /* ... handle Orthanc errors ... */ return }
    c.JSON(http.StatusOK, tags)
}

// GetInstanceFileHandler - needs modification to use DB status check
func (h *APIHandler) GetInstanceFileHandler(c *gin.Context) {
    ctx := c.Request.Context()
    studyUID := c.Param("studyUID")
    instanceUID := c.Param("instanceUID")
    if studyUID == "" || instanceUID == "" { /* ... handle error ... */ return }

    // Check status from DB
    status, found, err := h.db.GetStatus(ctx, studyUID)
     logAttrs := []any{"studyUID", studyUID, "instanceUID", instanceUID}
     if err != nil { /* ... handle internal error ... */ return }
     if !found { /* ... handle not found / return default ... */
         c.JSON(http.StatusPreconditionFailed, gin.H{"error": "Study status unknown"})
         return
     }

    logAttrs = append(logAttrs, "status", status)
    slog.DebugContext(ctx, "Checking file request status from DB", logAttrs...)

    // Only serve file if 'hot'
    if status.Tier != "hot" { // Check if tier is NOT "hot"
    slog.InfoContext(ctx, "Instance file requested but study not 'hot'", logAttrs...) // Log the reason
    c.JSON(http.StatusPreconditionFailed, gin.H{ // Send 412 status and JSON error body
        "error": fmt.Sprintf("Instance file not available locally (status: %s)", status.Tier),
    })
    return // Stop processing the request here
    }

    // If hot, proceed...
    slog.InfoContext(ctx, "Fetching instance file from Orthanc", logAttrs...)
    dicomData, err := h.orthancClient.GetInstanceFile(instanceUID)
    // ... (rest of existing file handler error handling and response) ...
    if err != nil { /* ... handle Orthanc errors ... */ return }
    c.Header("Content-Type", contentTypeDICOM)
    c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.dcm\"", instanceUID))
    c.Writer.Write(dicomData) // Use Write for []byte
}
func (h *APIHandler) ListStudyInstancesHandler(c *gin.Context) {
    ctx := c.Request.Context()
    studyUID := c.Param("studyUID") // This is likely the Orthanc Study ID from ListStudiesHandler result
	if studyUID == "" {
		slog.WarnContext(ctx, "Missing studyUID parameter for listing instances")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID parameter"})
		return
	}

    logAttrs := []any{"orthancStudyID", studyUID}
	slog.InfoContext(ctx, "Handling list instances for study request", logAttrs...)

	instances, err := h.orthancClient.GetStudyInstances(ctx, studyUID) // Pass context
	if err != nil {
        logAttrs = append(logAttrs, "error", err)
		slog.ErrorContext(ctx, "Failed to list instances from Orthanc", logAttrs...)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to retrieve instance list from storage"})
		return
	}

    logAttrs = append(logAttrs, "count", len(instances))
	slog.InfoContext(ctx, "Successfully retrieved instance list details", logAttrs...)
	c.JSON(http.StatusOK, instances) // Return slice of InstanceDetails
}
// Update this method in your api/handlers.go file

// GetStudyLocationHandler retrieves status from the database
func (h *APIHandler) GetStudyLocationHandler(c *gin.Context) {
    ctx := c.Request.Context()
    studyUID := c.Param("studyUID")
    
    if studyUID == "" {
        slog.ErrorContext(ctx, "Empty studyUID parameter")
        c.JSON(http.StatusBadRequest, gin.H{"error": "Missing studyUID parameter"})
        return
    }
    
    // Log the exact studyUID being queried to help debug
    slog.InfoContext(ctx, "Getting study location", "studyUID", studyUID)
    
    // Get status from DB via storage layer
    status, found, err := h.db.GetStatus(ctx, studyUID)
    
    if err != nil {
        // Log the full error details
        slog.ErrorContext(ctx, "Database error retrieving study status", 
            "studyUID", studyUID, 
            "error", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to retrieve study status: %v", err)})
        return
    }
    
    if !found {
        slog.InfoContext(ctx, "No status found for study in DB, returning default 'hot'", "studyUID", studyUID)
        // Define default status if not found in DB
        defaultStatus := &models.LocationStatus{
            LocationType: "edge",
            EdgeID:       nil,
            Tier:         "hot",
        }
        c.JSON(http.StatusOK, defaultStatus)
        return
    }
    
    // Status found in DB
    slog.InfoContext(ctx, "Returning study status from DB", "studyUID", studyUID, "status", status)
    c.JSON(http.StatusOK, status)
}
// Update this method in your api/handlers.go file

func (h *APIHandler) HealthCheckHandler(c *gin.Context) {
    ctx := c.Request.Context()
    
    // Check database connectivity
    err := h.db.Ping(ctx)
    if err != nil {
        slog.ErrorContext(ctx, "Database health check failed", "error", err)
        c.JSON(http.StatusServiceUnavailable, gin.H{
            "status": "error",
            "database": "unavailable",
            "error": err.Error(),
        })
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "status": "ok",
        "database": "connected",
    })
}
// ListStudiesHandler retrieves a list of studies from Orthanc
func (h *APIHandler) ListStudiesHandler(c *gin.Context) {
	ctx := c.Request.Context() // Use request context
	slog.InfoContext(ctx, "Handling list studies request")

	studyIDs, err := h.orthancClient.ListStudies() // Assumes this returns []string
	if err != nil {
		slog.ErrorContext(ctx, "Failed to list study IDs from Orthanc", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to retrieve study list from storage"})
		return
	}

	detailedStudies := make([]*orthanc.StudyDetails, 0, len(studyIDs)) // Pre-allocate slice
	for _, studyID := range studyIDs {
		// Fetch details for each study ID
		details, err := h.orthancClient.GetStudyDetails(ctx, studyID) // Pass context
		if err != nil {
			// Log the error for this specific study but continue with others
			slog.WarnContext(ctx, "Failed to get details for specific study", "orthancStudyID", studyID, "error", err)
			continue // Skip this study if details fail
		}
		if details != nil {
			detailedStudies = append(detailedStudies, details)
		}
	}

	slog.InfoContext(ctx, "Successfully retrieved study list details", "count", len(detailedStudies))
	c.JSON(http.StatusOK, detailedStudies) // Return the slice of detailed studies
}