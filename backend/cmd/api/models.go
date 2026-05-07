package main

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

type sseEvent struct {
	Type string
	Data any
}
