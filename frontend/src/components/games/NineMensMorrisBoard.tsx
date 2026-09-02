import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  MORRIS_ADJACENCY,
  MORRIS_COORDS,
  morrisPhaseOf,
  morrisRemovable,
  type MorrisState,
  type Seat,
} from '@mini-arcade/shared';

/** The three nested squares, in grid units (0-6). */
const RINGS = [
  { x: 0, size: 6 },
  { x: 1, size: 4 },
  { x: 2, size: 2 },
];

/** The four spokes joining the rings. */
const SPOKES: readonly (readonly [number, number, number, number])[] = [
  [3, 0, 3, 2],
  [3, 4, 3, 6],
  [0, 3, 2, 3],
  [4, 3, 6, 3],
];

const UNIT = 100 / 6;
const px = (value: number) => value * UNIT;

export function NineMensMorrisBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: MorrisState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (action: { type: 'place' | 'move' | 'remove'; from?: number; to?: number; point?: number }) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const phase = morrisPhaseOf(state, state.turn);
  const removable = state.mustRemove && yourTurn ? new Set(morrisRemovable(state, seat)) : new Set<number>();

  useEffect(() => {
    setSelected(null);
  }, [state.lastMove, state.turn, state.mustRemove]);

  const destinations =
    selected === null
      ? new Set<number>()
      : new Set(
          phase === 'flying'
            ? state.board.flatMap((cell, index) => (cell === null ? [index] : []))
            : (MORRIS_ADJACENCY[selected] ?? []).filter((point) => state.board[point] === null),
        );

  const millPoints = new Set(state.lastMill ?? []);

  const handle = (point: number) => {
    if (!yourTurn) return;

    if (state.mustRemove) {
      if (removable.has(point)) onPlay({ type: 'remove', point });
      return;
    }
    if (phase === 'placing') {
      if (state.board[point] === null) onPlay({ type: 'place', to: point });
      return;
    }
    if (destinations.has(point) && selected !== null) {
      onPlay({ type: 'move', from: selected, to: point });
      setSelected(null);
      return;
    }
    if (state.board[point] === seat) setSelected(point === selected ? null : point);
  };

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <div className="relative aspect-square rounded-2xl border border-white/10 bg-void-900/60 p-5">
        <svg viewBox="0 0 100 100" className="size-full overflow-visible">
          {/* Board lines. */}
          <g stroke="rgba(255,255,255,0.18)" strokeWidth={0.8} fill="none">
            {RINGS.map((ring) => (
              <rect
                key={ring.x}
                x={px(ring.x)}
                y={px(ring.x)}
                width={px(ring.size)}
                height={px(ring.size)}
                rx={1}
              />
            ))}
            {SPOKES.map(([x1, y1, x2, y2], index) => (
              <line key={index} x1={px(x1)} y1={px(y1)} x2={px(x2)} y2={px(y2)} />
            ))}
          </g>

          {/* Points and pieces. */}
          {MORRIS_COORDS.map(([gx, gy], point) => {
            const owner = state.board[point];
            const isDestination = destinations.has(point);
            const canPlace = yourTurn && !state.mustRemove && phase === 'placing' && owner === null;
            const canRemove = removable.has(point);
            const interactive = canPlace || isDestination || canRemove || (owner === seat && !state.mustRemove);

            return (
              <g
                key={point}
                transform={`translate(${px(gx)} ${px(gy)})`}
                onClick={() => handle(point)}
                className={clsx(interactive && yourTurn && 'cursor-pointer')}
              >
                {/* Generous invisible hit area. */}
                <circle r={6} fill="transparent" />

                {owner === null ? (
                  <circle
                    r={isDestination || canPlace ? 2.6 : 1.5}
                    className={clsx('transition-all duration-200', isDestination && 'animate-pulse-ring')}
                    fill={
                      isDestination
                        ? 'rgba(34,211,238,0.75)'
                        : canPlace
                          ? 'rgba(148,163,184,0.5)'
                          : 'rgba(148,163,184,0.25)'
                    }
                  />
                ) : (
                  <g
                    className={clsx(
                      'transition-transform duration-200',
                      point === state.lastMove?.to && 'animate-drop-in',
                      millPoints.has(point) && 'animate-win-flash',
                      point === selected && 'scale-125',
                    )}
                    style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
                  >
                    <circle
                      r={4}
                      fill={owner === 0 ? 'url(#morrisLight)' : 'url(#morrisDark)'}
                      stroke={
                        point === selected
                          ? '#22d3ee'
                          : canRemove
                            ? '#f472b6'
                            : millPoints.has(point)
                              ? '#a3e635'
                              : 'rgba(0,0,0,0.5)'
                      }
                      strokeWidth={point === selected || canRemove ? 1.2 : 0.5}
                    />
                    {canRemove ? (
                      <circle r={5.6} fill="none" stroke="#f472b6" strokeWidth={0.6} opacity={0.7} />
                    ) : null}
                  </g>
                )}
              </g>
            );
          })}

          <defs>
            <radialGradient id="morrisLight" cx="0.35" cy="0.3">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#94a3b8" />
            </radialGradient>
            <radialGradient id="morrisDark" cx="0.35" cy="0.3">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#b45309" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      {/* Pieces still in hand. */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <Hand count={state.hand[seat]} onBoard={state.onBoard[seat]} label="You" tone="text-slate-200" />
        <span className="text-center">
          {state.mustRemove && yourTurn
            ? 'Mill! Take an enemy piece.'
            : state.mustRemove
              ? 'They formed a mill…'
              : phase === 'flying' && yourTurn
                ? 'Three pieces left — you may fly anywhere.'
                : yourTurn
                  ? phase === 'placing'
                    ? 'Place a piece.'
                    : 'Slide a piece along a line.'
                  : 'Waiting…'}
        </span>
        <Hand
          count={state.hand[seat === 0 ? 1 : 0]}
          onBoard={state.onBoard[seat === 0 ? 1 : 0]}
          label="Them"
          tone="text-orange-400"
        />
      </div>
    </div>
  );
}

function Hand({
  count,
  onBoard,
  label,
  tone,
}: {
  count: number;
  onBoard: number;
  label: string;
  tone: string;
}) {
  return (
    <span className={clsx('flex items-center gap-1', tone)}>
      <span className="text-[0.6rem] uppercase tracking-widest text-slate-600">{label}</span>
      {count > 0 ? <span>{count} in hand</span> : <span>{onBoard} left</span>}
    </span>
  );
}
