-- Registered accounts. Guests keep working exactly as before; an account is a
-- player row that additionally carries an email and a password hash, so
-- upgrading a guest preserves its rating, history and progression.
ALTER TABLE players ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS email_key     TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_guest      BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial unique index: many guests have no email, registered accounts are unique.
CREATE UNIQUE INDEX IF NOT EXISTS players_email_key_idx
  ON players (email_key)
  WHERE email_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS players_is_guest_idx ON players (is_guest) WHERE is_guest = FALSE;
