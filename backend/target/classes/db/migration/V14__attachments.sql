CREATE TABLE attachments (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by uuid        NOT NULL REFERENCES users(id),
  filename    text        NOT NULL,
  mime_type   text        NOT NULL,
  size_bytes  bigint      NOT NULL,
  storage_key text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_task_id ON attachments(task_id);
