import clsx from 'clsx';
import { GOMOKU_SIZE, type GomokuState, type Seat } from '@mini-arcade/shared';

const STAR_POINTS = new Set([3 * 15 + 3, 3 * 15 + 11, 7 * 15 + 7, 11 * 15 + 3, 11 * 15 + 11]);

/**
 * 15x15 five-in-a-row. Rendered as a single CSS grid of intersections so it
 * stays crisp at any size and needs no canvas.
 */
export function GomokuBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: GomokuState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (index: number) => void;
}) {
  const winning = new Set(state.winningLine ?? []);

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div
        className="grid gap-[2px] rounded-xl bg-void-950/60 p-2"
        style={{ gridTemplateColumns: `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))` }}
      >
        {state.board.map((cell, index) => {
          const empty = cell === null;
          return (
            <button
              key={index}
              type="button"
              disabled={!empty || !yourTurn}
              onClick={() => onPlay(index)}
              aria-label={`intersection ${index}`}
              className={clsx(
                'group relative grid aspect-square place-items-center rounded-[3px] transition-colors duration-150',
                'bg-void-800/50',
                empty && yourTurn && 'cursor-pointer hover:bg-neon-cyan/20',
                STAR_POINTS.has(index) && empty && 'bg-void-700/70',
                index === state.lastIndex && 'ring-1 ring-neon-amber/70',
                winning.has(index) && 'bg-neon-lime/25',
              )}
            >
              {cell !== null && (
                <span
                  className={clsx(
                    'block size-[78%] animate-pop rounded-full',
                    index === state.lastIndex && 'animate-drop-in',
                    winning.has(index) && 'animate-win-flash',
                    cell === 0
                      ? 'bg-gradient-to-br from-slate-100 to-slate-400'
                      : 'bg-gradient-to-br from-void-600 to-void-900 ring-1 ring-white/20',
                    winning.has(index) && 'ring-2 ring-neon-lime',
                  )}
                />
              )}
              {empty && yourTurn && (
                <span
                  className={clsx(
                    'block size-[70%] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-40',
                    seat === 0 ? 'bg-slate-200' : 'bg-void-600',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center font-mono text-xs text-slate-500">
        {state.moves} stones placed · you are {seat === 0 ? 'white' : 'black'}
      </p>
    </div>
  );
}
