import clsx from 'clsx';
import {
  utttBoardOf,
  utttCellOf,
  utttLegalMoves,
  type Seat,
  type UltimateTicTacToeState,
} from '@mini-arcade/shared';

/**
 * Nine small boards in a 3x3 arrangement. The board the opponent sent you to
 * is highlighted; decided boards are dimmed and stamped with their winner.
 */
export function UltimateTicTacToeBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: UltimateTicTacToeState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (index: number) => void;
}) {
  const legal = new Set(yourTurn ? utttLegalMoves(state) : []);
  const winning = new Set(state.winningBoards ?? []);
  const highlighted = state.activeBoard;

  const mark = (value: Seat) => (value === 0 ? '✕' : '◯');
  const tone = (value: Seat) => (value === 0 ? 'text-neon-cyan' : 'text-neon-pink');

  return (
    <div className="mx-auto w-full max-w-[32rem]">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-void-950/60 p-2">
        {state.boards.map((result, board) => {
          const focused = highlighted === board || (highlighted === null && result === null);

          return (
            <div
              key={board}
              className={clsx(
                'relative grid grid-cols-3 gap-[3px] rounded-xl p-1.5 transition-all duration-200',
                result !== null && 'opacity-70',
                focused && yourTurn ? 'bg-neon-cyan/10 ring-1 ring-neon-cyan/40' : 'bg-void-900/70',
                winning.has(board) && 'ring-2 ring-neon-lime',
              )}
            >
              {Array.from({ length: 9 }, (_, cell) => {
                const index = board * 9 + cell;
                const value = state.cells[index] ?? null;
                const playable = legal.has(index);

                return (
                  <button
                    key={cell}
                    type="button"
                    disabled={!playable}
                    onClick={() => onPlay(index)}
                    aria-label={`board ${board + 1} cell ${cell + 1}`}
                    className={clsx(
                      'grid aspect-square place-items-center rounded-md text-sm font-bold transition-colors duration-150',
                      value === null ? 'bg-void-950/70' : 'bg-void-950/40',
                      playable && 'cursor-pointer hover:bg-neon-cyan/25',
                      index === state.lastCell && 'ring-1 ring-neon-amber/80',
                    )}
                  >
                    {value !== null ? (
                      <span
                        className={clsx('animate-[pop_0.2s_cubic-bezier(0.34,1.56,0.64,1)_both]', tone(value))}
                      >
                        {mark(value)}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {/* Decided board: stamp the winner over the top. */}
              {result !== null ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-void-950/70">
                  <span
                    className={clsx(
                      'animate-drop-in font-display text-5xl font-bold',
                      result === 'draw' ? 'text-slate-600' : tone(result),
                    )}
                  >
                    {result === 'draw' ? '–' : mark(result)}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        {state.winnerSeat !== null
          ? state.winnerSeat === seat
            ? 'You won the big board.'
            : 'Opponent won the big board.'
          : highlighted === null
            ? 'Free choice — play in any open board.'
            : `Play in board ${highlighted + 1} (row ${Math.floor(highlighted / 3) + 1}, column ${(highlighted % 3) + 1}).`}
      </p>
    </div>
  );
}

/** Exported for the how-to sheet: describes where a cell sends the opponent. */
export function describeUtttMove(index: number): string {
  return `board ${utttBoardOf(index) + 1} → sends to board ${utttCellOf(index) + 1}`;
}
