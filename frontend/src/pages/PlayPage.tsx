import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  GAME_CATALOG,
  isGameId,
  type ConnectFourState,
  type MatchSnapshot,
  type PaddleDirection,
  type PongState,
  type Seat,
  type TicTacToeState,
} from '@mini-arcade/shared';
import { ConnectFourBoard } from '@/components/games/ConnectFourBoard';
import { PongCanvas } from '@/components/games/PongCanvas';
import { TicTacToeBoard } from '@/components/games/TicTacToeBoard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { useArcade } from '@/store/arcade';
import { useSession } from '@/store/session';

function useCountdown(deadline: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return remaining;
}

function PlayerCard({
  slot,
  isYou,
  active,
}: {
  slot: MatchSnapshot['players'][number];
  isYou: boolean;
  active: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-300',
        active ? 'border-neon-cyan/40 bg-neon-cyan/5' : 'border-white/5 bg-void-900/60',
      )}
    >
      <Avatar nickname={slot.nickname} avatar={slot.avatar} ring={active} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{slot.nickname}</span>
          {isYou && <Badge tone="cyan">you</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-slate-500">
          <span>{slot.rating} elo</span>
          <span className={clsx('size-1.5 rounded-full', slot.connected ? 'bg-neon-lime' : 'bg-rose-500')} />
          <span>{slot.connected ? 'connected' : 'reconnecting…'}</span>
        </div>
      </div>
    </div>
  );
}

