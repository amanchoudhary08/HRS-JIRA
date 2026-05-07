package main

import (
	"net/http"
	"strings"
)

func (a *app) listProjects(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT DISTINCT p.id, p.name, COALESCE(p.description, ''), p.owner_id, p.created_at
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.owner_id = $1 OR t.assignee_id = $1
		ORDER BY p.created_at DESC
		LIMIT $2 OFFSET $3`, u.ID, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()
	projects := []project{}
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		projects = append(projects, p)
	}
	var total int
	_ = a.db.QueryRowContext(r.Context(), `
		SELECT COUNT(DISTINCT p.id)
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.owner_id = $1 OR t.assignee_id = $1`, u.ID).Scan(&total)
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects, "page": page, "limit": limit, "total": total})
}

func (a *app) createProject(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeValidation(w, validationError{"name": "is required"})
		return
	}
	var p project
	err := a.db.QueryRowContext(r.Context(), `INSERT INTO projects (name, description, owner_id) VALUES ($1, NULLIF($2, ''), $3) RETURNING id, name, COALESCE(description, ''), owner_id, created_at`, in.Name, strings.TrimSpace(in.Description), u.ID).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (a *app) getProject(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := r.PathValue("id")
	if !validUUID(id) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if !a.canAccessProject(r.Context(), id, u.ID) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	p, err := a.findProject(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	tasks, _, err := a.tasksForProject(r.Context(), id, "", "", 1, 1000)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, projectDetail{project: p, Tasks: tasks})
}

func (a *app) updateProject(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := r.PathValue("id")
	if !a.isProjectOwner(r.Context(), id, u.ID) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var in struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) == "" {
		writeValidation(w, validationError{"name": "is required"})
		return
	}
	p, err := a.findProject(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if in.Name != nil {
		p.Name = strings.TrimSpace(*in.Name)
	}
	if in.Description != nil {
		p.Description = strings.TrimSpace(*in.Description)
	}
	err = a.db.QueryRowContext(r.Context(), `UPDATE projects SET name = $1, description = NULLIF($2, '') WHERE id = $3 RETURNING id, name, COALESCE(description, ''), owner_id, created_at`, p.Name, p.Description, id).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *app) deleteProject(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := r.PathValue("id")
	if !a.isProjectOwner(r.Context(), id, u.ID) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	res, err := a.db.ExecContext(r.Context(), `DELETE FROM projects WHERE id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if count, _ := res.RowsAffected(); count == 0 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) projectStats(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	projectID := r.PathValue("id")
	if !a.canAccessProject(r.Context(), projectID, u.ID) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	byStatus := map[string]int{"todo": 0, "in_progress": 0, "done": 0}
	rows, err := a.db.QueryContext(r.Context(), `SELECT status, count(*) FROM tasks WHERE project_id = $1 GROUP BY status`, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var v int
		if err := rows.Scan(&k, &v); err == nil {
			byStatus[k] = v
		}
	}
	assignees := []map[string]any{}
	rows, err = a.db.QueryContext(r.Context(), `
		SELECT COALESCE(u.id::text, ''), COALESCE(u.name, 'Unassigned'), count(t.id)
		FROM tasks t
		LEFT JOIN users u ON u.id = t.assignee_id
		WHERE t.project_id = $1
		GROUP BY u.id, u.name
		ORDER BY u.name`, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		var count int
		if err := rows.Scan(&id, &name, &count); err == nil {
			assignees = append(assignees, map[string]any{"assignee_id": id, "name": name, "count": count})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"by_status": byStatus, "by_assignee": assignees})
}
