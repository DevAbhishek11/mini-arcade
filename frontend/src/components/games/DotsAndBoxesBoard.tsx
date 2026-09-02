import clsx from 'clsx';
import { BOXES, DOTS, H_EDGES, type DotsState, type Seat } from '@mini-arcade/shared';

const CELL = 60;
const PAD = 16;
const SIZE = BOXES * CELL + PAD * 2;

const SEAT_COLOR: Record<Seat, string> = { 0: '#22d3ee', 1: '#f472b6' };

/** Dots & Boxes as one crisp SVG — every edge is a clickable hit target. */
export function DotsAndBoxesBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: DotsState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (edge: number) => void;
}) {
  const claimed = new Set(state.claimed);

  const horizontals = Array.from({ length: DOTS * BOXES }, (_, i) => ({
    edge: i,
    row: Math.floor(i / BOXES),
    column: i % BOXES,
  }));
  const verticals = Array.from({ length: BOXES * DOTS }, (_, i) => ({
    edge: H_EDGES + i,
    row: Math.floor(i / DOTS),
    column: i % DOTS,
  }));

  const renderEdge = (edge: number, x1: number, y1: number, x2: number, y2: number) => {
    const drawn = state.edges[edge] === true;
    const isLast = state.lastEdge === edge;
    const interactive = !drawn && yourTurn;
    return (
      <g
        key={edge}
        className={clsx(interactive && 'cursor-pointer')}
        onClick={interactive ? () => onPlay(edge) : undefined}
      >
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={drawn ? (isLast ? '#fbbf24' : '#e2e8f0') : 'transparent'}
          strokeWidth={drawn ? 6 : 0}
          strokeLinecap="round"
        />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="transparent"
          strokeWidth={18}
          className={clsx(interactive && 'transition-[stroke] duration-150 hover:stroke-white/25')}
        />
      </g>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[26rem]">
      <div className="mb-4 flex items-center justify-center gap-8 font-mono text-sm">
        {([0, 1] as Seat[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: SEAT_COLOR[s] }} />
            <span className="font-display text-xl font-bold tabular-nums text-white">{state.score[s]}</span>
            <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">
              {s === seat ? 'you' : 'them'}
            </span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full select-none rounded-xl bg-void-950/60 p-1">
        {state.boxes.map((owner, box) =>
          owner === null ? null : (
            <rect
              key={`box-${box}`}
              x={PAD + (box % BOXES) * CELL + 4}
              y={PAD + Math.floor(box / BOXES) * CELL + 4}
              width={CELL - 8}
              height={CELL - 8}
              rx={8}
              fill={SEAT_COLOR[owner]}
              opacity={claimed.has(box) ? 0.42 : 0.2}
              className={clsx(claimed.has(box) && 'animate-pop origin-center')}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          ),
        )}

        {horizontals.map(({ edge, row, column }) =>
          renderEdge(edge, PAD + column * CELL, PAD + row * CELL, PAD + (column + 1) * CELL, PAD + row * CELL),
        )}
        {verticals.map(({ edge, row, column }) =>
          renderEdge(edge, PAD + column * CELL, PAD + row * CELL, PAD + column * CELL, PAD + (row + 1) * CELL),
        )}

        {Array.from({ length: DOTS * DOTS }, (_, i) => (
          <circle
            key={`dot-${i}`}
            cx={PAD + (i % DOTS) * CELL}
            cy={PAD + Math.floor(i / DOTS) * CELL}
            r={4}
            fill="#64748b"
          />
        ))}
      </svg>

      <p className="mt-3 text-center text-xs text-slate-500">Close a box to score and play again.</p>
    </div>
  );
}
