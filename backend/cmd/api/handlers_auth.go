package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

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

func (a *app) issueToken(u authUser) (string, error) {
	claims := jwt.MapClaims{
		"user_id": u.ID,
		"email":   u.Email,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.jwtSecret)
}
