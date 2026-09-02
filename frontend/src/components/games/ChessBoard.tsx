import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CHESS_SIZE, type ChessMove, type ChessState, type PieceKind, type Seat } from '@mini-arcade/shared';

/** Outline glyphs for white, solid for black — legible on a dark board. */
const GLYPHS: Record<Seat, Record<PieceKind, string>> = {
  0: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  1: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const squareName = (index: number) =>
  `${FILES[index % CHESS_SIZE]}${CHESS_SIZE - Math.floor(index / CHESS_SIZE)}`;

const PROMOTIONS: Exclude<PieceKind, 'p' | 'k'>[] = ['q', 'r', 'b', 'n'];

export function ChessBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: ChessState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (from: number, to: number, promotion?: Exclude<PieceKind, 'p' | 'k'>) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);

  const legal = useMemo(() => (yourTurn ? state.legal : []), [state.legal, yourTurn]);

  // Any board change invalidates whatever was picked up.
  useEffect(() => {
    setSelected(null);
    setPromoting(null);
  }, [state.lastMove, state.turn]);

  const sources = new Set(legal.map((move) => move.from));
  const movesFrom = legal.filter((move) => move.from === selected);
  const targets = new Map<number, ChessMove[]>();
  for (const move of movesFrom) targets.set(move.to, [...(targets.get(move.to) ?? []), move]);

  // Black plays from the other end of the board.
  const order = Array.from({ length: 64 }, (_, i) => (seat === 0 ? i : 63 - i));

  const handle = (index: number) => {
    if (!yourTurn) return;

    const options = targets.get(index);
    if (options && options.length > 0) {
      // A promotion offers four pieces; everything else is unambiguous.
      if (options.length > 1 && options.every((move) => move.promotion)) {
        setPromoting({ from: options[0]?.from as number, to: index });
        return;
      }
      onPlay(options[0]?.from as number, index, options[0]?.promotion);
      setSelected(null);
      return;
    }

    if (sources.has(index)) setSelected(index === selected ? null : index);
    else setSelected(null);
  };

  const checkSquare =
    state.check !== null
      ? state.board.findIndex((piece) => piece?.seat === state.check && piece.kind === 'k')
      : -1;

  return (
    <div className="mx-auto w-full max-w-[32rem]">
      {/* Pieces this player has taken. */}
      <CapturedRow kinds={state.captured[seat]} label="You took" />

      <div className="relative mt-2 grid grid-cols-8 overflow-hidden rounded-xl border border-white/10 shadow-2xl">
        {order.map((index) => {
          const row = Math.floor(index / CHESS_SIZE);
          const col = index % CHESS_SIZE;
          const light = (row + col) % 2 === 0;
          const piece = state.board[index];
          const isTarget = targets.has(index);
          const isCapture = isTarget && targets.get(index)?.[0]?.captures !== undefined;

          return (
            <button
              key={index}
              type="button"
              disabled={!yourTurn || (!isTarget && !sources.has(index))}
              onClick={() => handle(index)}
              aria-label={squareName(index)}
              className={clsx(
                'relative grid aspect-square place-items-center text-[min(7vw,2.6rem)] leading-none transition-colors duration-150',
                light ? 'bg-slate-400/25' : 'bg-void-800',
                index === selected && 'bg-neon-cyan/35',
                index === state.lastMove?.from && 'bg-neon-amber/15',
                index === state.lastMove?.to && 'bg-neon-amber/25',
                index === checkSquare && 'bg-red-500/40 animate-win-flash',
              )}
            >
              {piece ? (
                <span
                  key={`${piece.seat}${piece.kind}`}
                  className={clsx(
                    'select-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]',
                    piece.seat === 0 ? 'text-white' : 'text-void-950',
                    index === state.lastMove?.to && 'animate-drop-in',
                  )}
                >
                  {GLYPHS[piece.seat][piece.kind]}
                </span>
              ) : null}

              {isTarget ? (
                <span
                  className={clsx(
                    'pointer-events-none absolute animate-pop',
                    isCapture
                      ? 'inset-1 rounded-md ring-[3px] ring-neon-pink/80'
                      : 'size-3 rounded-full bg-neon-cyan/70',
                  )}
                />
              ) : null}

              {/* Coordinates along the two outer edges. */}
              {col === (seat === 0 ? 0 : 7) ? (
                <span className="pointer-events-none absolute left-0.5 top-0.5 text-[0.5rem] text-white/35">
                  {CHESS_SIZE - row}
                </span>
              ) : null}
              {row === (seat === 0 ? 7 : 0) ? (
                <span className="pointer-events-none absolute bottom-0.5 right-1 text-[0.5rem] text-white/35">
                  {FILES[col]}
                </span>
              ) : null}
            </button>
          );
        })}

        {promoting ? (
          <div className="absolute inset-0 grid place-items-center bg-void-950/85 backdrop-blur-sm">
            <div className="animate-pop rounded-2xl border border-white/10 bg-void-900 p-4 text-center">
              <p className="mb-3 text-xs uppercase tracking-widest text-slate-400">Promote to</p>
              <div className="flex gap-2">
                {PROMOTIONS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      onPlay(promoting.from, promoting.to, kind);
                      setPromoting(null);
                      setSelected(null);
                    }}
                    className="grid size-12 place-items-center rounded-xl bg-white/5 text-3xl transition hover:scale-110 hover:bg-neon-cyan/20"
                  >
                    {GLYPHS[seat][kind]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <CapturedRow kinds={state.captured[seat === 0 ? 1 : 0]} label="They took" />

      <p className="mt-3 text-center text-xs text-slate-500">
        {state.ending === 'checkmate'
          ? 'Checkmate.'
          : state.ending === 'stalemate'
            ? 'Stalemate — a draw.'
            : state.ending === 'fifty-move'
              ? 'Fifty quiet moves — a draw.'
              : state.ending === 'insufficient-material'
                ? 'Not enough material to mate — a draw.'
                : state.check !== null
                  ? state.check === seat
                    ? 'You are in check.'
                    : 'Check!'
                  : yourTurn
                    ? 'Tap a piece to see its legal moves.'
                    : 'Waiting for your opponent…'}
      </p>
    </div>
  );
}

function CapturedRow({ kinds, label }: { kinds: PieceKind[]; label: string }) {
  if (kinds.length === 0) return <div className="h-6" aria-hidden />;
  return (
    <div className="flex h-6 items-center gap-1 text-lg leading-none text-slate-500">
      <span className="mr-1 text-[0.6rem] uppercase tracking-widest">{label}</span>
      {kinds.map((kind, index) => (
        <span key={`${kind}${index}`} className="animate-pop">
          {GLYPHS[1][kind]}
        </span>
      ))}
    </div>
  );
}
