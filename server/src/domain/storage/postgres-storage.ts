import { randomUUID } from 'node:crypto';
import type { GameId, LeaderboardEntry } from '@mini-arcade/shared';
import { config } from '../../config/env.js';
import { runMigrations } from '../../infra/db/migrate.js';
import { pingDatabase, query, transaction } from '../../infra/db/pool.js';
import { createLogger } from '../../infra/logger.js';
import { emailKey } from '../../utils/password.js';
import {
  nicknameKey,
  type AccountInput,
  type LeaderboardQuery,
  type MatchHistoryItem,
  type PlayerRecord,
  type Storage,
} from '../storage.js';

const log = createLogger('storage:postgres');

interface PlayerRow {
  id: string;
  nickname: string;
  avatar: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: Date;
  last_seen_at: Date;
  is_guest: boolean;
  email: string | null;
  password_hash: string | null;
}

const mapPlayer = (row: PlayerRow): PlayerRecord => ({
  id: row.id,
  nickname: row.nickname,
  avatar: row.avatar,
  rating: Number(row.rating),
  wins: Number(row.wins),
  losses: Number(row.losses),
  draws: Number(row.draws),
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  isGuest: row.is_guest ?? true,
  email: row.email ?? null,
  passwordHash: row.password_hash ?? null,
});

/** Postgres unique violation, mapped to a caller-friendly code. */
function mapUniqueViolation(error: unknown): never {
  if ((error as { code?: string }).code === '23505') {
    const detail = String((error as { constraint?: string }).constraint ?? '');
    const code = detail.includes('email') ? 'EMAIL_TAKEN' : 'NICKNAME_TAKEN';
    throw Object.assign(new Error(code.toLowerCase().replace('_', ' ')), { code });
  }
  throw error;
}

export class PostgresStorage implements Storage {
  readonly kind = 'postgres' as const;

  async init(): Promise<void> {
    if (config.DB_RUN_MIGRATIONS) await runMigrations();
    log.info('postgres storage ready');
  }

