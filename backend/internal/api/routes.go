package api

import (
    "github.com/gin-gonic/gin"
    // Make sure this import path matches your go.mod module path + directory structure
    "github.com/ewag/gen-erics/backend/internal/orthanc"
    // NO fmt import needed here unless RegisterRoutes uses it directly
)

// RegisterRoutes sets up the API routes
func RegisterRoutes(router *gin.Engine, orthancClient *orthanc.Client) {
    // Creates handler using function from handlers.go
    handler := NewAPIHandler(orthancClient)

    // Uses methods defined in handlers.go
    router.GET("/healthz", handler.HealthCheckHandler)

    v1 := router.Group("/api/v1")
    {
        images := v1.Group("/images")
        {
            images.GET("/studies", handler.ListStudiesHandler)
        }
    }
}

// NO duplicate type/function/method definitions here