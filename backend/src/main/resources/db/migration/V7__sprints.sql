CREATE TABLE sprints (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  goal       text,
  start_date date,
  end_date   date,
  status     text NOT NULL DEFAULT 'planning',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks
  ADD COLUMN sprint_id uuid REFERENCES sprints(id) ON DELETE SET NULL,
  ADD COLUMN position  integer NOT NULL DEFAULT 0;

CREATE INDEX idx_sprints_project_id ON sprints(project_id);
CREATE INDEX idx_tasks_sprint_id    ON tasks(sprint_id);