  async createGuest(nickname: string, avatar: string): Promise<PlayerRecord> {
    const id = randomUUID();
    const { rows } = await query<PlayerRow>(
      'players.insert',
      `INSERT INTO players (id, nickname, nickname_key, avatar)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, nickname, nicknameKey(nickname), avatar],
    );
    return mapPlayer(rows[0] as PlayerRow);
  }

  async createAccount(input: AccountInput): Promise<PlayerRecord> {
    const id = randomUUID();
    try {
      const { rows } = await query<PlayerRow>(
        'players.insertAccount',
        `INSERT INTO players (id, nickname, nickname_key, avatar, email, email_key, password_hash, is_guest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
         RETURNING *`,
        [
          id,
          input.nickname,
          nicknameKey(input.nickname),
          input.avatar,
          input.email,
          emailKey(input.email),
          input.passwordHash,
        ],
      );
      return mapPlayer(rows[0] as PlayerRow);
    } catch (error) {
      mapUniqueViolation(error);
    }
  }

  async upgradeGuest(id: string, input: Omit<AccountInput, 'avatar'>): Promise<PlayerRecord | null> {
    try {
      const { rows } = await query<PlayerRow>(
        'players.upgradeGuest',
        `UPDATE players
            SET nickname = $2, nickname_key = $3, email = $4, email_key = $5,
                password_hash = $6, is_guest = FALSE
          WHERE id = $1 AND is_guest = TRUE
          RETURNING *`,
        [
          id,
          input.nickname,
          nicknameKey(input.nickname),
          input.email,
          emailKey(input.email),
          input.passwordHash,
        ],
      );
      return rows[0] ? mapPlayer(rows[0]) : null;
    } catch (error) {
      mapUniqueViolation(error);
    }
  }

  async findPlayerByEmail(email: string): Promise<PlayerRecord | null> {
    const { rows } = await query<PlayerRow>('players.byEmail', 'SELECT * FROM players WHERE email_key = $1', [
      emailKey(email),
    ]);
    return rows[0] ? mapPlayer(rows[0]) : null;
  }

  async findPlayerById(id: string): Promise<PlayerRecord | null> {
    const { rows } = await query<PlayerRow>('players.byId', 'SELECT * FROM players WHERE id = $1', [id]);
    return rows[0] ? mapPlayer(rows[0]) : null;
  }

  async findPlayerByNickname(nickname: string): Promise<PlayerRecord | null> {
    const { rows } = await query<PlayerRow>(
      'players.byNickname',
      'SELECT * FROM players WHERE nickname_key = $1',
      [nicknameKey(nickname)],
    );
    return rows[0] ? mapPlayer(rows[0]) : null;
  }

  async touchPlayer(id: string): Promise<void> {
    await query('players.touch', 'UPDATE players SET last_seen_at = now() WHERE id = $1', [id]);
  }

  async renamePlayer(id: string, nickname: string): Promise<PlayerRecord | null> {
    try {
      const { rows } = await query<PlayerRow>(
        'players.rename',
        'UPDATE players SET nickname = $2, nickname_key = $3 WHERE id = $1 RETURNING *',
        [id, nickname, nicknameKey(nickname)],
      );
      return rows[0] ? mapPlayer(rows[0]) : null;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw Object.assign(new Error('nickname taken'), { code: 'NICKNAME_TAKEN' });
      }
      throw error;
    }
  }

  async createMatch(match: { id: string; gameId: GameId; playerIds: string[] }): Promise<void> {
    await transaction('matches.create', async (client) => {
      await client.query('INSERT INTO matches (id, game_id, status) VALUES ($1, $2, $3)', [
        match.id,
        match.gameId,
        'active',
      ]);
      for (const [seat, playerId] of match.playerIds.entries()) {
        await client.query(
          `INSERT INTO match_players (match_id, player_id, seat)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [match.id, playerId, seat],
        );
      }
    });
  }

  async finishMatch(input: Parameters<Storage['finishMatch']>[0]): Promise<void> {
    await transaction('matches.finish', async (client) => {
      await client.query(
        `UPDATE matches SET status = $2, winner_id = $3, reason = $4, ended_at = now() WHERE id = $1`,
        [input.matchId, input.aborted ? 'aborted' : 'finished', input.winnerId, input.reason],
      );

      if (input.aborted) return;

      for (const entry of input.results) {
        const delta = entry.ratingAfter - entry.ratingBefore;
        const win = entry.result === 'win' ? 1 : 0;
        const loss = entry.result === 'loss' ? 1 : 0;
        const draw = entry.result === 'draw' ? 1 : 0;

        await client.query(
          `UPDATE match_players
             SET result = $3, rating_before = $4, rating_after = $5
           WHERE match_id = $1 AND player_id = $2`,
          [input.matchId, entry.playerId, entry.result, entry.ratingBefore, entry.ratingAfter],
        );

        await client.query(
          `UPDATE players
             SET rating = $2, wins = wins + $3, losses = losses + $4, draws = draws + $5, last_seen_at = now()
           WHERE id = $1`,
          [entry.playerId, entry.ratingAfter, win, loss, draw],
        );

        await client.query(
          `INSERT INTO player_game_stats (player_id, game_id, rating, wins, losses, draws)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (player_id, game_id) DO UPDATE
             SET rating = player_game_stats.rating + $7,
                 wins = player_game_stats.wins + $4,
                 losses = player_game_stats.losses + $5,
                 draws = player_game_stats.draws + $6,
                 updated_at = now()`,
          [entry.playerId, input.gameId, entry.ratingAfter, win, loss, draw, delta],
        );
      }
    });
  }

  async leaderboard(q: LeaderboardQuery): Promise<{ items: LeaderboardEntry[]; total: number }> {
    if (q.gameId === 'all') {
      const { rows } = await query<{
        id: string;
        nickname: string;
        avatar: string;
        rating: number;
        wins: number;
        losses: number;
        draws: number;
        total: string;
      }>(
        'leaderboard.all',
        `SELECT id, nickname, avatar, rating, wins, losses, draws, COUNT(*) OVER() AS total
           FROM players
          ORDER BY rating DESC, wins DESC
          LIMIT $1 OFFSET $2`,
        [q.limit, q.offset],
      );
      return {
        items: rows.map((row, index) => ({
          rank: q.offset + index + 1,
          playerId: row.id,
          nickname: row.nickname,
          avatar: row.avatar,
          rating: Number(row.rating),
          wins: Number(row.wins),
          losses: Number(row.losses),
          draws: Number(row.draws),
          played: Number(row.wins) + Number(row.losses) + Number(row.draws),
        })),
        total: rows[0] ? Number(rows[0].total) : 0,
      };
    }

    const { rows } = await query<{
      id: string;
      nickname: string;
      avatar: string;
      rating: number;
      wins: number;
      losses: number;
      draws: number;
      total: string;
    }>(
      'leaderboard.game',
      `SELECT p.id, p.nickname, p.avatar, s.rating, s.wins, s.losses, s.draws, COUNT(*) OVER() AS total
         FROM player_game_stats s
         JOIN players p ON p.id = s.player_id
        WHERE s.game_id = $1 AND (s.wins + s.losses + s.draws) > 0
        ORDER BY s.rating DESC, s.wins DESC
        LIMIT $2 OFFSET $3`,
      [q.gameId, q.limit, q.offset],
    );

    return {
      items: rows.map((row, index) => ({
        rank: q.offset + index + 1,
        playerId: row.id,
        nickname: row.nickname,
        avatar: row.avatar,
        rating: Number(row.rating),
        wins: Number(row.wins),
        losses: Number(row.losses),
        draws: Number(row.draws),
        played: Number(row.wins) + Number(row.losses) + Number(row.draws),
      })),
      total: rows[0] ? Number(rows[0].total) : 0,
    };
  }

  async playerHistory(playerId: string, limit: number): Promise<MatchHistoryItem[]> {
    const { rows } = await query<{
      match_id: string;
      game_id: GameId;
      result: 'win' | 'loss' | 'draw' | null;
      rating_before: number;
      rating_after: number;
      opponent: string | null;
      ended_at: Date | null;
    }>(
      'matches.history',
      `SELECT mp.match_id,
              m.game_id,
              mp.result,
              mp.rating_before,
              mp.rating_after,
              opp.nickname AS opponent,
              m.ended_at
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
         LEFT JOIN match_players omp ON omp.match_id = mp.match_id AND omp.player_id <> mp.player_id
         LEFT JOIN players opp ON opp.id = omp.player_id
        WHERE mp.player_id = $1 AND m.status = 'finished'
        ORDER BY m.ended_at DESC NULLS LAST
        LIMIT $2`,
      [playerId, limit],
    );

    return rows.map((row) => ({
      matchId: row.match_id,
      gameId: row.game_id,
      result: row.result ?? 'draw',
      ratingDelta: Number(row.rating_after) - Number(row.rating_before),
      opponentNickname: row.opponent,
      endedAt: row.ended_at?.toISOString() ?? null,
    }));
  }

  async countMatchesSince(since: Date): Promise<number> {
    const { rows } = await query<{ count: string }>(
      'matches.countSince',
      'SELECT COUNT(*)::text AS count FROM matches WHERE created_at >= $1',
      [since],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countPlayers(): Promise<number> {
    const { rows } = await query<{ count: string }>(
      'players.count',
      'SELECT COUNT(*)::text AS count FROM players',
    );
    return Number(rows[0]?.count ?? 0);
  }

  async ping(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }> {
    return pingDatabase();
  }
}
