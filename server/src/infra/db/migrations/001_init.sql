-- Mini Arcade schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname      TEXT        NOT NULL,
  nickname_key  TEXT        NOT NULL UNIQUE,
  avatar        TEXT        NOT NULL DEFAULT 'aurora',
  rating        INTEGER     NOT NULL DEFAULT 1200,
  wins          INTEGER     NOT NULL DEFAULT 0,
  losses        INTEGER     NOT NULL DEFAULT 0,
  draws         INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_rating_idx ON players (rating DESC, wins DESC);
CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS player_game_stats (
  player_id  UUID    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  game_id    TEXT    NOT NULL,
  rating     INTEGER NOT NULL DEFAULT 1200,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, game_id)
);

CREATE INDEX IF NOT EXISTS player_game_stats_leaderboard_idx
  ON player_game_stats (game_id, rating DESC, wins DESC);

CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY,
  game_id     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  winner_id   UUID        REFERENCES players (id) ON DELETE SET NULL,
  reason      TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matches_created_idx ON matches (created_at DESC);
CREATE INDEX IF NOT EXISTS matches_game_idx ON matches (game_id, created_at DESC);

CREATE TABLE IF NOT EXISTS match_players (
  match_id      UUID    NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id     UUID    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  seat          SMALLINT NOT NULL,
  result        TEXT,
  rating_before INTEGER NOT NULL DEFAULT 1200,
  rating_after  INTEGER NOT NULL DEFAULT 1200,
  PRIMARY KEY (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_players_player_idx ON match_players (player_id);
