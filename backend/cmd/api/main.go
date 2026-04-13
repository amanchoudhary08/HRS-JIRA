package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

type app struct {
	db        *sql.DB
	jwtSecret []byte
	logger    *slog.Logger
}

type ctxKey string

const userKey ctxKey = "user"

type authUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	OwnerID     string `json:"owner_id"`
	CreatedAt   string `json:"created_at"`
}

type task struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	ProjectID   string  `json:"project_id"`
	AssigneeID  *string `json:"assignee_id"`
	CreatedBy   string  `json:"created_by"`
	DueDate     *string `json:"due_date"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type projectDetail struct {
	project
	Tasks []task `json:"tasks"`
}

type validationError map[string]string

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	dsn := env("DATABASE_URL", "postgres://taskflow:taskflow@localhost:5432/taskflow?sslmode=disable")
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		logger.Error("JWT_SECRET is required")
		os.Exit(1)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := waitForDB(context.Background(), db); err != nil {
		logger.Error("database unavailable", "error", err)
		os.Exit(1)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		logger.Error("configure migrations", "error", err)
		os.Exit(1)
	}
	if err := goose.Up(db, "migrations"); err != nil {
		logger.Error("run migrations", "error", err)
		os.Exit(1)
	}

	api := &app{db: db, jwtSecret: []byte(secret), logger: logger}
	mux := http.NewServeMux()
	api.routes(mux)

	port := env("API_PORT", "4000")
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      api.log(api.cors(mux)),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("api listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	logger.Info("shutting down")
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("shutdown failed", "error", err)
	}
}

func (a *app) routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/register", a.register)
	mux.HandleFunc("POST /auth/login", a.login)
	mux.Handle("GET /users", a.auth(http.HandlerFunc(a.listUsers)))
	mux.Handle("GET /projects", a.auth(http.HandlerFunc(a.listProjects)))
	mux.Handle("POST /projects", a.auth(http.HandlerFunc(a.createProject)))
	mux.Handle("GET /projects/{id}", a.auth(http.HandlerFunc(a.getProject)))
	mux.Handle("PATCH /projects/{id}", a.auth(http.HandlerFunc(a.updateProject)))
	mux.Handle("DELETE /projects/{id}", a.auth(http.HandlerFunc(a.deleteProject)))
	mux.Handle("GET /projects/{id}/tasks", a.auth(http.HandlerFunc(a.listTasks)))
	mux.Handle("POST /projects/{id}/tasks", a.auth(http.HandlerFunc(a.createTask)))
	mux.Handle("GET /projects/{id}/stats", a.auth(http.HandlerFunc(a.projectStats)))
	mux.Handle("PATCH /tasks/{id}", a.auth(http.HandlerFunc(a.updateTask)))
	mux.Handle("DELETE /tasks/{id}", a.auth(http.HandlerFunc(a.deleteTask)))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"name": "TaskFlow API", "status": "ok"})
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

func (a *app) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	fields := validationError{}
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Name == "" {
		fields["name"] = "is required"
	}
	if in.Email == "" {
		fields["email"] = "is required"
	}
	if len(in.Password) < 8 {
		fields["password"] = "must be at least 8 characters"
	}
	if len(fields) > 0 {
		writeValidation(w, fields)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	u := authUser{}
	err = a.db.QueryRowContext(r.Context(), `INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email`, in.Name, in.Email, string(hash)).Scan(&u.ID, &u.Name, &u.Email)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			writeValidation(w, validationError{"email": "is already registered"})
			return
		}
		a.logger.Error("register", "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	token, err := a.issueToken(u)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": u})
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	fields := validationError{}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Email == "" {
		fields["email"] = "is required"
	}
	if in.Password == "" {
		fields["password"] = "is required"
	}
	if len(fields) > 0 {
		writeValidation(w, fields)
		return
	}
	var u authUser
	var hash string
	err := a.db.QueryRowContext(r.Context(), `SELECT id, name, email, password FROM users WHERE email = $1`, in.Email).Scan(&u.ID, &u.Name, &u.Email, &hash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	token, err := a.issueToken(u)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
}

func (a *app) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `SELECT id, name, email FROM users ORDER BY name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()
	users := []authUser{}
	for rows.Next() {
		var u authUser
		if err := rows.Scan(&u.ID, &u.Name, &u.Email); err != nil {
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		users = append(users, u)
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (a *app) listProjects(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT DISTINCT p.id, p.name, COALESCE(p.description, ''), p.owner_id, p.created_at
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.owner_id = $1 OR t.assignee_id = $1
		ORDER BY p.created_at DESC`, u.ID)
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
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects})
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
	tasks, err := a.tasksForProject(r.Context(), id, "", "")
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

func (a *app) listTasks(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	projectID := r.PathValue("id")
	if !a.canAccessProject(r.Context(), projectID, u.ID) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	status := r.URL.Query().Get("status")
	assignee := r.URL.Query().Get("assignee")
	tasks, err := a.tasksForProject(r.Context(), projectID, status, assignee)
	if err != nil {
		writeValidation(w, validationError{"filter": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
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
		RETURNING id, title, COALESCE(description, ''), status, priority, project_id, assignee_id, created_by, due_date, created_at, updated_at`,
		title, description, status, priority, nullableString(assignee), nullableString(dueDate), id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, t)
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

func (a *app) issueToken(u authUser) (string, error) {
	claims := jwt.MapClaims{
		"user_id": u.ID,
		"email":   u.Email,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.jwtSecret)
}

func (a *app) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.SplitN(r.Header.Get("Authorization"), " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		token, err := jwt.Parse(parts[1], func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return a.jwtSecret, nil
		})
		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id, _ := claims["user_id"].(string)
		email, _ := claims["email"].(string)
		if !validUUID(id) || email == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		var u authUser
		if err := a.db.QueryRowContext(r.Context(), `SELECT id, name, email FROM users WHERE id = $1 AND email = $2`, id, email).Scan(&u.ID, &u.Name, &u.Email); err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
	})
}

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

