import clsx from 'clsx';
import { HEX_SIZE, type HexState, type Seat } from '@mini-arcade/shared';

/** Flat-top hexagon path in a 100x100 viewBox-ish unit cell. */
const HEX_POINTS = '25,0 75,0 100,50 75,100 25,100 0,50';

const CELL_W = 100;
const CELL_H = 100;
/** Horizontal shift per row, giving the rhombus its lean. */
const ROW_SHIFT = 50;
const GAP = 6;

/**
 * Hex on an 11x11 rhombus, drawn as SVG so the tessellation stays exact at any
 * size. Blue (seat 0) connects top to bottom, pink (seat 1) left to right —
 * the coloured borders show which edges belong to whom.
 */
export function HexBoard({
  state,
  seat,
  yourTurn,
  onPlay,
  onSwap,
}: {
  state: HexState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (index: number) => void;
  onSwap: () => void;
}) {
  const winning = new Set(state.winningPath ?? []);

  const width = HEX_SIZE * (CELL_W + GAP) + (HEX_SIZE - 1) * ROW_SHIFT;
  const height = HEX_SIZE * (CELL_H * 0.78 + GAP);

  return (
    <div className="mx-auto w-full max-w-[40rem]">
      <svg
        viewBox={`-20 -20 ${width + 40} ${height + 40}`}
        className="w-full select-none"
        role="group"
        aria-label="hex board"
      >
        {/* Edge markers: top/bottom belong to seat 0, left/right to seat 1. */}
        <rect x={-16} y={-16} width={width + 32} height={10} fill="#22d3ee" opacity={0.5} rx={5} />
        <rect x={-16} y={height + 6} width={width + 32} height={10} fill="#22d3ee" opacity={0.5} rx={5} />

        {state.board.map((cell, index) => {
          const row = Math.floor(index / HEX_SIZE);
          const col = index % HEX_SIZE;
          const x = col * (CELL_W + GAP) + row * ROW_SHIFT;
          const y = row * (CELL_H * 0.78 + GAP);
          const playable = yourTurn && cell === null && state.winnerSeat === null;

          return (
            <g key={index} transform={`translate(${x} ${y})`}>
              <polygon
                points={HEX_POINTS}
                className={clsx(
                  'transition-all duration-150',
                  playable && 'cursor-pointer',
                  winning.has(index) && 'drop-shadow-[0_0_6px_rgba(163,230,53,0.9)]',
                )}
                fill={
                  cell === 0
                    ? 'url(#hexCyan)'
                    : cell === 1
                      ? 'url(#hexPink)'
                      : playable
                        ? 'rgba(148,163,184,0.14)'
                        : 'rgba(148,163,184,0.08)'
                }
                stroke={
                  winning.has(index)
                    ? '#a3e635'
                    : index === state.lastIndex
                      ? '#fbbf24'
                      : 'rgba(255,255,255,0.14)'
                }
                strokeWidth={winning.has(index) || index === state.lastIndex ? 5 : 2}
                onClick={() => playable && onPlay(index)}
              />
              {playable ? (
                <polygon
                  points={HEX_POINTS}
                  fill="transparent"
                  className="cursor-pointer transition hover:fill-[rgba(34,211,238,0.28)]"
                  onClick={() => onPlay(index)}
                />
              ) : null}
            </g>
          );
        })}

        <defs>
          <linearGradient id="hexCyan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <linearGradient id="hexPink" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f9a8d4" />
            <stop offset="100%" stopColor="#be185d" />
          </linearGradient>
        </defs>
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
        <span>
          You are{' '}
          <span className={seat === 0 ? 'text-neon-cyan' : 'text-neon-pink'}>
            {seat === 0 ? 'blue' : 'pink'}
          </span>{' '}
          — connect {seat === 0 ? 'top to bottom' : 'left to right'}.
        </span>

        {state.swapAvailable && seat === 1 && yourTurn ? (
          <button
            type="button"
            onClick={onSwap}
            className="rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-3 py-1.5 font-semibold text-neon-amber transition hover:bg-neon-amber/20"
          >
            Swap — steal that opening stone
          </button>
        ) : null}
      </div>
    </div>
  );
}
