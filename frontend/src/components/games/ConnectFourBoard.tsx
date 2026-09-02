import type React from 'react';
import clsx from 'clsx';
import { COLUMNS, ROWS, type ConnectFourState, type Seat } from '@mini-arcade/shared';

export function ConnectFourBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: ConnectFourState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (column: number) => void;
}) {
  const winning = new Set(state.winningLine ?? []);
  const columns = Array.from({ length: COLUMNS }, (_, c) => c);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="grid grid-cols-7 gap-1.5 pb-2">
        {columns.map((column) => {
          const full = state.board[column] !== null;
          return (
            <button
              key={column}
              type="button"
              disabled={full || !yourTurn}
              onClick={() => onPlay(column)}
              className={clsx(
                'rounded-lg py-1.5 text-xs font-semibold transition-all',
                full || !yourTurn
                  ? 'cursor-not-allowed text-slate-700'
                  : 'text-slate-400 hover:bg-white/5 hover:text-neon-cyan active:scale-95',
              )}
            >
              ▼
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-7 gap-1.5 rounded-2xl border border-white/8 bg-void-900/80 p-3 shadow-[inset_0_2px_20px_rgba(0,0,0,0.6)]">
        {Array.from({ length: ROWS * COLUMNS }, (_, index) => {
          const cell = state.board[index];
          const column = index % COLUMNS;
          const row = Math.floor(index / COLUMNS);
          const playable = state.board[column] === null && yourTurn;
          // The lowest filled disc in the column that was just played is the
          // one that needs to fall.
          const justLanded =
            state.lastColumn === column && cell !== null && state.board[index - COLUMNS] === null && row >= 0;
          return (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              disabled={!playable}
              onClick={() => onPlay(column)}
              className={clsx(
                'group relative aspect-square rounded-full border transition-all duration-150',
                cell === null && 'border-white/5 bg-void-950/80',
                playable && 'hover:border-neon-cyan/40',
                cell === 0 && 'border-neon-cyan/40 bg-gradient-to-br from-cyan-300 to-cyan-600',
                cell === 1 && 'border-neon-pink/40 bg-gradient-to-br from-pink-300 to-fuchsia-600',
                winning.has(index) && 'ring-2 ring-neon-lime ring-offset-2 ring-offset-void-900',
              )}
            >
              {cell !== null && (
                <span
                  className={clsx(
                    'absolute inset-0 rounded-full',
                    justLanded ? 'animate-slide-piece' : 'animate-pop',
                    winning.has(index) && 'animate-win-flash',
                  )}
                  // Fall in from above the board, so the drop reads as gravity.
                  style={
                    justLanded ? ({ '--slide-y': `${-(row + 1) * 118}%` } as React.CSSProperties) : undefined
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        You are the {seat === 0 ? 'cyan' : 'pink'} discs · four in a row wins
      </p>
    </div>
  );
}
