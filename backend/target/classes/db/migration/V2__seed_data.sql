INSERT INTO users (id, name, email, password, created_at)
VALUES (
  uuid_generate_v4(),
  'Test User',
  'test@example.com',
  '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq',
  now()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, name, email, password, created_at)
VALUES (
  uuid_generate_v4(),
  'Alex Reviewer',
  'alex@example.com',
  '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq',
  now()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, name, email, password, created_at)
VALUES (
  uuid_generate_v4(),
  'Prashant Sharma',
  'prashant.sharma@hrs.com',
  '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq',
  now()
)
ON CONFLICT (email) DO NOTHING;
