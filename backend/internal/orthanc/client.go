package orthanc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"io"
	"context"
	"log/slog"
	// "errors"
)

const (
	contentTypeDICOM = "application/dicom"
)

// Client manages communication with the Orthanc API
type Client struct {
	BaseURL    string
	httpClient *http.Client
}

// NewClient creates a new Orthanc API client with a default HTTP client
func NewClient(baseURL string, timeout time.Duration) *Client {
	return NewClientWithHttpClient(baseURL, &http.Client{Timeout: timeout})
}

// NewClientWithHttpClient creates a new Orthanc API client with a specific *http.Client
// This allows passing an instrumented client.
func NewClientWithHttpClient(baseURL string, client *http.Client) *Client {
	if client == nil { // Basic default if nil is passed
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{
		BaseURL:    baseURL,
		httpClient: client,
	}
}

// ListStudies retrieves a list of study IDs from Orthanc
// Returns slice of strings (IDs) or an error
func (c *Client) ListStudies() ([]string, error) {
	targetURL := fmt.Sprintf("%s/studies", c.BaseURL)

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request to %s: %w", targetURL, err)
	}
	// Add authentication headers later if needed

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get studies from %s: %w", targetURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// TODO: Read body for more error details from Orthanc if available
		return nil, fmt.Errorf("received non-OK status code %d from %s", resp.StatusCode, targetURL)
	}

	var studies []string // Orthanc /studies endpoint returns a JSON array of strings
	if err := json.NewDecoder(resp.Body).Decode(&studies); err != nil {
		return nil, fmt.Errorf("failed to decode studies response from %s: %w", targetURL, err)
	}

	return studies, nil
}

// GetInstancePreview retrieves a rendered preview image (e.g., PNG) for a specific instance.
// Returns image bytes, content type string, and error.
func (c *Client) GetInstancePreview(instanceUID string) ([]byte, string, error) {
	// Orthanc uses /instances/{id}/preview endpoint
	targetURL := fmt.Sprintf("%s/instances/%s/preview", c.BaseURL, instanceUID)
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create preview request for instance %s: %w", instanceUID, err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get preview for instance %s: %w", instanceUID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Handle specific errors like Not Found
		if resp.StatusCode == http.StatusNotFound {
			return nil, "", fmt.Errorf("instance %s not found (404)", instanceUID) // Consider a custom error type
		}
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, "", fmt.Errorf("received non-OK status code %d getting preview for instance %s: %s", resp.StatusCode, instanceUID, string(bodyBytes))
	}

	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read preview response body for instance %s: %w", instanceUID, err)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream" // Default if not specified
	}

	return imageData, contentType, nil
}

// GetInstanceSimplifiedTags retrieves simplified DICOM tags for an instance as JSON.
func (c *Client) GetInstanceSimplifiedTags(instanceUID string) (map[string]string, error) {
	// Orthanc uses /instances/{id}/simplified-tags endpoint
	targetURL := fmt.Sprintf("%s/instances/%s/simplified-tags", c.BaseURL, instanceUID)
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create simplified-tags request for instance %s: %w", instanceUID, err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get simplified-tags for instance %s: %w", instanceUID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("instance %s not found (404)", instanceUID) // Consider a custom error type
		}
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("received non-OK status code %d getting simplified-tags for instance %s: %s", resp.StatusCode, instanceUID, string(bodyBytes))
	}

	var tags map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return nil, fmt.Errorf("failed to decode simplified-tags response for instance %s: %w", instanceUID, err)
	}

	return tags, nil
}

