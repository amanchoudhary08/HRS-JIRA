-- Add full-text search vector to tasks (generated, stored, indexed)
ALTER TABLE tasks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX idx_tasks_search ON tasks USING GIN(search_vector);
