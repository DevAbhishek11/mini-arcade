import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ticTacToeEngine, type TicTacToeState } from '@mini-arcade/shared';
import { sound } from '@/lib/sound';

/**
 * A real, playable tic-tac-toe board on the marketing pages. It runs the same
 * shared engine the server uses, so the very first thing a visitor touches is
 * the actual game — no signup, no socket.
 */
export interface HeroDemoProps {
  /** Where the closing call to action sends the visitor. */
  ctaTo?: string;
  ctaLabel?: string;
}

export function HeroDemo({ ctaTo = '/play/tic-tac-toe', ctaLabel = 'Real match →' }: HeroDemoProps) {
  const [state, setState] = useState<TicTacToeState>(() => ticTacToeEngine.createState(Date.now()));
  const navigate = useNavigate();

  const outcome = ticTacToeEngine.outcome(state);
  const winning = new Set(state.winningLine ?? []);

  const reset = () => setState(ticTacToeEngine.createState(Date.now()));

  const play = (index: number) => {
    if (outcome.finished) return;
    const result = ticTacToeEngine.apply(state, 0, { type: 'place', index }, Date.now());
    if (!result.ok) return;
    sound.play('place');
    setState(result.state);

    if (ticTacToeEngine.outcome(result.state).finished) return;

    // Simple, friendly reply: take the centre, else a random free square.
    window.setTimeout(() => {
      setState((current) => {
        const free = current.board.flatMap((cell, i) => (cell === null ? [i] : []));
        if (free.length === 0) return current;
        const pick = free.includes(4) ? 4 : (free[Math.floor(Math.random() * free.length)] as number);
        const reply = ticTacToeEngine.apply(current, 1, { type: 'place', index: pick }, Date.now());
        return reply.ok ? reply.state : current;
      });
    }, 380);
  };

  return (
    <div className="w-full max-w-[15rem]">
      <div className="grid grid-cols-3 gap-2">
        {state.board.map((cell, index) => (
          <button
            key={index}
            type="button"
            onClick={() => play(index)}
            disabled={cell !== null || outcome.finished}
            aria-label={`demo cell ${index + 1}`}
            className={clsx(
              'grid aspect-square place-items-center rounded-xl border border-white/10 bg-void-950/70 backdrop-blur transition-all duration-200',
              cell === null &&
                !outcome.finished &&
                'hover:border-neon-cyan/50 hover:bg-void-800/80 active:scale-95',
              winning.has(index) && 'border-neon-lime/60 bg-neon-lime/10',
            )}
          >
            {cell !== null && (
              <span
                className={clsx(
                  'animate-[pop_0.24s_cubic-bezier(0.34,1.56,0.64,1)_both] font-display text-3xl font-bold',
                  cell === 0 ? 'text-neon-cyan' : 'text-neon-pink',
                )}
              >
                {cell === 0 ? '✕' : '◯'}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-400">
          {outcome.finished
            ? outcome.winnerSeat === 0
              ? 'You win — nice.'
              : outcome.winnerSeat === 1
                ? 'Beaten by a three-line bot!'
                : 'Dead heat.'
            : 'Try a move — no signup needed'}
        </span>
        {outcome.finished ? (
          <button type="button" onClick={reset} className="font-semibold text-neon-cyan hover:underline">
            Again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(ctaTo)}
            className="font-semibold text-neon-cyan hover:underline"
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
