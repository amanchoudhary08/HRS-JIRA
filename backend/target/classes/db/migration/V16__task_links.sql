CREATE TYPE link_type AS ENUM ('blocks', 'is_blocked_by', 'relates_to', 'duplicates');

CREATE TABLE task_links (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id   uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_id   uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type   link_type   NOT NULL,
  created_by  uuid        NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id, link_type)
);
CREATE INDEX idx_task_links_source ON task_links(source_id);
CREATE INDEX idx_task_links_target ON task_links(target_id);
