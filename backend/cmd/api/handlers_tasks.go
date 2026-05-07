package main

import (
	"net/http"
	"strings"
)

func (a *app) listTasks(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	projectID := r.PathValue("id")
	if !a.canAccessProject(r.Context(), projectID, u.ID) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	status := r.URL.Query().Get("status")
	assignee := r.URL.Query().Get("assignee")
	page, limit := parsePagination(r)
	tasks, total, err := a.tasksForProject(r.Context(), projectID, status, assignee, page, limit)
	if err != nil {
		writeValidation(w, validationError{"filter": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks, "page": page, "limit": limit, "total": total})
}

func (a *app) createTask(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	projectID := r.PathValue("id")
	if !a.canAccessProject(r.Context(), projectID, u.ID) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	var in struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		AssigneeID  *string `json:"assignee_id"`
		DueDate     *string `json:"due_date"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	fields := validateTaskInput(in.Title, in.Status, in.Priority, in.AssigneeID, in.DueDate, true)
	if len(fields) > 0 {
		writeValidation(w, fields)
		return
	}
	if in.Status == "" {
		in.Status = "todo"
	}
	if in.Priority == "" {
		in.Priority = "medium"
	}
	t, err := a.insertTask(r.Context(), projectID, u.ID, in.Title, in.Description, in.Status, in.Priority, in.AssigneeID, in.DueDate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, t)
	a.broker.publish(projectID, sseEvent{Type: "task_created", Data: t})
}

func (a *app) updateTask(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := r.PathValue("id")
	existing, ownerID, err := a.findTaskWithOwner(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if ownerID != u.ID && existing.CreatedBy != u.ID && (existing.AssigneeID == nil || *existing.AssigneeID != u.ID) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var in struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
		Priority    *string `json:"priority"`
		AssigneeID  *string `json:"assignee_id"`
		DueDate     *string `json:"due_date"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	title := existing.Title
	description := existing.Description
	status := existing.Status
	priority := existing.Priority
	assignee := existing.AssigneeID
	dueDate := existing.DueDate
	if in.Title != nil {
		title = strings.TrimSpace(*in.Title)
	}
	if in.Description != nil {
		description = strings.TrimSpace(*in.Description)
	}
	if in.Status != nil {
		status = *in.Status
	}
	if in.Priority != nil {
		priority = *in.Priority
	}
	if in.AssigneeID != nil {
		if *in.AssigneeID == "" {
			assignee = nil
		} else {
			assignee = in.AssigneeID
		}
	}
	if in.DueDate != nil {
		if *in.DueDate == "" {
			dueDate = nil
		} else {
			dueDate = in.DueDate
		}
	}
	fields := validateTaskInput(title, status, priority, assignee, dueDate, true)
	if len(fields) > 0 {
		writeValidation(w, fields)
		return
	}
	var t task
	err = a.db.QueryRowContext(r.Context(), `
		UPDATE tasks
		SET title = $1, description = NULLIF($2, ''), status = $3, priority = $4, assignee_id = $5, due_date = $6, updated_at = now()
		WHERE id = $7
		RETURNING id, title, COALESCE(description, ''), status, priority, project_id, assignee_id, created_by, due_date::text, created_at, updated_at`,
		title, description, status, priority, nullableString(assignee), nullableString(dueDate), id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, t)
	a.broker.publish(t.ProjectID, sseEvent{Type: "task_updated", Data: t})
}

func (a *app) deleteTask(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := r.PathValue("id")
	t, ownerID, err := a.findTaskWithOwner(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if ownerID != u.ID && t.CreatedBy != u.ID {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	if _, err := a.db.ExecContext(r.Context(), `DELETE FROM tasks WHERE id = $1`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	a.broker.publish(t.ProjectID, sseEvent{Type: "task_deleted", Data: map[string]string{"id": id, "project_id": t.ProjectID}})
	w.WriteHeader(http.StatusNoContent)
}
