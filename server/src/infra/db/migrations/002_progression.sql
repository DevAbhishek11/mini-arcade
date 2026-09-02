-- Progression: xp, levels, streaks, achievements and daily quests.
-- Hot fields are columns (indexable), the evolving shape lives in JSONB so the
-- game designer can add quests/achievements without a schema migration.
CREATE TABLE IF NOT EXISTS player_progress (
  player_id  UUID PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  xp         INTEGER     NOT NULL DEFAULT 0,
  level      INTEGER     NOT NULL DEFAULT 1,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_progress_xp_idx ON player_progress (xp DESC);

-- Match provenance: ranked queue, private room or practice
ALTER TABLE matches ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ranked';
