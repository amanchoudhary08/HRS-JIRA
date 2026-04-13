-- +goose Up
INSERT INTO users (id, name, email, password, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Test User',
  'test@example.com',
  '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq',
  now()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, name, email, password, created_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Alex Reviewer',
  'alex@example.com',
  '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq',
  now()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO projects (id, name, description, owner_id, created_at)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Website Redesign',
  'Seed project for reviewing TaskFlow',
  '11111111-1111-1111-1111-111111111111',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, created_by, due_date, created_at, updated_at)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'Design homepage', 'Create first pass of the landing page layout.', 'in_progress', 'high', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', current_date + interval '5 days', now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'Write API contract', 'Document the endpoints the frontend uses.', 'todo', 'medium', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', current_date + interval '8 days', now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'Prepare review notes', 'Capture tradeoffs for the walkthrough.', 'done', 'low', '33333333-3333-3333-3333-333333333333', NULL, '11111111-1111-1111-1111-111111111111', NULL, now(), now())
ON CONFLICT (id) DO NOTHING;

-- +goose Down
DELETE FROM tasks WHERE id IN (
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);
DELETE FROM projects WHERE id = '33333333-3333-3333-3333-333333333333';
DELETE FROM users WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
