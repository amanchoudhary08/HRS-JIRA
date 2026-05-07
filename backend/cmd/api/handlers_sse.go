package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func (a *app) verifyToken(tokenStr string) (authUser, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return a.jwtSecret, nil
	})
	if err != nil || !tok.Valid {
		return authUser{}, fmt.Errorf("invalid token")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return authUser{}, fmt.Errorf("invalid claims")
	}
	id, _ := claims["user_id"].(string)
	email, _ := claims["email"].(string)
	if !validUUID(id) || email == "" {
		return authUser{}, fmt.Errorf("invalid claims")
	}
	var u authUser
	if err := a.db.QueryRowContext(context.Background(), `SELECT id, name, email FROM users WHERE id = $1 AND email = $2`, id, email).Scan(&u.ID, &u.Name, &u.Email); err != nil {
		return authUser{}, fmt.Errorf("user not found")
	}
	return u, nil
}

func (a *app) projectEvents(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	u, err := a.verifyToken(tokenStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	projectID := r.PathValue("id")
	if !a.canAccessProject(r.Context(), projectID, u.ID) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	ch := a.broker.subscribe(projectID)
	defer a.broker.unsubscribe(projectID, ch)

	// Send the initial connected comment and flush immediately so the browser
	// EventSource fires onopen. If this first flush fails the client is already
	// gone, so return early rather than sitting in the select loop.
	fmt.Fprintf(w, ": connected\n\n")
	if err := rc.Flush(); err != nil {
		return
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case ev := <-ch:
			b, err := json.Marshal(ev.Data)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, b)
			if err := rc.Flush(); err != nil {
				return
			}
		case <-ticker.C:
			fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
			if err := rc.Flush(); err != nil {
				return
			}
		case <-r.Context().Done():
			return
		}
	}
}
