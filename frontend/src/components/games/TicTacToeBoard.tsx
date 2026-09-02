import clsx from 'clsx';
import type { Seat, TicTacToeState } from '@mini-arcade/shared';

export function TicTacToeBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: TicTacToeState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (index: number) => void;
}) {
  const winning = new Set(state.winningLine ?? []);

  return (
    <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-3">
      {state.board.map((cell, index) => {
        const isEmpty = cell === null;
        const mine = cell === seat;
        return (
          <button
            key={index}
            type="button"
            disabled={!isEmpty || !yourTurn}
            onClick={() => onPlay(index)}
            aria-label={`cell ${index + 1}`}
            className={clsx(
              'group relative grid aspect-square place-items-center rounded-2xl border transition-all duration-200',
              'border-white/8 bg-void-900/70',
              isEmpty &&
                yourTurn &&
                'hover:border-neon-cyan/50 hover:bg-void-800 active:scale-95 cursor-pointer',
              !isEmpty && 'cursor-default',
              winning.has(index) && 'border-neon-lime/60 bg-neon-lime/10',
            )}
          >
            {cell !== null && (
              <span
                className={clsx(
                  'animate-pop font-display text-5xl font-bold',
                  winning.has(index) && 'animate-win-flash',
                  mine ? 'text-neon-cyan' : 'text-neon-pink',
                )}
              >
                {cell === 0 ? '✕' : '◯'}
              </span>
            )}
            {isEmpty && yourTurn && (
              <span className="font-display text-4xl text-white/0 transition-colors duration-200 group-hover:text-white/10">
                {seat === 0 ? '✕' : '◯'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
