package main

import (
	"context"
	"fmt"
	"strings"
)

func (a *app) canAccessProject(ctx context.Context, projectID, userID string) bool {
	if !validUUID(projectID) {
		return false
	}
	var exists bool
	err := a.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.id = $1 AND (p.owner_id = $2 OR t.assignee_id = $2)
	)`, projectID, userID).Scan(&exists)
	return err == nil && exists
}

func (a *app) isProjectOwner(ctx context.Context, projectID, userID string) bool {
	if !validUUID(projectID) {
		return false
	}
	var exists bool
	err := a.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2)`, projectID, userID).Scan(&exists)
	return err == nil && exists
}

func (a *app) findProject(ctx context.Context, id string) (project, error) {
	var p project
	err := a.db.QueryRowContext(ctx, `SELECT id, name, COALESCE(description, ''), owner_id, created_at FROM projects WHERE id = $1`, id).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	return p, err
}

func (a *app) tasksForProject(ctx context.Context, projectID, status, assignee string, page, limit int) ([]task, int, error) {
	if status != "" && !validStatus(status) {
		return nil, 0, fmt.Errorf("invalid status")
	}
	if assignee != "" && !validUUID(assignee) {
		return nil, 0, fmt.Errorf("invalid assignee")
	}
	where := `WHERE project_id = $1`
	args := []any{projectID}
	if status != "" {
		args = append(args, status)
		where += fmt.Sprintf(" AND status = $%d", len(args))
	}
	if assignee != "" {
		args = append(args, assignee)
		where += fmt.Sprintf(" AND assignee_id = $%d", len(args))
	}
	var total int
	if err := a.db.QueryRowContext(ctx, `SELECT count(*) FROM tasks `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * limit
	args = append(args, limit, offset)
	q := fmt.Sprintf(`SELECT id, title, COALESCE(description, ''), status, priority, project_id, assignee_id, created_by, due_date::text, created_at, updated_at FROM tasks %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`, where, len(args)-1, len(args))
	rows, err := a.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	tasks := []task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, 0, err
		}
		tasks = append(tasks, t)
	}
	return tasks, total, rows.Err()
}

func (a *app) insertTask(ctx context.Context, projectID, userID, title, description, status, priority string, assigneeID, dueDate *string) (task, error) {
	var t task
	err := a.db.QueryRowContext(ctx, `
		INSERT INTO tasks (title, description, status, priority, project_id, assignee_id, created_by, due_date)
		VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8)
		RETURNING id, title, COALESCE(description, ''), status, priority, project_id, assignee_id, created_by, due_date::text, created_at, updated_at`,
		strings.TrimSpace(title), strings.TrimSpace(description), status, priority, projectID, nullableString(assigneeID), userID, nullableString(dueDate),
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func (a *app) findTaskWithOwner(ctx context.Context, id string) (task, string, error) {
	var t task
	var ownerID string
	err := a.db.QueryRowContext(ctx, `
		SELECT t.id, t.title, COALESCE(t.description, ''), t.status, t.priority, t.project_id, t.assignee_id, t.created_by, t.due_date::text, t.created_at, t.updated_at, p.owner_id
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE t.id = $1`, id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt, &ownerID)
	return t, ownerID, err
}
