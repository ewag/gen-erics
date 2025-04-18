// File: backend/internal/api/state.go
package api

import (
	"fmt"
	"sync"
)

// LocationStatus defines where a study might be
type LocationStatus struct {
	LocationType string `json:"locationType"` // e.g., "edge", "cloud"
	EdgeID       string `json:"edgeId,omitempty"` // e.g., "site-01", only if locationType is "edge"
	Tier         string `json:"tier"`           // e.g., "hot", "warm", "cold", "archive"
}

// --- In-memory store (Package-level variables) ---
// NOTE: In a real multi-replica setup, this needs a proper distributed cache/DB
var (
	// map key is StudyInstanceUID
	studyStatusStore = make(map[string]LocationStatus)
	statusMutex      = &sync.RWMutex{} // Read-Write mutex to protect concurrent access
)

// InitializeMockStatus adds some sample data for testing
// Called by NewAPIHandler or main.go
func InitializeMockStatus() {
	statusMutex.Lock()
	defer statusMutex.Unlock()
	// Add sample statuses - replace with actual Study UIDs from your test data later
	studyStatusStore["STUDY_UID_1_HOT"] = LocationStatus{LocationType: "edge", EdgeID: "k3d-default", Tier: "hot"}
	studyStatusStore["STUDY_UID_2_COLD"] = LocationStatus{LocationType: "cloud", Tier: "cold"}
	studyStatusStore["STUDY_UID_3_ARCHIVE"] = LocationStatus{LocationType: "cloud", Tier: "archive"}
	fmt.Println("Initialized Mock Study Status Store:", studyStatusStore)
}

// -- Helper function to get status (used by handlers) --
func getStudyStatus(studyUID string) (LocationStatus, bool) {
	statusMutex.RLock() // Lock for reading
	status, found := studyStatusStore[studyUID]
	statusMutex.RUnlock() // Unlock reading
	if !found {
		// Return default status if not found
		return LocationStatus{LocationType: "edge", EdgeID: "unknown", Tier: "hot"}, false
	}
	return status, true
}

// -- Helper function to set status (used by MoveStudyHandler) --
// (Optional - handler could access mutex directly, but this is cleaner)
func setStudyStatus(studyUID string, status LocationStatus) {
    statusMutex.Lock()
    studyStatusStore[studyUID] = status
    statusMutex.Unlock()
}

// NO APIHandler, NewAPIHandler, or other handler logic in this file.