package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
)

type app struct {
	db        *sql.DB
	jwtSecret []byte
	logger    *slog.Logger
	broker    *eventBroker
}

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

	api := &app{db: db, jwtSecret: []byte(secret), logger: logger, broker: newBroker()}
	mux := http.NewServeMux()
	api.routes(mux)

	port := env("API_PORT", "4000")
	server := &http.Server{
		Addr:            ":" + port,
		Handler:         api.log(api.cors(mux)),
		ReadTimeout:     10 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:     60 * time.Second,
		// WriteTimeout is intentionally omitted: SSE connections are long-lived
		// and a server-level write timeout cannot be cleared reliably from a
		// handler. Per-handler write deadlines are managed via ResponseController.
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
	mux.HandleFunc("GET /projects/{id}/events", a.projectEvents)
	mux.Handle("PATCH /tasks/{id}", a.auth(http.HandlerFunc(a.updateTask)))
	mux.Handle("DELETE /tasks/{id}", a.auth(http.HandlerFunc(a.deleteTask)))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"name": "TaskFlow API", "status": "ok"})
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}