function QueuePanel({ gameId }: { gameId: keyof typeof GAME_CATALOG }) {
  const { phase, queue, queuedSince, joinQueue, leaveQueue, stats } = useArcade();
  const [elapsed, setElapsed] = useState(0);
  const game = GAME_CATALOG[gameId];

  useEffect(() => {
    if (phase !== 'queued' || !queuedSince) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - queuedSince) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [phase, queuedSince]);

  if (phase === 'queued') {
    return (
      <Card className="mx-auto max-w-lg text-center" glow={game.accent}>
        <div className="mx-auto grid size-20 place-items-center rounded-full border border-white/10 animate-[pulse-ring_2.4s_cubic-bezier(0.4,0,0.6,1)_infinite]">
          <span className="font-display text-2xl font-bold tabular-nums">{elapsed}s</span>
        </div>
        <h2 className="mt-6 text-2xl font-bold">Finding an opponent…</h2>
        <p className="mt-2 text-sm text-slate-400">
          Matching by rating — the window widens the longer you wait. A bot steps in if the arcade is quiet.
        </p>
        <div className="mt-5 flex items-center justify-center gap-4 font-mono text-xs text-slate-500">
          <span>queue position {queue?.position ?? 1}</span>
          <span>·</span>
          <span>{queue?.size ?? 1} waiting</span>
        </div>
        <Button variant="outline" className="mt-6" onClick={() => void leaveQueue()}>
          Cancel
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg text-center" glow={game.accent}>
      <CardLabel>{game.mode === 'realtime' ? `${game.tickRate} Hz simulation` : 'turn based'}</CardLabel>
      <h2 className="mt-2 text-3xl font-bold">{game.name}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{game.description}</p>
      <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-500">
        <Badge tone="violet">{game.players} players</Badge>
        {game.turnTimeoutMs > 0 && <Badge tone="amber">{game.turnTimeoutMs / 1000}s per move</Badge>}
        <Badge tone="lime">{stats?.queued?.[gameId] ?? 0} queued</Badge>
      </div>
      <Button size="lg" className="mt-7 w-full" onClick={() => void joinQueue(gameId)}>
        Find a match
      </Button>
    </Card>
  );
}

function ResultOverlay() {
  const { result, snapshot, dismissResult } = useArcade();
  const player = useSession((s) => s.player);
  const navigate = useNavigate();
  if (!result) return null;

  const mySeat = snapshot?.seat ?? 0;
  const won = result.winnerSeat === mySeat;
  const draw = result.winnerSeat === null;
  const delta = player ? (result.ratingDelta[player.id] ?? 0) : 0;

  const headline = draw ? 'Draw' : won ? 'Victory' : 'Defeat';
  const tone = draw ? 'text-neon-amber' : won ? 'text-neon-lime' : 'text-rose-400';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-void-950/80 p-4 backdrop-blur-md">
      <Card className="w-full max-w-md animate-[pop_0.32s_cubic-bezier(0.34,1.56,0.64,1)_both] text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          match over · {result.reason}
        </p>
        <h2 className={clsx('mt-3 font-display text-5xl font-bold neon-text', tone)}>{headline}</h2>
        <p className="mt-4 font-mono text-lg tabular-nums">
          <span className={delta >= 0 ? 'text-neon-lime' : 'text-rose-400'}>
            {delta >= 0 ? '+' : ''}
            {delta} elo
          </span>
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              dismissResult();
              navigate('/');
            }}
          >
            Back to arcade
          </Button>
          <Button className="flex-1" onClick={dismissResult}>
            Play again
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ChatPanel() {
  const { chat, sendChat } = useArcade();
  const player = useSession((s) => s.player);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  return (
    <Card className="flex h-72 flex-col p-4">
      <CardLabel>Table talk</CardLabel>
      <div ref={listRef} className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {chat.length === 0 && (
          <p className="text-xs text-slate-600">Say hello — messages stay in this match.</p>
        )}
        {chat.map((message) => (
          <div
            key={message.id}
            className={clsx(
              'max-w-[85%] rounded-lg px-2.5 py-1.5',
              message.playerId === player?.id
                ? 'ml-auto bg-neon-cyan/10 text-neon-cyan'
                : 'bg-white/5 text-slate-300',
            )}
          >
            <span className="mr-1.5 text-[0.65rem] uppercase tracking-wide opacity-60">{message.nickname}</span>
            {message.body}
          </div>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendChat(draft);
          setDraft('');
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={200}
          placeholder="gg…"
          className="h-9 flex-1 rounded-lg border border-white/8 bg-void-950/60 px-3 text-sm outline-none transition-colors placeholder:text-slate-600 focus:border-neon-cyan/50"
        />
        <Button type="submit" size="sm" variant="subtle" disabled={!draft.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}

export function PlayPage() {
  const params = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { phase, snapshot, sendAction, forfeit, notice, clearNotice } = useArcade();
  const player = useSession((s) => s.player);
  const gameId = isGameId(params.gameId) ? params.gameId : null;
  const remaining = useCountdown(snapshot?.turnDeadline ?? null);

  useEffect(() => {
    if (!gameId) navigate('/', { replace: true });
  }, [gameId, navigate]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 3_500);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);

  const seat = (snapshot?.seat ?? 0) as Seat;
  const yourTurn = snapshot?.activeSeat === seat;
  const game = gameId ? GAME_CATALOG[gameId] : null;

  const board = useMemo(() => {
    if (!snapshot || !gameId) return null;
    switch (gameId) {
      case 'tic-tac-toe':
        return (
          <TicTacToeBoard
            state={snapshot.state as TicTacToeState}
            seat={seat}
            yourTurn={yourTurn}
            onPlay={(index) => void sendAction({ type: 'place', index })}
          />
        );
      case 'connect-four':
        return (
          <ConnectFourBoard
            state={snapshot.state as ConnectFourState}
            seat={seat}
            yourTurn={yourTurn}
            onPlay={(column) => void sendAction({ type: 'drop', column })}
          />
        );
      case 'pong':
        return (
          <PongCanvas
            state={snapshot.state as PongState}
            seat={seat}
            onInput={(dir: PaddleDirection) => void sendAction({ type: 'move', dir })}
          />
        );
      default:
        return null;
    }
  }, [snapshot, gameId, seat, yourTurn, sendAction]);

  if (!gameId || !game) return null;

  const inMatch = phase === 'playing' || phase === 'over';

  return (
    <div className="space-y-6">
      {notice && (
        <div className="mx-auto max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-200">
          {notice.message}
        </div>
      )}

      {!inMatch && <QueuePanel gameId={gameId} />}

      {inMatch && snapshot && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardLabel>now playing</CardLabel>
                <h1 className="mt-1 text-2xl font-bold">{game.name}</h1>
              </div>
              {game.turnTimeoutMs > 0 && remaining !== null && (
                <div className="text-right">
                  <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">
                    {yourTurn ? 'your move' : 'their move'}
                  </div>
                  <div
                    className={clsx(
                      'font-display text-3xl font-bold tabular-nums',
                      remaining < 6_000 ? 'text-rose-400' : 'text-white',
                    )}
                  >
                    {Math.ceil(remaining / 1000)}s
                  </div>
                </div>
              )}
            </div>

            <Card className="p-6 sm:p-8">{board}</Card>
          </div>

          <aside className="space-y-4">
            <Card className="space-y-3 p-4">
              <CardLabel>Table</CardLabel>
              {snapshot.players.map((slot) => (
                <PlayerCard
                  key={slot.playerId}
                  slot={slot}
                  isYou={slot.playerId === player?.id}
                  active={snapshot.activeSeat === slot.seat}
                />
              ))}
              <Button variant="danger" size="sm" className="w-full" onClick={() => void forfeit()}>
                Forfeit match
              </Button>
            </Card>
            <ChatPanel />
          </aside>
        </div>
      )}

      <ResultOverlay />
    </div>
  );
}
