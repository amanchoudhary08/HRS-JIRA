package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type scanner interface {
	Scan(dest ...any) error
}

func scanProject(s scanner) (project, error) {
	var p project
	err := s.Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	return p, err
}

func scanTask(s scanner) (task, error) {
	var t task
	err := s.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func validateTaskInput(title, status, priority string, assigneeID, dueDate *string, titleRequired bool) validationError {
	fields := validationError{}
	if titleRequired && strings.TrimSpace(title) == "" {
		fields["title"] = "is required"
	}
	if status != "" && !validStatus(status) {
		fields["status"] = "must be todo, in_progress, or done"
	}
	if priority != "" && !validPriority(priority) {
		fields["priority"] = "must be low, medium, or high"
	}
	if assigneeID != nil && *assigneeID != "" && !validUUID(*assigneeID) {
		fields["assignee_id"] = "must be a valid user id"
	}
	if dueDate != nil && *dueDate != "" {
		if _, err := time.Parse("2006-01-02", *dueDate); err != nil {
			fields["due_date"] = "must be YYYY-MM-DD"
		}
	}
	return fields
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeValidation(w, validationError{"body": "must be valid JSON"})
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeValidation(w http.ResponseWriter, fields validationError) {
	writeJSON(w, http.StatusBadRequest, map[string]any{"error": "validation failed", "fields": fields})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func currentUser(r *http.Request) authUser {
	return r.Context().Value(userKey).(authUser)
}

func nullableString(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

func validUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

func validStatus(s string) bool {
	return s == "todo" || s == "in_progress" || s == "done"
}

func validPriority(s string) bool {
	return s == "low" || s == "medium" || s == "high"
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parsePagination(r *http.Request) (page, limit int) {
	page = 1
	limit = 20
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	return
}

func waitForDB(ctx context.Context, db *sql.DB) error {
	deadline, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	for {
		if err := db.PingContext(deadline); err == nil {
			return nil
		}
		select {
		case <-deadline.Done():
			return deadline.Err()
		case <-time.After(time.Second):
		}
	}
}
