CREATE TABLE labels (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE task_labels (
  task_id  uuid NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE INDEX idx_labels_project_id ON labels(project_id);
CREATE INDEX idx_task_labels_task_id  ON task_labels(task_id);
CREATE INDEX idx_task_labels_label_id ON task_labels(label_id);
