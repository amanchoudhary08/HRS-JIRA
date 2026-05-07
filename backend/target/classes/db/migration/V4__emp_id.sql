-- Add emp_id column to users
ALTER TABLE users ADD COLUMN emp_id VARCHAR(20) UNIQUE;

-- Set emp_ids for existing seed users
UPDATE users SET emp_id = 'test'  WHERE email = 'test@example.com';
UPDATE users SET emp_id = 'are01' WHERE email = 'alex@example.com';
UPDATE users SET emp_id = 'psh51' WHERE email = 'prashant.sharma@hrs.com';

-- Add new users
INSERT INTO users (id, name, email, emp_id, password, created_at)
VALUES (uuid_generate_v4(), 'Aman Choudhary',   'aman.choudhary@hrs.com',    'ach51', '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq', now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, name, email, emp_id, password, created_at)
VALUES (uuid_generate_v4(), 'Gaganajeet Singh', 'gaganajeet.singh@hrs.com',  'gsi50', '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq', now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, name, email, emp_id, password, created_at)
VALUES (uuid_generate_v4(), 'Umang Yadav',      'umang.yadav@hrs.com',       'uya01', '$2a$12$oxYhrNDEyyzb9kHqt169ruuzbTiuddkfAJrco3/8hXMn.qs54kitq', now())
ON CONFLICT (email) DO NOTHING;
