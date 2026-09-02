import jwt from 'jsonwebtoken';
import { avatarFor, type PlayerPublic } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { NICKNAME_PATTERN, randomNickname, sanitizeNickname } from '../utils/nickname.js';
import { getStorage } from './storage/index.js';
import { toPublicPlayer } from './storage.js';
import { playerService } from './player-service.js';

export interface TokenPayload {
  sub: string;
  nickname: string;
}

export interface AuthResult {
  token: string;
  expiresIn: number;
  player: PlayerPublic;
}

export const authService = {
  sign(player: { id: string; nickname: string }): string {
    return jwt.sign({ sub: player.id, nickname: player.nickname } satisfies TokenPayload, config.JWT_SECRET, {
      expiresIn: config.JWT_TTL_SECONDS,
      issuer: config.SERVICE_NAME,
    });
  },

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET, { issuer: config.SERVICE_NAME });
      if (typeof decoded === 'string' || !decoded.sub) throw new Error('malformed token');
      return { sub: String(decoded.sub), nickname: String((decoded as TokenPayload).nickname ?? '') };
    } catch {
      throw AppError.unauthorized('Invalid or expired session token');
    }
  },

  /** Guest sign-up: no passwords, a signed token is the identity. */
  async createGuest(requestedNickname?: string): Promise<AuthResult> {
    const storage = getStorage();
    let nickname = requestedNickname ? sanitizeNickname(requestedNickname) : randomNickname();

    if (requestedNickname && !NICKNAME_PATTERN.test(nickname)) {
      throw AppError.badRequest('Nickname must be 3-18 characters: letters, digits, _ . or -');
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await storage.findPlayerByNickname(nickname);
      if (!existing) break;
      if (requestedNickname) throw AppError.conflict('NICKNAME_TAKEN', 'That nickname is already taken');
      nickname = randomNickname();
    }

    const record = await storage.createGuest(nickname, avatarFor(nickname));
    const player = toPublicPlayer(record);
    return { token: this.sign(record), expiresIn: config.JWT_TTL_SECONDS, player };
  },

  async resolve(token: string): Promise<PlayerPublic> {
    const payload = this.verify(token);
    const player = await playerService.getById(payload.sub);
    if (!player) throw AppError.unauthorized('Session no longer exists');
    return player;
  },
};
