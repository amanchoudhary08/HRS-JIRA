CREATE TABLE project_members (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'member',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id    ON project_members(user_id);

-- Seed existing project owners as members with role 'owner'
INSERT INTO project_members (project_id, user_id, role)
  SELECT id, owner_id, 'owner' FROM projects;
