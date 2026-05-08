CREATE TABLE activity_events (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES users(id),
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_project_id ON activity_events(project_id);
CREATE INDEX idx_activity_task_id    ON activity_events(task_id);
