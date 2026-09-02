import jwt from 'jsonwebtoken';
import { avatarFor, type PlayerPublic } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { NICKNAME_PATTERN, randomNickname, sanitizeNickname } from '../utils/nickname.js';
import { describePasswordProblem, hashPassword, verifyPassword } from '../utils/password.js';
import { getStorage } from './storage/index.js';
import { toPublicPlayer } from './storage.js';
import { playerService } from './player-service.js';

export interface TokenPayload {
  sub: string;
  nickname: string;
  guest: boolean;
}

export interface RegisterInput {
  nickname: string;
  email: string;
  password: string;
}

export interface LoginInput {
  /** Email or nickname — players remember one or the other. */
  identifier: string;
  password: string;
}

export interface AuthResult {
  token: string;
  expiresIn: number;
  player: PlayerPublic;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

function assertNickname(raw: string): string {
  const nickname = sanitizeNickname(raw);
  if (!NICKNAME_PATTERN.test(nickname)) {
    throw AppError.badRequest('Nickname must be 3-18 characters: letters, digits, _ . or -');
  }
  return nickname;
}

function assertEmail(raw: string): string {
  const email = raw.trim();
  if (!EMAIL_PATTERN.test(email) || email.length > 254)
    throw AppError.badRequest('Enter a valid email address');
  return email;
}

function assertPassword(password: string): void {
  const problem = describePasswordProblem(password);
  if (problem) throw AppError.badRequest(problem);
}

/** Turns a driver level unique violation into the same conflict the checks raise. */
async function createAccountSafely<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EMAIL_TAKEN')
      throw AppError.conflict('EMAIL_TAKEN', 'An account with that email already exists');
    if (code === 'NICKNAME_TAKEN') throw AppError.conflict('NICKNAME_TAKEN', 'That nickname is already taken');
    throw error;
  }
}

export const authService = {
  sign(player: { id: string; nickname: string; isGuest?: boolean }): string {
    const payload: TokenPayload = {
      sub: player.id,
      nickname: player.nickname,
      guest: player.isGuest ?? true,
    };
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_TTL_SECONDS,
      issuer: config.SERVICE_NAME,
    });
  },

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET, { issuer: config.SERVICE_NAME });
      if (typeof decoded === 'string' || !decoded.sub) throw new Error('malformed token');
      return {
        sub: String(decoded.sub),
        nickname: String((decoded as TokenPayload).nickname ?? ''),
        guest: Boolean((decoded as TokenPayload).guest ?? true),
      };
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

  /** Registration. The nickname doubles as the display name and a login id. */
  async register(input: RegisterInput): Promise<AuthResult> {
    const nickname = assertNickname(input.nickname);
    const email = assertEmail(input.email);
    assertPassword(input.password);

    const storage = getStorage();
    if (await storage.findPlayerByNickname(nickname)) {
      throw AppError.conflict('NICKNAME_TAKEN', 'That nickname is already taken');
    }
    if (await storage.findPlayerByEmail(email)) {
      throw AppError.conflict('EMAIL_TAKEN', 'An account with that email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const record = await createAccountSafely(() =>
      storage.createAccount({ nickname, avatar: avatarFor(nickname), email, passwordHash }),
    );
    return { token: this.sign(record), expiresIn: config.JWT_TTL_SECONDS, player: toPublicPlayer(record) };
  },

  /**
   * Login by email or nickname. Both failure paths cost the same work and
   * return the same message, so the endpoint cannot be used to enumerate
   * accounts.
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const storage = getStorage();
    const identifier = input.identifier.trim();
    const record = identifier.includes('@')
      ? await storage.findPlayerByEmail(identifier)
      : await storage.findPlayerByNickname(sanitizeNickname(identifier));

    const ok = await verifyPassword(input.password, record?.passwordHash ?? null);
    if (!record || record.isGuest || !ok) {
      throw AppError.unauthorized('Incorrect email/nickname or password');
    }

    await playerService.invalidate(record.id);
    return { token: this.sign(record), expiresIn: config.JWT_TTL_SECONDS, player: toPublicPlayer(record) };
  },

  /** Keeps the guest's id, rating, history and progression — just adds credentials. */
  async upgradeGuest(playerId: string, input: RegisterInput): Promise<AuthResult> {
    const nickname = assertNickname(input.nickname);
    const email = assertEmail(input.email);
    assertPassword(input.password);

    const storage = getStorage();
    const current = await storage.findPlayerById(playerId);
    if (!current) throw AppError.notFound('Player not found');
    if (!current.isGuest) throw AppError.conflict('ALREADY_REGISTERED', 'This session already has an account');

    const nicknameOwner = await storage.findPlayerByNickname(nickname);
    if (nicknameOwner && nicknameOwner.id !== playerId) {
      throw AppError.conflict('NICKNAME_TAKEN', 'That nickname is already taken');
    }
    if (await storage.findPlayerByEmail(email)) {
      throw AppError.conflict('EMAIL_TAKEN', 'An account with that email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const record = await createAccountSafely(() =>
      storage.upgradeGuest(playerId, { nickname, email, passwordHash }),
    );
    if (!record) throw AppError.conflict('ALREADY_REGISTERED', 'This session already has an account');

    await playerService.invalidate(playerId);
    return { token: this.sign(record), expiresIn: config.JWT_TTL_SECONDS, player: toPublicPlayer(record) };
  },

  async resolve(token: string): Promise<PlayerPublic> {
    const payload = this.verify(token);
    const player = await playerService.getById(payload.sub);
    if (!player) throw AppError.unauthorized('Session no longer exists');
    return player;
  },
};
