import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CHECKERS_SIZE, checkersLegalMoves, type CheckersState, type Seat } from '@mini-arcade/shared';

/**
 * Click a piece, then a destination. Legal destinations light up, captures are
 * marked, and the board flips so the local player is always at the bottom.
 */
export function CheckersBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: CheckersState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (from: number, to: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const legal = useMemo(() => (yourTurn ? checkersLegalMoves(state) : []), [state, yourTurn]);

  // Mid multi-jump the engine forces one piece — select it automatically.
  useEffect(() => {
    if (state.chainFrom !== null) setSelected(state.chainFrom);
  }, [state.chainFrom]);

  // Never leave a stale selection behind after the board changes.
  useEffect(() => {
    if (selected !== null && !legal.some((move) => move.from === selected)) setSelected(null);
  }, [legal, selected]);

  const movesFrom = legal.filter((move) => move.from === selected);
  const targets = new Map(movesFrom.map((move) => [move.to, move]));
  const sources = new Set(legal.map((move) => move.from));
  const mustCapture = legal.some((move) => move.captured.length > 0);

  // Seat 1 sits at the top of the underlying board, so mirror it for them.
  const order = Array.from({ length: CHECKERS_SIZE * CHECKERS_SIZE }, (_, i) =>
    seat === 0 ? i : CHECKERS_SIZE * CHECKERS_SIZE - 1 - i,
  );

  const handle = (index: number) => {
    if (!yourTurn) return;
    const target = targets.get(index);
    if (target) {
      onPlay(target.from, target.to);
      setSelected(null);
      return;
    }
    if (sources.has(index)) setSelected(index);
  };

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <div className="grid grid-cols-8 overflow-hidden rounded-xl border border-white/10">
        {order.map((index) => {
          const row = Math.floor(index / CHECKERS_SIZE);
          const col = index % CHECKERS_SIZE;
          const dark = (row + col) % 2 === 1;
          const piece = state.board[index];
          const isTarget = targets.has(index);
          const captureHere = state.lastMove?.captured.includes(index) ?? false;

          return (
            <button
              key={index}
              type="button"
              disabled={!yourTurn || (!isTarget && !sources.has(index))}
              onClick={() => handle(index)}
              aria-label={`square ${index}`}
              className={clsx(
                'relative grid aspect-square place-items-center transition-colors duration-150',
                dark ? 'bg-void-800' : 'bg-void-700/40',
                index === selected && 'bg-neon-cyan/30',
                index === state.lastMove?.from && 'bg-neon-amber/10',
                index === state.lastMove?.to && 'bg-neon-amber/20',
                captureHere && 'bg-neon-pink/20',
              )}
            >
              {piece ? (
                <span
                  className={clsx(
                    'grid size-[74%] place-items-center rounded-full shadow-lg transition-transform duration-150',
                    piece.seat === 0
                      ? 'bg-gradient-to-br from-slate-100 to-slate-400 text-void-900'
                      : 'bg-gradient-to-br from-neon-pink to-rose-700 text-white',
                    index === selected && 'scale-110 ring-2 ring-neon-cyan',
                    index === state.lastMove?.to && 'animate-drop-in',
                    piece.seat === seat && sources.has(index) && yourTurn && 'ring-1 ring-white/40',
                  )}
                >
                  {piece.king ? <span className="text-xs font-bold">♔</span> : null}
                </span>
              ) : null}

              {/* Where a piece was taken, leave a fading burst. */}
              {captureHere ? (
                <span className="pointer-events-none absolute size-[70%] animate-capture rounded-full bg-neon-pink/70" />
              ) : null}

              {isTarget ? (
                <span
                  className={clsx(
                    'absolute size-4 rounded-full',
                    (targets.get(index)?.captured.length ?? 0) > 0
                      ? 'bg-neon-pink/80 ring-2 ring-neon-pink'
                      : 'bg-neon-cyan/60',
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        {state.chainFrom !== null
          ? 'Keep jumping — the chain is not over.'
          : mustCapture && yourTurn
            ? 'A capture is available, so you must take it.'
            : yourTurn
              ? 'Tap a piece, then a highlighted square.'
              : 'Waiting for your opponent…'}
      </p>
    </div>
  );
}
