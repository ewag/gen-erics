package orthanc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client manages communication with the Orthanc API
type Client struct {
	BaseURL    string
	httpClient *http.Client
}

// NewClient creates a new Orthanc API client
func NewClient(baseURL string, timeout time.Duration) *Client {
	return &Client{
		BaseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout, // Set a reasonable timeout
		},
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

// --- Add more methods later for other Orthanc interactions ---
// e.g., GetStudyDetails, GetSeries, GetInstance, GetWADO, PostInstance etc.