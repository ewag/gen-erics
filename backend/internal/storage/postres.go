// File: internal/storage/postgres.go
package storage

import (
	"context"
	"errors" // Import errors
	"fmt"
	"log/slog"
	"database/sql"
	"github.com/jackc/pgx/v5" // Import pgx
	"github.com/jackc/pgx/v5/pgxpool"

	// Import your models package
	models "github.com/ewag/gen-erics/backend/internal/models" // Adjust import path
)

// Define an interface for testability/mocking later (optional but good)
type StatusStore interface {
	GetStatus(ctx context.Context, studyUID string) (*models.LocationStatus, bool, error) // Returns status, found boolean, error
	SetStatus(ctx context.Context, studyUID string, status models.LocationStatus) error
	Ping(ctx context.Context) error
}

// Store handles database operations.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore creates a new Store instance.
func NewStore(pool *pgxpool.Pool) *Store {
	if pool == nil {
		panic("database pool cannot be nil") // Or handle more gracefully
	}
	return &Store{pool: pool}
}

// GetStatus retrieves the LocationStatus for a given studyUID.
// Returns the status, a boolean indicating if found, and any error.
func (s *Store) GetStatus(ctx context.Context, studyUID string) (*models.LocationStatus, bool, error) {
	query := `
        SELECT tier, location_type, edge_id
        FROM study_status
        WHERE study_instance_uid = $1
    `
	status := &models.LocationStatus{}
	var nullableEdgeID sql.NullString // Use pgx's nullable type for scanning

	slog.DebugContext(ctx, "Querying study status", "studyUID", studyUID)
	err := s.pool.QueryRow(ctx, query, studyUID).Scan(&status.Tier, &status.LocationType, &nullableEdgeID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.DebugContext(ctx, "No status found for study in DB", "studyUID", studyUID)
			return nil, false, nil // Not found, but not an error
		}
		slog.ErrorContext(ctx, "Error querying study status from DB", "studyUID", studyUID, "error", err)
		return nil, false, fmt.Errorf("failed to query study status: %w", err) // Database error
	}

	// Handle nullable EdgeID
	if nullableEdgeID.Valid {
		status.EdgeID = &nullableEdgeID.String
	} else {
		status.EdgeID = nil
	}

	slog.DebugContext(ctx, "Found study status in DB", "studyUID", studyUID, "status", status)
	return status, true, nil // Found successfully
}

// SetStatus inserts or updates the LocationStatus for a given studyUID (Upsert).
func (s *Store) SetStatus(ctx context.Context, studyUID string, status models.LocationStatus) error {
	query := `
        INSERT INTO study_status (study_instance_uid, tier, location_type, edge_id, last_updated)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (study_instance_uid) DO UPDATE SET
            tier = EXCLUDED.tier,
            location_type = EXCLUDED.location_type,
            edge_id = EXCLUDED.edge_id,
            last_updated = CURRENT_TIMESTAMP
    `
	slog.DebugContext(ctx, "Setting study status in DB", "studyUID", studyUID, "status", status)

    // Use pgx.NullString for nullable edge_id
    var nullableEdgeID sql.NullString
    if status.EdgeID != nil {
        nullableEdgeID = sql.NullString{String: *status.EdgeID, Valid: true}
    } else {
         nullableEdgeID = sql.NullString{Valid: false}
    }

	commandTag, err := s.pool.Exec(ctx, query, studyUID, status.Tier, status.LocationType, nullableEdgeID)
	if err != nil {
		slog.ErrorContext(ctx, "Error executing upsert study status in DB", "studyUID", studyUID, "error", err)
		return fmt.Errorf("failed to set study status: %w", err)
	}

	slog.DebugContext(ctx, "Successfully set study status", "studyUID", studyUID, "rowsAffected", commandTag.RowsAffected())
	return nil
}

func (s *Store) Ping(ctx context.Context) error {
    return s.pool.Ping(ctx)
}