func (a *app) tasksForProject(ctx context.Context, projectID, status, assignee string) ([]task, error) {
	if status != "" && !validStatus(status) {
		return nil, fmt.Errorf("invalid status")
	}
	if assignee != "" && !validUUID(assignee) {
		return nil, fmt.Errorf("invalid assignee")
	}
	q := `SELECT id, title, COALESCE(description, ''), status, priority, project_id, assignee_id, created_by, due_date, created_at, updated_at FROM tasks WHERE project_id = $1`
	args := []any{projectID}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(" AND status = $%d", len(args))
	}
	if assignee != "" {
		args = append(args, assignee)
		q += fmt.Sprintf(" AND assignee_id = $%d", len(args))
	}
	q += " ORDER BY created_at DESC"
	rows, err := a.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := []task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (a *app) insertTask(ctx context.Context, projectID, userID, title, description, status, priority string, assigneeID, dueDate *string) (task, error) {
	var t task
	err := a.db.QueryRowContext(ctx, `
		INSERT INTO tasks (title, description, status, priority, project_id, assignee_id, created_by, due_date)
		VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8)
		RETURNING id, title, COALESCE(description, ''), status, priority, project_id, assignee_id, created_by, due_date, created_at, updated_at`,
		strings.TrimSpace(title), strings.TrimSpace(description), status, priority, projectID, nullableString(assigneeID), userID, nullableString(dueDate),
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func (a *app) findTaskWithOwner(ctx context.Context, id string) (task, string, error) {
	var t task
	var ownerID string
	err := a.db.QueryRowContext(ctx, `
		SELECT t.id, t.title, COALESCE(t.description, ''), t.status, t.priority, t.project_id, t.assignee_id, t.created_by, t.due_date, t.created_at, t.updated_at, p.owner_id
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE t.id = $1`, id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID, &t.AssigneeID, &t.CreatedBy, &t.DueDate, &t.CreatedAt, &t.UpdatedAt, &ownerID)
	return t, ownerID, err
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

func (a *app) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) log(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		a.logger.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "duration_ms", strconv.FormatInt(time.Since(start).Milliseconds(), 10))
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
