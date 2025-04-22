// File: internal/orthanc/types.go (or add to client.go)
package orthanc

// StudyDetails holds selected information about a DICOM study from Orthanc.
// Field names match the JSON keys returned by Orthanc's REST API,
// specifically looking at PatientMainDicomTags and MainDicomTags.
type StudyDetails struct {
	ID              string   `json:"ID"` // Orthanc's internal Study ID (useful for other calls)
	PatientMainTags struct {
		PatientName string `json:"PatientName,omitempty"`
		PatientID   string `json:"PatientID,omitempty"`
        // Add other patient tags if needed (PatientBirthDate, PatientSex)
	} `json:"PatientMainDicomTags"`
	MainTags struct {
		StudyInstanceUID string `json:"StudyInstanceUID,omitempty"`
		StudyDate        string `json:"StudyDate,omitempty"`
		StudyTime        string `json:"StudyTime,omitempty"`
		StudyDescription string `json:"StudyDescription,omitempty"`
		AccessionNumber  string `json:"AccessionNumber,omitempty"`
        // Add other study tags if needed (ReferringPhysicianName)
	} `json:"MainDicomTags"`
	Series          []string `json:"Series"` // List of Orthanc Series IDs within this study
	IsStable        bool     `json:"IsStable"` // Useful status flag from Orthanc
	LastUpdate      string   `json:"LastUpdate"` // Timestamp of last change
	Type            string   `json:"Type"` // Should be "Study"
}

// InstanceDetails holds selected information about a DICOM instance from Orthanc.
// Field names match the JSON keys from /studies/{id}/instances or /instances/{id}.
type InstanceDetails struct {
	ID         string   `json:"ID"`       // Orthanc's internal Instance ID
	MainTags   struct {
		SOPInstanceUID string `json:"SOPInstanceUID,omitempty"`
		InstanceNumber string `json:"InstanceNumber,omitempty"` // Often string type in JSON
        // Add other instance tags if needed (SOPClassUID)
	} `json:"MainDicomTags"`
	FileSize   int64  `json:"FileSize"`   // File size in bytes
	FileUuid   string `json:"FileUUID"`   // Orthanc internal file identifier
	IndexInSeries int  `json:"IndexInSeries"` // Order within the series
	Type       string `json:"Type"`     // Should be "Instance"
}