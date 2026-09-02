import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  BOT_DIFFICULTY_LABELS,
  GAME_CATALOG,
  isGameId,
  type BotDifficultyId,
  type Seat,
} from '@mini-arcade/shared';
import { GameBoard } from '@/components/games/GameBoard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { LocalMatch, type LocalOpponent, type LocalResult, type LocalSnapshot } from '@/lib/local-match';
import { soloStats, type SoloRecord } from '@/lib/solo-stats';
import { sound } from '@/lib/sound';

const SEAT_LABEL: Record<Seat, string> = { 0: 'Player one', 1: 'Player two' };

export function SoloPage() {
  const params = useParams<{ gameId: string }>();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const gameId = isGameId(params.gameId) ? params.gameId : null;

  const [opponent, setOpponent] = useState<LocalOpponent>(search.get('vs') === 'human' ? 'human' : 'bot');
  const [difficulty, setDifficulty] = useState<BotDifficultyId>(
    (search.get('level') as BotDifficultyId | null) ?? 'sharp',
  );
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [record, setRecord] = useState<SoloRecord | null>(null);

  const matchRef = useRef<LocalMatch | null>(null);

  useEffect(() => {
    if (!gameId) navigate('/', { replace: true });
  }, [gameId, navigate]);

  useEffect(() => {
    if (gameId) setRecord(soloStats.read()[gameId]);
  }, [gameId]);

  const stop = useCallback(() => {
    matchRef.current?.destroy();
    matchRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const begin = useCallback(() => {
    if (!gameId) return;
    stop();
    setResult(null);
    sound.play('notify');

    const match = new LocalMatch({
      gameId,
      opponent,
      difficulty,
      playerSeat: 0,
      onState: setSnapshot,
      onOver: (outcome) => {
        const won = outcome.outcome.winnerSeat === outcome.seat;
        const draw = outcome.outcome.winnerSeat === null;
        sound.play(draw ? 'draw' : won ? 'win' : 'lose');
        if (opponent === 'bot') {
          setRecord(soloStats.record(gameId, draw ? 'draw' : won ? 'win' : 'loss')[gameId]);
        }
        setResult(outcome);
      },
    });

    matchRef.current = match;
    match.start();
  }, [gameId, opponent, difficulty, stop]);

  const realtime = gameId ? GAME_CATALOG[gameId].tickRate > 0 : false;

  const play = useCallback(
    (action: unknown) => {
      const match = matchRef.current;
      if (!match) return;
      // Realtime input is continuous, so it stays silent; discrete moves click.
      if (realtime) {
        match.input(action);
        return;
      }
      if (match.play(action)) sound.play('place');
    },
    [realtime],
  );

  const game = gameId ? GAME_CATALOG[gameId] : null;
  const running = Boolean(snapshot) && !result;

  const controls = useMemo(() => {
    if (!snapshot) return null;
    if (opponent === 'human') return SEAT_LABEL[(snapshot.activeSeat ?? 0) as Seat];
    return snapshot.thinking ? 'Bot is thinking…' : 'Your move';
  }, [snapshot, opponent]);

  if (!gameId || !game) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardLabel>solo · offline ready</CardLabel>
          <h1 className="mt-1 text-3xl font-bold">{game.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Runs entirely in your browser — no server, no rating, works with the wifi off.
          </p>
        </div>
        <Link to={`/play/${gameId}`}>
          <Button variant="outline" size="sm">
            Play online instead
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="relative p-6 sm:p-8">
          {running && snapshot ? (
            <GameBoard
              gameId={gameId}
              state={snapshot.state}
              seat={snapshot.seat}
              yourTurn={snapshot.controlledSeat !== null}
              onAction={play}
            />
          ) : (
            <div className="grid place-items-center py-16 text-center">
              <div>
                <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-white/10 text-3xl">
                  🎮
                </div>
                <h2 className="mt-5 text-xl font-bold">
                  {result ? describeResult(result) : 'Ready when you are'}
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
                  {result
                    ? `${result.moves} moves in ${Math.round(result.durationMs / 1000)}s.`
                    : 'Pick an opponent on the right and hit start.'}
                </p>
                <Button className="mt-6" onClick={begin}>
                  {result ? 'Play again' : 'Start match'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <aside className="space-y-4">
          <Card className="space-y-4 p-4">
            <CardLabel>Opponent</CardLabel>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'bot', label: 'vs Computer' },
                  { id: 'human', label: 'Pass & play' },
                ] as { id: LocalOpponent; label: string }[]
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setOpponent(entry.id);
                    setSearch({ vs: entry.id, level: difficulty }, { replace: true });
                  }}
                  className={clsx(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                    opponent === entry.id
                      ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                      : 'border-white/8 text-slate-400 hover:border-white/20 hover:text-white',
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {opponent === 'bot' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(BOT_DIFFICULTY_LABELS) as BotDifficultyId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setDifficulty(id);
                        setSearch({ vs: opponent, level: id }, { replace: true });
                      }}
                      className={clsx(
                        'rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors',
                        difficulty === id
                          ? 'border-neon-violet/40 bg-neon-violet/10 text-neon-violet'
                          : 'border-white/8 text-slate-400 hover:border-white/20 hover:text-white',
                      )}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-slate-500">{BOT_DIFFICULTY_LABELS[difficulty]}</p>
              </>
            )}

            <Button className="w-full" onClick={begin}>
              {running ? 'Restart' : 'Start match'}
            </Button>
            {running && <p className="text-center text-xs text-slate-500">{controls}</p>}
          </Card>

          {record && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <CardLabel>Your offline record</CardLabel>
                <Badge tone="violet">local</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat label="Played" value={record.played} accent="#22d3ee" />
                <Stat label="Won" value={record.wins} accent="#a3e635" />
                <Stat label="Streak" value={record.streak} accent="#fbbf24" />
                <Stat label="Best" value={record.bestStreak} accent="#a855f7" />
              </div>
            </Card>
          )}

          <Card className="p-4">
            <CardLabel>How to play</CardLabel>
            <ol className="mt-3 space-y-2 text-sm text-slate-400">
              {game.howTo.map((line, index) => (
                <li key={line} className="flex gap-2.5">
                  <span className="font-mono text-xs text-neon-cyan">{index + 1}</span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function describeResult(result: LocalResult): string {
  if (result.outcome.winnerSeat === null) return 'Draw';
  return result.outcome.winnerSeat === result.seat ? 'You win! 🎉' : 'You lost';
}
