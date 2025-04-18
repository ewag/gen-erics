// File: backend/internal/api/routes.go
package api

import (
	"github.com/gin-gonic/gin"
	// Ensure correct import path
	"github.com/ewag/gen-erics/backend/internal/orthanc"
)

// RegisterRoutes sets up the API routes
func RegisterRoutes(router *gin.Engine, orthancClient *orthanc.Client) {
	// Create handler instance using constructor from handlers.go
	handler := NewAPIHandler(orthancClient)

	// Health check endpoint uses method from handlers.go
	router.GET("/healthz", handler.HealthCheckHandler)

	// API v1 group
	v1 := router.Group("/api/v1")
	{
		// Study Level Routes
		studies := v1.Group("/studies")
		{
			studies.GET("/:studyUID/location", handler.GetStudyLocationHandler)
			studies.POST("/:studyUID/move", handler.MoveStudyHandler)

			// Instance Level Routes (nested under study)
			instances := studies.Group("/:studyUID/instances")
			{
				instances.GET("/:instanceUID/preview", handler.GetInstancePreviewHandler)
				instances.GET("/:instanceUID/simplified-tags", handler.GetInstanceSimplifiedTagsHandler)
				instances.GET("/:instanceUID/file", handler.GetInstanceFileHandler)
			}
		}
	}
}