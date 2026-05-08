ALTER TABLE tasks
  ADD COLUMN type      text NOT NULL DEFAULT 'task',
  ADD COLUMN parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