// GetInstanceFile retrieves the raw DICOM file content for a specific instance. 
// look to use io.ReadCloser for streaming later
func (c *Client) GetInstanceFile(instanceUID string) ([]byte, error) {
	// Orthanc uses /instances/{id}/file endpoint
	targetURL := fmt.Sprintf("%s/instances/%s/file", c.BaseURL, instanceUID)
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create file request for instance %s: %w", instanceUID, err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get file for instance %s: %w", instanceUID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("instance %s not found (404)", instanceUID) // Consider a custom error type
		}
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("received non-OK status code %d getting file for instance %s: %s", resp.StatusCode, instanceUID, string(bodyBytes))
	}

	// Optional: Check Content-Type if needed
	// if resp.Header.Get("Content-Type") != contentTypeDICOM { ... }

	dicomData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read file response body for instance %s: %w", instanceUID, err)
	}

	return dicomData, nil
}
// --- Add more methods later for other Orthanc interactions ---
// e.g., GetStudyDetails, GetSeries, GetInstance, GetWADO, PostInstance etc.
func (c *Client) GetStudyDetails(ctx context.Context, orthancStudyID string) (*StudyDetails, error) { // Make sure StudyDetails struct is defined (e.g., in types.go)
	if orthancStudyID == "" {
		return nil, fmt.Errorf("orthancStudyID cannot be empty")
	}
	// Endpoint for detailed study info
	targetURL := fmt.Sprintf("%s/studies/%s", c.BaseURL, orthancStudyID)

	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil) // Use context
	if err != nil {
		return nil, fmt.Errorf("failed to create request to get study details: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		slog.ErrorContext(ctx, "Orthanc client failed to execute request for study details", "url", targetURL, "error", err)
		return nil, fmt.Errorf("failed to execute request to get study details: %w", err)
	}
	defer resp.Body.Close()

	logAttrs := []any{"url", targetURL, "statusCode", resp.StatusCode} // Attributes for logging

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		logAttrs = append(logAttrs, "responseBody", string(bodyBytes))
		slog.ErrorContext(ctx, "Orthanc returned non-OK status getting study details", logAttrs...)
        // Return specific error for not found
        if resp.StatusCode == http.StatusNotFound {
            return nil, fmt.Errorf("study %s not found (404)", orthancStudyID)
        }
		return nil, fmt.Errorf("orthanc returned non-OK status %d getting study details", resp.StatusCode)
	}

	var details StudyDetails // Assumes StudyDetails struct is defined in this package
	if err := json.NewDecoder(resp.Body).Decode(&details); err != nil {
		slog.ErrorContext(ctx, "Failed to decode study details response from Orthanc", "url", targetURL, "error", err)
		return nil, fmt.Errorf("failed to decode study details response: %w", err)
	}

	slog.DebugContext(ctx, "Successfully retrieved study details from Orthanc", logAttrs...)
	return &details, nil
}

// GetStudyInstances retrieves details for all instances within a specific study ID from Orthanc.
func (c *Client) GetStudyInstances(ctx context.Context, orthancStudyID string) ([]InstanceDetails, error) { // Make sure InstanceDetails struct is defined
	if orthancStudyID == "" {
		return nil, fmt.Errorf("orthancStudyID cannot be empty")
	}
	// Endpoint for instances within a study
	targetURL := fmt.Sprintf("%s/studies/%s/instances", c.BaseURL, orthancStudyID)

	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil) // Use context
	if err != nil {
		return nil, fmt.Errorf("failed to create request to get study instances: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		slog.ErrorContext(ctx, "Orthanc client failed to execute request for study instances", "url", targetURL, "error", err)
		return nil, fmt.Errorf("failed to execute request to get study instances: %w", err)
	}
	defer resp.Body.Close()

    logAttrs := []any{"url", targetURL, "statusCode", resp.StatusCode}

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
        logAttrs = append(logAttrs, "responseBody", string(bodyBytes))
		slog.ErrorContext(ctx, "Orthanc returned non-OK status getting study instances", logAttrs...)
         // Return specific error for not found
        if resp.StatusCode == http.StatusNotFound {
             return nil, fmt.Errorf("study %s not found (404) when getting instances", orthancStudyID)
        }
		return nil, fmt.Errorf("orthanc returned non-OK status %d getting study instances", resp.StatusCode)
	}

	var instances []InstanceDetails // Expecting a JSON array, assumes InstanceDetails struct is defined
	if err := json.NewDecoder(resp.Body).Decode(&instances); err != nil {
        slog.ErrorContext(ctx, "Failed to decode study instances response from Orthanc", "url", targetURL, "error", err)
		return nil, fmt.Errorf("failed to decode study instances response: %w", err)
	}

    logAttrs = append(logAttrs, "instanceCount", len(instances))
	slog.DebugContext(ctx, "Successfully retrieved study instances from Orthanc", logAttrs...)
	return instances, nil
}