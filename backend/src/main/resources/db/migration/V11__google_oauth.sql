-- Add google_id column for OAuth2 sign-in via Google
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text UNIQUE;
