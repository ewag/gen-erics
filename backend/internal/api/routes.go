// File: backend/internal/api/routes.go
package api

import (
	"github.com/gin-gonic/gin"
	// Ensure correct import path
	// "github.com/ewag/gen-erics/backend/internal/orthanc"
)

// RegisterRoutes sets up the API routes
func RegisterRoutes(router *gin.Engine, handler *APIHandler) {
    // REMOVE: handler := NewAPIHandler(orthancClient)
    // REMOVE: InitializeMockStatus() // Should be called once in main or NewAPIHandler

    // Health check endpoint
    router.GET("/healthz", handler.HealthCheckHandler) // Uses the passed-in handler

    // API v1 group
    v1 := router.Group("/api/v1")
    {
        // Study Level Routes
        studies := v1.Group("/studies")
        {
            studies.GET("", handler.ListStudiesHandler)
            studies.GET("/:studyUID/location", handler.GetStudyLocationHandler)
            studies.POST("/:studyUID/move", handler.MoveStudyHandler)

            // Instance Level Routes
            instances := studies.Group("/:studyUID/instances")
            {
                instances.GET("", handler.ListStudyInstancesHandler)
                instances.GET("/:instanceUID/preview", handler.GetInstancePreviewHandler)
                instances.GET("/:instanceUID/simplified-tags", handler.GetInstanceSimplifiedTagsHandler)
                instances.GET("/:instanceUID/file", handler.GetInstanceFileHandler)
            }
        }
    }
}
