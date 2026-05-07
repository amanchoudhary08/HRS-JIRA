package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
)

func testApp(t *testing.T) (*app, func()) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set – skipping integration tests")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("ping db: %v", err)
	}

	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("goose dialect: %v", err)
	}
	migrationsDir := "../../migrations"
	if err := goose.Up(db, migrationsDir); err != nil {
		t.Fatalf("migrations up: %v", err)
	}

	secret := "test-secret-for-integration"
	a := &app{
		db:        db,
		jwtSecret: []byte(secret),
		logger:    slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError})),
		broker:    newBroker(),
	}

	teardown := func() {
		// Roll back to a clean state after each test run.
		_ = goose.DownTo(db, migrationsDir, 0)
		db.Close()
	}
	return a, teardown
}

// do is a helper that marshals body to JSON, fires the request through the
// full handler chain (including CORS + auth middleware), and returns the
// recorder for inspection.
func do(a *app, method, path string, body any, token string) *httptest.ResponseRecorder {
	var reqBody *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewBuffer(b)
	} else {
		reqBody = &bytes.Buffer{}
	}

	req := httptest.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	mux := http.NewServeMux()
	a.routes(mux)

	rec := httptest.NewRecorder()
	a.log(a.cors(mux)).ServeHTTP(rec, req)
	return rec
}

func parseBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("parse body: %v — raw: %s", err, rec.Body.String())
	}
	return m
}

// ── Test 1: Register then login ──────────────────────────────────────────────

func TestRegisterAndLogin(t *testing.T) {
	a, teardown := testApp(t)
	defer teardown()

	// Register
	rec := do(a, http.MethodPost, "/auth/register", map[string]any{
		"name":     "Integration User",
		"email":    "integ@example.com",
		"password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("register: want 201 got %d — %s", rec.Code, rec.Body.String())
	}
	body := parseBody(t, rec)
	if body["token"] == nil {
		t.Fatal("register: expected token in response")
	}

	// Login with same credentials
	rec2 := do(a, http.MethodPost, "/auth/login", map[string]any{
		"email":    "integ@example.com",
		"password": "password123",
	}, "")
	if rec2.Code != http.StatusOK {
		t.Fatalf("login: want 200 got %d — %s", rec2.Code, rec2.Body.String())
	}
	body2 := parseBody(t, rec2)
	if body2["token"] == nil {
		t.Fatal("login: expected token in response")
	}

	// Wrong password → 401
	rec3 := do(a, http.MethodPost, "/auth/login", map[string]any{
		"email":    "integ@example.com",
		"password": "wrongpassword",
	}, "")
	if rec3.Code != http.StatusUnauthorized {
		t.Fatalf("bad login: want 401 got %d", rec3.Code)
	}
}

// ── Test 2: Duplicate email registration ─────────────────────────────────────

func TestRegisterDuplicateEmail(t *testing.T) {
	a, teardown := testApp(t)
	defer teardown()

	payload := map[string]any{
		"name":     "Dup User",
		"email":    "dup@example.com",
		"password": "password123",
	}
	rec1 := do(a, http.MethodPost, "/auth/register", payload, "")
	if rec1.Code != http.StatusCreated {
		t.Fatalf("first register: want 201 got %d", rec1.Code)
	}

	rec2 := do(a, http.MethodPost, "/auth/register", payload, "")
	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("duplicate register: want 400 got %d — %s", rec2.Code, rec2.Body.String())
	}
}

// ── Test 3: Unauthenticated access ───────────────────────────────────────────

func TestUnauthenticatedRoutes(t *testing.T) {
	a, teardown := testApp(t)
	defer teardown()

	routes := []struct{ method, path string }{
		{http.MethodGet, "/projects"},
		{http.MethodPost, "/projects"},
		{http.MethodGet, "/projects/00000000-0000-0000-0000-000000000001"},
	}
	for _, r := range routes {
		rec := do(a, r.method, r.path, nil, "")
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: want 401 got %d", r.method, r.path, rec.Code)
		}
	}
}

// ── Helper: register a user and return its JWT ───────────────────────────────

