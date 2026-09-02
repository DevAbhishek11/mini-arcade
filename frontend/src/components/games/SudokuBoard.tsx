import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { SUDOKU_SIZE, sudokuCandidates, type Seat, type SudokuState } from '@mini-arcade/shared';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Pick a cell, then a digit. Cells are tinted by whoever solved them, so the
 * grid doubles as the scoreboard.
 */
export function SudokuBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: SudokuState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (cell: number, value: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showHints, setShowHints] = useState(false);

  // Drop the selection once the cell is filled or the turn passes.
  useEffect(() => {
    if (selected !== null && state.board[selected] !== null) setSelected(null);
  }, [state.board, selected]);

  const candidates = selected === null ? [] : sudokuCandidates(state.board, selected);
  const selectedRow = selected === null ? -1 : Math.floor(selected / SUDOKU_SIZE);
  const selectedCol = selected === null ? -1 : selected % SUDOKU_SIZE;
  const selectedValue = selected === null ? null : state.board[selected];

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <div className="grid grid-cols-9 overflow-hidden rounded-xl border-2 border-white/20 bg-void-950">
        {state.board.map((value, index) => {
          const row = Math.floor(index / SUDOKU_SIZE);
          const col = index % SUDOKU_SIZE;
          const owner = state.owners[index];
          const isClue = state.clues[index];
          const peer = row === selectedRow || col === selectedCol;
          const sameValue = value !== null && value === selectedValue;
          const mistake = state.lastMistake?.cell === index;

          return (
            <button
              key={index}
              type="button"
              disabled={!yourTurn || value !== null}
              onClick={() => setSelected(index === selected ? null : index)}
              aria-label={`row ${row + 1} column ${col + 1}`}
              className={clsx(
                'relative grid aspect-square place-items-center font-mono text-base tabular-nums transition-colors duration-150 sm:text-lg',
                // The 3x3 box grid, drawn with borders.
                'border-white/8',
                col % 3 === 2 && col !== 8 && 'border-r-2 border-r-white/25',
                row % 3 === 2 && row !== 8 && 'border-b-2 border-b-white/25',
                col !== 8 && 'border-r',
                row !== 8 && 'border-b',
                peer && value === null && 'bg-white/[0.04]',
                sameValue && 'bg-neon-cyan/10',
                index === selected && 'bg-neon-cyan/25',
                owner === 0 && 'bg-neon-cyan/12',
                owner === 1 && 'bg-neon-pink/12',
                mistake && 'animate-win-flash bg-red-500/30',
                value === null && yourTurn && 'hover:bg-white/10',
              )}
            >
              {value !== null ? (
                <span
                  className={clsx(
                    isClue ? 'text-slate-300' : 'font-bold',
                    owner === 0 && 'animate-pop text-neon-cyan',
                    owner === 1 && 'animate-pop text-neon-pink',
                    index === state.lastCell && 'animate-drop-in',
                  )}
                >
                  {value}
                </span>
              ) : showHints ? (
                <span className="text-[0.5rem] leading-none text-slate-600">
                  {sudokuCandidates(state.board, index).length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Digit pad. */}
      <div className="mt-3 grid grid-cols-9 gap-1.5">
        {DIGITS.map((digit) => {
          const possible = selected !== null && candidates.includes(digit);
          return (
            <button
              key={digit}
              type="button"
              disabled={!yourTurn || selected === null}
              onClick={() => {
                if (selected !== null) onPlay(selected, digit);
                setSelected(null);
              }}
              className={clsx(
                'grid aspect-square place-items-center rounded-lg border font-mono text-base font-bold transition-all duration-150',
                selected === null
                  ? 'border-white/5 bg-void-900/50 text-slate-600'
                  : possible
                    ? 'border-neon-cyan/40 bg-neon-cyan/10 text-white hover:scale-110 hover:bg-neon-cyan/25'
                    : // Still allowed — it is simply a digit that clashes.
                      'border-white/10 bg-void-900/70 text-slate-500 hover:bg-white/10',
              )}
            >
              {digit}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          <span className="text-neon-cyan">{state.score[seat]}</span> –{' '}
          <span className="text-neon-pink">{state.score[seat === 0 ? 1 : 0]}</span> ·{' '}
          {state.board.filter((cell) => cell === null).length} cells left
        </span>
        <button
          type="button"
          onClick={() => setShowHints((value) => !value)}
          className="rounded-md px-2 py-1 transition hover:bg-white/5 hover:text-slate-300"
        >
          {showHints ? 'Hide' : 'Show'} candidate counts
        </button>
      </div>
    </div>
  );
}
