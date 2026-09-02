import { beforeAll, describe, expect, it } from 'vitest';
import type { RoomMember } from '@mini-arcade/shared';

import type { roomManager as RoomManager } from '../src/realtime/room-manager.js';

let roomManager: typeof RoomManager;

const member = (id: string): Omit<RoomMember, 'isHost' | 'ready'> => ({
  playerId: id,
  nickname: id,
  avatar: 'a1',
  rating: 1200,
  level: 1,
});

beforeAll(async () => {
  ({ roomManager } = await import('../src/realtime/room-manager.js'));
});

describe('room manager', () => {
  it('creates a room with an unambiguous code and a ready host', async () => {
    const room = await roomManager.create('gomoku', member('host'));
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(room.members).toHaveLength(1);
    expect(room.members[0]?.isHost).toBe(true);
    expect(room.members[0]?.ready).toBe(true);
    expect(room.status).toBe('lobby');
  });

  it('is case insensitive on lookup', async () => {
    const room = await roomManager.create('reversi', member('host2'));
    expect(await roomManager.get(room.code.toLowerCase())).toBeTruthy();
  });

  it('accepts a second player and rejects a third', async () => {
    const room = await roomManager.create('pong', member('host3'));
    const joined = await roomManager.join(room.code, member('guest'));
    expect(joined.members).toHaveLength(2);
    expect(joined.members[1]?.ready).toBe(false);

    await expect(roomManager.join(room.code, member('gatecrasher'))).rejects.toThrow('ROOM_FULL');
  });

  it('is idempotent when the same player rejoins', async () => {
    const room = await roomManager.create('pong', member('host4'));
    await roomManager.join(room.code, member('guest'));
    const again = await roomManager.join(room.code, member('guest'));
    expect(again.members).toHaveLength(2);
  });

  it('rejects joins for unknown codes and rooms already playing', async () => {
    await expect(roomManager.join('ZZZZZ', member('nobody'))).rejects.toThrow('ROOM_NOT_FOUND');

    const room = await roomManager.create('snake-duel', member('host5'));
    await roomManager.markPlaying(room.code, true);
    await expect(roomManager.join(room.code, member('late'))).rejects.toThrow('ROOM_IN_PROGRESS');
  });

  it('tracks readiness per member', async () => {
    const room = await roomManager.create('tic-tac-toe', member('host6'));
    await roomManager.join(room.code, member('guest'));
    const updated = await roomManager.setReady(room.code, 'guest', true);
    expect(updated.members.every((entry) => entry.ready)).toBe(true);
  });

  it('promotes the remaining player when the host leaves', async () => {
    const room = await roomManager.create('dots-and-boxes', member('host7'));
    await roomManager.join(room.code, member('guest'));

    const after = await roomManager.leave(room.code, 'host7');
    expect(after).not.toBeNull();
    expect(after?.hostId).toBe('guest');
    expect(after?.members[0]?.isHost).toBe(true);
  });

  it('destroys the room when the last player leaves', async () => {
    const room = await roomManager.create('gomoku', member('host8'));
    expect(await roomManager.leave(room.code, 'host8')).toBeNull();
    expect(await roomManager.get(room.code)).toBeNull();
  });

  it('resets readiness when a match returns to the lobby', async () => {
    const room = await roomManager.create('reversi', member('host9'));
    await roomManager.join(room.code, member('guest'));
    await roomManager.setReady(room.code, 'guest', true);
    await roomManager.markPlaying(room.code, true);

    const back = await roomManager.markPlaying(room.code, false);
    expect(back?.status).toBe('lobby');
    expect(back?.members.find((entry) => entry.playerId === 'guest')?.ready).toBe(false);
    expect(back?.members.find((entry) => entry.isHost)?.ready).toBe(true);
  });

  it('closes a room explicitly', async () => {
    const room = await roomManager.create('pong', member('host10'));
    await roomManager.close(room.code);
    expect(await roomManager.get(room.code)).toBeNull();
  });
});