func registerUser(t *testing.T, a *app, email string) string {
	t.Helper()
	rec := do(a, http.MethodPost, "/auth/register", map[string]any{
		"name":     "Test",
		"email":    email,
		"password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("registerUser: want 201 got %d — %s", rec.Code, rec.Body.String())
	}
	body := parseBody(t, rec)
	return body["token"].(string)
}

// ── Test 4: Create project, add task, update task status ─────────────────────

func TestProjectAndTaskLifecycle(t *testing.T) {
	a, teardown := testApp(t)
	defer teardown()

	token := registerUser(t, a, "lifecycle@example.com")

	// Create project
	rec := do(a, http.MethodPost, "/projects", map[string]any{
		"name":        "Lifecycle Project",
		"description": "Testing",
	}, token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create project: want 201 got %d — %s", rec.Code, rec.Body.String())
	}
	proj := parseBody(t, rec)
	projectID := proj["id"].(string)

	// Create task
	rec2 := do(a, http.MethodPost, fmt.Sprintf("/projects/%s/tasks", projectID), map[string]any{
		"title":    "First task",
		"priority": "high",
	}, token)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("create task: want 201 got %d — %s", rec2.Code, rec2.Body.String())
	}
	taskBody := parseBody(t, rec2)
	taskID := taskBody["id"].(string)
	if taskBody["status"] != "todo" {
		t.Errorf("default status: want todo got %v", taskBody["status"])
	}

	// Update task to in_progress
	rec3 := do(a, http.MethodPatch, fmt.Sprintf("/tasks/%s", taskID), map[string]any{
		"status": "in_progress",
	}, token)
	if rec3.Code != http.StatusOK {
		t.Fatalf("update task: want 200 got %d — %s", rec3.Code, rec3.Body.String())
	}
	updated := parseBody(t, rec3)
	if updated["status"] != "in_progress" {
		t.Errorf("updated status: want in_progress got %v", updated["status"])
	}

	// List tasks with status filter
	rec4 := do(a, http.MethodGet, fmt.Sprintf("/projects/%s/tasks?status=in_progress", projectID), nil, token)
	if rec4.Code != http.StatusOK {
		t.Fatalf("list tasks: want 200 got %d", rec4.Code)
	}
	listBody := parseBody(t, rec4)
	tasksList, ok := listBody["tasks"].([]any)
	if !ok || len(tasksList) != 1 {
		t.Errorf("expected 1 in_progress task, got %v", listBody["tasks"])
	}
}

// ── Test 5: Project owner-only mutation enforcement ──────────────────────────

func TestProjectOwnerEnforcement(t *testing.T) {
	a, teardown := testApp(t)
	defer teardown()

	ownerToken := registerUser(t, a, "owner@example.com")
	otherToken := registerUser(t, a, "other@example.com")

	// Owner creates project
	rec := do(a, http.MethodPost, "/projects", map[string]any{"name": "Owner Project"}, ownerToken)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create project: %d — %s", rec.Code, rec.Body.String())
	}
	proj := parseBody(t, rec)
	projectID := proj["id"].(string)

	// Other user tries to delete → 403
	rec2 := do(a, http.MethodDelete, fmt.Sprintf("/projects/%s", projectID), nil, otherToken)
	if rec2.Code != http.StatusForbidden {
		t.Errorf("delete by non-owner: want 403 got %d", rec2.Code)
	}

	// Other user tries to patch → 403
	rec3 := do(a, http.MethodPatch, fmt.Sprintf("/projects/%s", projectID), map[string]any{"name": "Hacked"}, otherToken)
	if rec3.Code != http.StatusForbidden {
		t.Errorf("patch by non-owner: want 403 got %d", rec3.Code)
	}

	// Owner can delete → 204
	rec4 := do(a, http.MethodDelete, fmt.Sprintf("/projects/%s", projectID), nil, ownerToken)
	if rec4.Code != http.StatusNoContent {
		t.Errorf("delete by owner: want 204 got %d — %s", rec4.Code, rec4.Body.String())
	}
}

// ── Test 6: Validation errors ────────────────────────────────────────────────

func TestValidationErrors(t *testing.T) {
	a, teardown := testApp(t)
	defer teardown()

	// Missing password
	rec := do(a, http.MethodPost, "/auth/register", map[string]any{
		"name":  "NoPass",
		"email": "nopass@example.com",
	}, "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing password: want 400 got %d", rec.Code)
	}
	body := parseBody(t, rec)
	if body["error"] != "validation failed" {
		t.Errorf("expected validation error, got %v", body["error"])
	}

	token := registerUser(t, a, "val@example.com")

	// Create project with empty name
	rec2 := do(a, http.MethodPost, "/projects", map[string]any{"name": ""}, token)
	if rec2.Code != http.StatusBadRequest {
		t.Errorf("empty project name: want 400 got %d", rec2.Code)
	}
}
