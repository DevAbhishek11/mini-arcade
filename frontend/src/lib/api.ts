import type {
  AchievementDef,
  ApiError,
  ArcadeStats,
  GameCatalogEntry,
  HealthReport,
  LeaderboardEntry,
  Paginated,
  PlayerProgress,
  PlayerPublic,
  QuestDef,
  QuestProgress,
} from '@mini-arcade/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'mini-arcade.token';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, timeoutMs = 12_000, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const token = auth ? tokenStore.get() : null;

  try {
    const response = await fetch(`${BASE_URL}/api${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 204) return undefined as T;

    const payload = (await response.json().catch(() => null)) as T | ApiError | null;

    if (!response.ok) {
      const error = (payload as ApiError | null)?.error;
      if (response.status === 401) tokenStore.clear();
      throw new ApiRequestError(
        response.status,
        error?.code ?? 'UNKNOWN',
        error?.message ?? response.statusText,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ApiRequestError(408, 'TIMEOUT', 'The server took too long to respond');
    }
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the arcade server');
  } finally {
    window.clearTimeout(timer);
  }
}

export interface MatchHistoryItem {
  matchId: string;
  gameId: string;
  result: 'win' | 'loss' | 'draw';
  ratingDelta: number;
  opponentNickname: string | null;
  endedAt: string | null;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
  player: PlayerPublic;
}

export interface RegisterInput {
  nickname: string;
  email: string;
  password: string;
}

export const api = {
  createGuest: (nickname?: string) =>
    request<AuthResponse>('/auth/guest', {
      method: 'POST',
      auth: false,
      body: nickname ? { nickname } : {},
    }),
  register: (input: RegisterInput) =>
    request<AuthResponse>('/auth/register', { method: 'POST', auth: false, body: input }),
  login: (identifier: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', auth: false, body: { identifier, password } }),
  /** Adds credentials to the signed-in guest, keeping its id and progress. */
  upgradeAccount: (input: RegisterInput) =>
    request<AuthResponse>('/auth/upgrade', { method: 'POST', body: input }),
  me: () => request<{ player: PlayerPublic }>('/auth/me'),
  rename: (nickname: string) =>
    request<{ player: PlayerPublic }>('/players/me', { method: 'PATCH', body: { nickname } }),
  player: (id: string) => request<{ player: PlayerPublic }>(`/players/${id}`, { auth: false }),
  playerMatches: (id: string, limit = 10) =>
    request<Paginated<MatchHistoryItem>>(`/players/${id}/matches?limit=${limit}`, { auth: false }),
  games: () => request<{ items: GameCatalogEntry[] }>('/games', { auth: false }),
  leaderboard: (game: string, limit = 20, offset = 0) =>
    request<Paginated<LeaderboardEntry>>(`/leaderboard?game=${game}&limit=${limit}&offset=${offset}`, {
      auth: false,
    }),
  progress: () => request<{ progress: PlayerProgress }>('/progress/me'),
  progressOf: (id: string) => request<{ progress: PlayerProgress }>(`/progress/${id}`, { auth: false }),
  progressCatalog: () =>
    request<{ achievements: AchievementDef[]; quests: QuestDef[] }>('/progress/catalog', { auth: false }),
  questsToday: () =>
    request<{ day: string; definitions: QuestDef[]; progress: QuestProgress[] }>('/progress/quests/today'),
  stats: () => request<ArcadeStats>('/system/stats', { auth: false }),
  health: () => request<HealthReport>('/system', { auth: false }),
  runtime: () =>
    request<{
      workerId: number;
      pid: number;
      uptimeSeconds: number;
      memoryMb: { rss: number; heapUsed: number; heapTotal: number };
      hostedMatches: number;
      onlineLocal: number;
      cache: { l1Size: number; l1Max: number; redis: boolean };
      storage: string;
      cluster: { workers: number };
    }>('/system/runtime', { auth: false }),
};
