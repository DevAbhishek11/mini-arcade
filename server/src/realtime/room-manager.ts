import type { GameId, RoomInfo, RoomMember } from '@mini-arcade/shared';
import { createLogger } from '../infra/logger.js';
import { getRedis } from '../infra/redis.js';
import { createSafeInterval } from '../utils/time.js';
import { bus } from './bus.js';

const log = createLogger('rooms');

const ROOM_TTL_MS = 30 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable characters
const CODE_LENGTH = 5;
const MAX_ROOMS_PER_NODE = 500;

export interface RoomRecord extends RoomInfo {
  /** Bus node that owns the room, so remote joins can be routed. */
  hostNodeId: string;
  updatedAt: number;
}

export type RoomError =
  'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_IN_PROGRESS' | 'NOT_HOST' | 'NOT_READY' | 'ROOM_LIMIT';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

const key = (code: string) => `room:${code}`;

/**
 * Private rooms with a shareable 5 character code.
 *
 * State lives in Redis when available (so any container can serve a join) and
 * falls back to a per-node map otherwise. Rooms self expire, are capped per
 * node, and are removed as soon as the last member leaves.
 */
class RoomManager {
  private readonly local = new Map<string, RoomRecord>();

  constructor() {
    createSafeInterval(() => this.sweep(), 60_000);
  }

  private async read(code: string): Promise<RoomRecord | null> {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get(key(code)).catch(() => null);
      if (raw) {
        try {
          return JSON.parse(raw) as RoomRecord;
        } catch {
          return null;
        }
      }
      return null;
    }
    return this.local.get(code) ?? null;
  }

  private async write(room: RoomRecord): Promise<void> {
    room.updatedAt = Date.now();
    const redis = getRedis();
    if (redis) {
      await redis.set(key(room.code), JSON.stringify(room), 'PX', ROOM_TTL_MS).catch(() => undefined);
      return;
    }
    this.local.set(room.code, room);
  }

  private async drop(code: string): Promise<void> {
    const redis = getRedis();
    if (redis) await redis.del(key(code)).catch(() => undefined);
    this.local.delete(code);
  }

  async get(code: string): Promise<RoomRecord | null> {
    return this.read(code.toUpperCase());
  }

  async create(gameId: GameId, host: Omit<RoomMember, 'isHost' | 'ready'>): Promise<RoomRecord> {
    if (this.local.size >= MAX_ROOMS_PER_NODE) throw new Error('ROOM_LIMIT' satisfies RoomError);

    let code = generateCode();
    for (let attempt = 0; attempt < 5 && (await this.read(code)); attempt += 1) code = generateCode();

    const room: RoomRecord = {
      code,
      gameId,
      hostId: host.playerId,
      hostNodeId: bus.nodeId,
      members: [{ ...host, isHost: true, ready: true }],
      spectators: 0,
      status: 'lobby',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.write(room);
    this.local.set(code, room);
    log.info({ code, gameId, host: host.nickname }, 'room created');
    return room;
  }

  async join(code: string, member: Omit<RoomMember, 'isHost' | 'ready'>): Promise<RoomRecord> {
    const room = await this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND' satisfies RoomError);
    if (room.status === 'playing') throw new Error('ROOM_IN_PROGRESS' satisfies RoomError);

    const existing = room.members.find((entry) => entry.playerId === member.playerId);
    if (!existing) {
      if (room.members.length >= 2) throw new Error('ROOM_FULL' satisfies RoomError);
      room.members = [...room.members, { ...member, isHost: false, ready: false }];
    }
    await this.write(room);
    return room;
  }

  async setReady(code: string, playerId: string, ready: boolean): Promise<RoomRecord> {
    const room = await this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND' satisfies RoomError);
    room.members = room.members.map((member) => (member.playerId === playerId ? { ...member, ready } : member));
    await this.write(room);
    return room;
  }

  async leave(code: string, playerId: string): Promise<RoomRecord | null> {
    const room = await this.get(code);
    if (!room) return null;

    room.members = room.members.filter((member) => member.playerId !== playerId);
    if (room.members.length === 0) {
      await this.drop(room.code);
      return null;
    }
    // Promote whoever is left so a room never becomes unusable.
    if (room.hostId === playerId) {
      const next = room.members[0] as RoomMember;
      room.hostId = next.playerId;
      room.members = room.members.map((member) => ({ ...member, isHost: member.playerId === next.playerId }));
    }
    await this.write(room);
    return room;
  }

  async markPlaying(code: string, playing: boolean): Promise<RoomRecord | null> {
    const room = await this.get(code);
    if (!room) return null;
    room.status = playing ? 'playing' : 'lobby';
    if (!playing) room.members = room.members.map((member) => ({ ...member, ready: member.isHost }));
    await this.write(room);
    return room;
  }

  async close(code: string): Promise<void> {
    await this.drop(code.toUpperCase());
  }

  private sweep(): void {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.local) {
      if (room.updatedAt < cutoff) {
        this.local.delete(code);
        log.debug({ code }, 'room expired');
      }
    }
  }

  get size(): number {
    return this.local.size;
  }
}

export const roomManager = new RoomManager();
