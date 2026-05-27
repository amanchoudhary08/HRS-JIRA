CREATE TABLE ai_suggestions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type         VARCHAR(50) NOT NULL,
    content      JSONB NOT NULL DEFAULT '{}',
    accepted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_suggestions_task ON ai_suggestions(task_id);
