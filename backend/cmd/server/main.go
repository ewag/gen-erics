package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/ewag/gen-erics/backend/internal/api"    // Adjust import path
	"github.com/ewag/gen-erics/backend/internal/config" // Adjust import path
	"github.com/ewag/gen-erics/backend/internal/orthanc"// Adjust import path
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize Orthanc Client
	orthancClient := orthanc.NewClient(cfg.OrthancURL, cfg.HttpClientTimeout)

	// Setup Gin router
	router := gin.Default() // Includes logger and recovery middleware

	// Register API routes
	api.RegisterRoutes(router, orthancClient)

	// Start the server
	fmt.Printf("Starting server on %s\n", cfg.ListenAddress)
	if err := router.Run(cfg.ListenAddress); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}