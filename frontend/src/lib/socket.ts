import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@mini-arcade/shared';
import { tokenStore } from './api';

export type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ArcadeSocket | null = null;

/**
 * One shared socket for the whole app. Reconnection, exponential backoff and
 * auth refresh are handled here so components only deal with events.
 */
export function getSocket(): ArcadeSocket {
  if (socket) return socket;

  socket = io({
    path: SOCKET_PATH,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: tokenStore.get() ?? '' }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 6_000,
    timeout: 10_000,
    autoConnect: false,
  }) as ArcadeSocket;

  return socket;
}

export function connectSocket(): ArcadeSocket {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Promise wrapper around socket.io acknowledgements. */
export function emitWithAck<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<{ ok: boolean; code?: string; message?: string }> {
  return new Promise((resolve) => {
    const instance = getSocket();
    const timer = window.setTimeout(() => resolve({ ok: false, code: 'TIMEOUT' }), 6_000);
    // @ts-expect-error — socket.io's variadic ack typing
    instance.emit(event, payload, (result) => {
      window.clearTimeout(timer);
      resolve(result ?? { ok: true });
    });
  });
}
