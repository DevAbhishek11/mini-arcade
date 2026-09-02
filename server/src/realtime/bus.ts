import { EventEmitter } from 'node:events';
import { config } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createRedisConnection, getRedis } from '../infra/redis.js';

const log = createLogger('bus');
const CHANNEL = `${config.REDIS_KEY_PREFIX}bus`;

export interface BusMessage<T = unknown> {
  topic: string;
  origin: string;
  payload: T;
}

export type BusHandler<T = unknown> = (payload: T, message: BusMessage<T>) => void;

/**
 * Cross-worker message bus.
 *
 * With Redis it spans every worker and every container; without Redis it is a
 * plain in-process emitter (single worker deployments stay fully functional).
 * Messages published by a node are also delivered locally, so the API is the
 * same regardless of the backend.
 */
class MessageBus {
  readonly nodeId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly local = new EventEmitter({ captureRejections: true });
  private readonly subscriber = createRedisConnection('bus-sub');
  private wired = false;

  constructor() {
    this.local.setMaxListeners(0);
    this.wire();
  }

  get distributed(): boolean {
    return Boolean(this.subscriber);
  }

  private wire(): void {
    if (this.wired || !this.subscriber) return;
    this.wired = true;
    this.subscriber.subscribe(CHANNEL).catch((error: Error) => {
      log.warn({ err: error.message }, 'bus subscribe failed');
    });
    this.subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const message = JSON.parse(raw) as BusMessage;
        if (message.origin === this.nodeId) return; // already delivered locally
        this.local.emit(message.topic, message.payload, message);
      } catch (error) {
        log.debug({ err: (error as Error).message }, 'bad bus payload');
      }
    });
  }

  on<T>(topic: string, handler: BusHandler<T>): () => void {
    this.local.on(topic, handler as BusHandler);
    return () => this.local.off(topic, handler as BusHandler);
  }

  once<T>(topic: string, handler: BusHandler<T>): void {
    this.local.once(topic, handler as BusHandler);
  }

  async publish<T>(topic: string, payload: T): Promise<void> {
    const message: BusMessage<T> = { topic, origin: this.nodeId, payload };
    this.local.emit(topic, payload, message);

    const redis = getRedis();
    if (!redis) return;
    try {
      await redis.publish(CHANNEL, JSON.stringify(message));
    } catch (error) {
      log.debug({ topic, err: (error as Error).message }, 'bus publish failed');
    }
  }
}

export const bus = new MessageBus();

export const topics = {
  player: (playerId: string) => `player:${playerId}`,
  match: (matchId: string) => `match:${matchId}`,
  stats: 'stats:changed',
};
