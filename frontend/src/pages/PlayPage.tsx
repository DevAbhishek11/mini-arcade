import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  BOT_DIFFICULTY_LABELS,
  EMOTES,
  GAME_CATALOG,
  isGameId,
  type BotDifficultyId,
  type Emote,
  type MatchSnapshot,
  type Seat,
} from '@mini-arcade/shared';
import { GameBoard } from '@/components/games/GameBoard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { sound } from '@/lib/sound';
import { useArcade } from '@/store/arcade';
import { useProgression } from '@/store/progression';
import { useSession } from '@/store/session';
import { toast } from '@/store/toast';

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

/* ------------------------------ pre-match UI ------------------------------ */

type Tab = 'ranked' | 'practice' | 'room';

function HowToPlay({ gameId }: { gameId: keyof typeof GAME_CATALOG }) {
  const [open, setOpen] = useState(false);
  const game = GAME_CATALOG[gameId];

  return (
    <div className="rounded-xl border border-white/5 bg-void-950/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-300 hover:text-white"
      >
        How to play {game.name}
        <span className={clsx('transition-transform duration-200', open && 'rotate-180')}>⌄</span>
      </button>
      {open && (
        <ol className="space-y-2 border-t border-white/5 px-4 py-3 text-sm text-slate-400">
          {game.howTo.map((line, index) => (
            <li key={line} className="flex gap-2.5">
              <span className="font-mono text-xs text-neon-cyan">{index + 1}</span>
              <span className="leading-relaxed">{line}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RoomLobby({ onLeave }: { onLeave: () => void }) {
  const { room, setReady, startRoomMatch, leaveRoom } = useArcade();
  const player = useSession((s) => s.player);
  const [copied, setCopied] = useState(false);
  if (!room) return null;

  const me = room.members.find((member) => member.playerId === player?.id);
  const isHost = room.hostId === player?.id;
  const everyoneReady = room.members.length === 2 && room.members.every((member) => member.ready);

  const copy = async () => {
    const url = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Invite link copied', 'Send it to a friend to start the match.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(`Room code: ${room.code}`, 'Copy it manually and share.');
    }
  };

  return (
    <Card className="mx-auto max-w-lg text-center" glow={GAME_CATALOG[room.gameId].accent}>
      <CardLabel>Private room</CardLabel>
      <div className="mt-3 font-display text-5xl font-bold tracking-[0.35em] text-neon-cyan neon-text">
        {room.code}
      </div>
      <p className="mt-3 text-sm text-slate-400">
        Share the code — the match starts when both players are ready.
      </p>

      <div className="mt-6 space-y-2 text-left">
        {room.members.map((member) => (
          <div
            key={member.playerId}
            className={clsx(
              'flex items-center gap-3 rounded-xl border px-3.5 py-2.5',
              member.ready ? 'border-neon-lime/30 bg-neon-lime/5' : 'border-white/5 bg-void-900/60',
            )}
          >
            <Avatar nickname={member.nickname} avatar={member.avatar} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-white">{member.nickname}</span>
                {member.isHost && <Badge tone="violet">host</Badge>}
                {member.playerId === player?.id && <Badge tone="cyan">you</Badge>}
              </div>
              <span className="font-mono text-[0.7rem] text-slate-500">
                lvl {member.level} · {member.rating} elo
              </span>
            </div>
            <span className={clsx('text-xs font-semibold', member.ready ? 'text-neon-lime' : 'text-slate-500')}>
              {member.ready ? 'ready' : 'waiting'}
            </span>
          </div>
        ))}
        {room.members.length < 2 && (
          <div className="rounded-xl border border-dashed border-white/10 px-3.5 py-4 text-center text-sm text-slate-500">
            Waiting for an opponent…
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={() => void copy()}>
          {copied ? 'Copied ✓' : 'Copy invite'}
        </Button>
        <Button variant={me?.ready ? 'subtle' : 'primary'} onClick={() => void setReady(!me?.ready)}>
          {me?.ready ? 'Not ready' : "I'm ready"}
        </Button>
      </div>

      {isHost && (
        <Button className="mt-2 w-full" disabled={!everyoneReady} onClick={() => void startRoomMatch()}>
          {everyoneReady ? 'Start match' : 'Waiting for both players'}
        </Button>
      )}

      <button
        type="button"
        className="mt-4 text-xs text-slate-500 hover:text-rose-300"
        onClick={() => {
          void leaveRoom();
          onLeave();
        }}
      >
        Leave room
      </button>
    </Card>
  );
}

function PreMatchPanel({ gameId }: { gameId: keyof typeof GAME_CATALOG }) {
  const { phase, queue, queuedSince, joinQueue, leaveQueue, startPractice, createRoom, stats } = useArcade();
  const [tab, setTab] = useState<Tab>('ranked');
  const [difficulty, setDifficulty] = useState<BotDifficultyId>('sharp');
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
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
    <Card className="mx-auto max-w-lg" glow={game.accent}>
      <div className="text-center">
        <CardLabel>{game.mode === 'realtime' ? `${game.tickRate} Hz simulation` : 'turn based'}</CardLabel>
        <h2 className="mt-2 text-3xl font-bold">{game.name}</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{game.description}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Badge tone="violet">{game.players} players</Badge>
          {game.turnTimeoutMs > 0 && <Badge tone="amber">{game.turnTimeoutMs / 1000}s per move</Badge>}
          <Badge tone="lime">{stats?.queued?.[gameId] ?? 0} queued</Badge>
          <Badge>~{game.averageMinutes} min</Badge>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-1 rounded-xl border border-white/5 bg-void-950/60 p-1">
        {(
          [
            { id: 'ranked', label: 'Quick match' },
            { id: 'practice', label: 'Practice' },
            { id: 'room', label: 'Friend' },
          ] as { id: Tab; label: string }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              sound.play('click');
              setTab(entry.id);
            }}
            className={clsx(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === entry.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'ranked' && (
          <>
            <p className="text-sm text-slate-400">
              Rated match against a real player of similar Elo. Full XP, full glory.
            </p>
            <Button size="lg" className="mt-4 w-full" onClick={() => void joinQueue(gameId)}>
              Find a match
            </Button>
          </>
        )}

        {tab === 'practice' && (
          <>
            <p className="text-sm text-slate-400">
              Unrated match against the house bot. Earns 40% XP and still counts toward quests.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(Object.keys(BOT_DIFFICULTY_LABELS) as BotDifficultyId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDifficulty(id)}
                  className={clsx(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors',
                    difficulty === id
                      ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                      : 'border-white/8 text-slate-400 hover:border-white/20 hover:text-white',
                  )}
                >
                  {id}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">{BOT_DIFFICULTY_LABELS[difficulty]}</p>
            <Button
              size="lg"
              className="mt-4 w-full"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await startPractice(gameId, difficulty);
                setBusy(false);
              }}
            >
              Start practice
            </Button>
          </>
        )}

        {tab === 'room' && (
          <>
            <p className="text-sm text-slate-400">
              Create a private room and share the 5-character code. No rating, no strangers.
            </p>
            <Button
              size="lg"
              className="mt-4 w-full"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await createRoom(gameId);
                setBusy(false);
              }}
            >
              Create room
            </Button>
          </>
        )}
      </div>

      <div className="mt-5">
        <HowToPlay gameId={gameId} />
      </div>
    </Card>
  );
}

/* -------------------------------- in match -------------------------------- */

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

function EmoteBar() {
  const sendEmote = useArcade((s) => s.sendEmote);
  return (
    <div className="flex flex-wrap gap-1.5">
      {EMOTES.map((emote) => (
        <button
          key={emote}
          type="button"
          onClick={() => void sendEmote(emote as Emote)}
          className="grid size-9 place-items-center rounded-lg border border-white/8 bg-void-900/60 text-base transition-transform hover:scale-110 hover:border-white/20 active:scale-95"
        >
          {emote}
        </button>
      ))}
    </div>
  );
}

function EmoteLayer() {
  const emotes = useArcade((s) => s.emotes);
  const seat = useArcade((s) => s.snapshot?.seat ?? 0);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {emotes.map((entry) => (
        <span
          key={entry.key}
          className="absolute animate-[slide-up_2.4s_ease-out_both] text-4xl"
          style={{
            left: `${entry.seat === seat ? 18 : 68}%`,
            bottom: '8%',
            opacity: 0.95,
          }}
        >
          {entry.emote}
        </span>
      ))}
    </div>
  );
}

function ResultOverlay() {
  const { result, snapshot, dismissResult, requestRematch, rematchRequested, rematchOffer } = useArcade();
  const player = useSession((s) => s.player);
  const navigate = useNavigate();
  if (!result) return null;

  const mySeat = snapshot?.seat ?? 0;
  const won = result.winnerSeat === mySeat;
  const draw = result.winnerSeat === null;
  const delta = player ? (result.ratingDelta[player.id] ?? 0) : 0;
  const progress = result.progress;

  const headline = draw ? 'Draw' : won ? 'Victory' : 'Defeat';
  const tone = draw ? 'text-neon-amber' : won ? 'text-neon-lime' : 'text-rose-400';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-void-950/80 p-4 backdrop-blur-md">
      <Card className="w-full max-w-md animate-[pop_0.32s_cubic-bezier(0.34,1.56,0.64,1)_both] text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          match over · {result.reason}
        </p>
        <h2 className={clsx('mt-3 font-display text-5xl font-bold neon-text', tone)}>{headline}</h2>

        <div className="mt-4 flex items-center justify-center gap-6 font-mono text-lg tabular-nums">
          <span className={delta >= 0 ? 'text-neon-lime' : 'text-rose-400'}>
            {delta >= 0 ? '+' : ''}
            {delta} elo
          </span>
          {progress && <span className="text-neon-violet">+{progress.xpGained} xp</span>}
        </div>

        {progress && (
          <div className="mt-4 space-y-1.5 rounded-xl border border-white/5 bg-void-950/50 p-3 text-left text-xs text-slate-400">
            <Row
              label="Level"
              value={
                progress.leveledUp
                  ? `${progress.levelBefore} → ${progress.levelAfter} 🎉`
                  : `${progress.levelAfter}`
              }
            />
            <Row
              label="Daily streak"
              value={`${progress.dailyStreak} day${progress.dailyStreak === 1 ? '' : 's'}`}
            />
            <Row label="Win streak" value={`${progress.winStreak}`} />
            {progress.unlocked.length > 0 && (
              <Row
                label="Unlocked"
                value={progress.unlocked.map((entry) => `${entry.icon} ${entry.name}`).join(', ')}
              />
            )}
            {progress.questsCompleted.length > 0 && (
              <Row label="Quests" value={progress.questsCompleted.map((quest) => quest.name).join(', ')} />
            )}
          </div>
        )}

        {rematchOffer && (
          <p className="mt-4 text-sm text-neon-cyan">{rematchOffer.fromNickname} wants a rematch!</p>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => {
              dismissResult();
              navigate('/');
            }}
          >
            Back to arcade
          </Button>
          {result.rematchAvailable ? (
            <Button loading={rematchRequested && !rematchOffer} onClick={() => void requestRematch()}>
              {rematchOffer ? 'Accept rematch' : 'Rematch'}
            </Button>
          ) : (
            <Button onClick={dismissResult}>Play again</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="truncate text-right text-slate-200">{value}</span>
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

/* ---------------------------------- page ---------------------------------- */

export function PlayPage() {
  const params = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { phase, snapshot, room, sendAction, forfeit } = useArcade();
  const player = useSession((s) => s.player);
  const reloadProgress = useProgression((s) => s.load);
  const gameId = isGameId(params.gameId) ? params.gameId : null;
  const remaining = useCountdown(snapshot?.turnDeadline ?? null);

  useEffect(() => {
    if (!gameId) navigate('/', { replace: true });
  }, [gameId, navigate]);

  useEffect(() => {
    if (phase === 'over') void reloadProgress();
  }, [phase, reloadProgress]);

  const seat = (snapshot?.seat ?? 0) as Seat;
  const yourTurn = snapshot?.activeSeat === seat;
  const game = gameId ? GAME_CATALOG[gameId] : null;

  const board = useMemo(() => {
    if (!snapshot || !gameId) return null;
    return (
      <GameBoard
        gameId={gameId}
        state={snapshot.state}
        seat={seat}
        yourTurn={yourTurn}
        onAction={(action) => void sendAction(action)}
      />
    );
  }, [snapshot, gameId, seat, yourTurn, sendAction]);

  if (!gameId || !game) return null;

  const inMatch = (phase === 'playing' || phase === 'over') && Boolean(snapshot);

  return (
    <div className="space-y-6">
      {!inMatch && room && <RoomLobby onLeave={() => navigate('/')} />}
      {!inMatch && !room && <PreMatchPanel gameId={gameId} />}

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

            <Card className="relative p-6 sm:p-8">
              {board}
              <EmoteLayer />
            </Card>
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
              <EmoteBar />
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
