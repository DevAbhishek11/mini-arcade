import { useEffect, useRef } from 'react';
import { SNAKE_GRID, type Direction, type Seat, type SnakeState } from '@mini-arcade/shared';

const COLORS: Record<Seat, { head: string; body: string; glow: string }> = {
  0: { head: '#67e8f9', body: '#22d3ee', glow: 'rgba(34,211,238,0.45)' },
  1: { head: '#fbcfe8', body: '#f472b6', glow: 'rgba(244,114,182,0.45)' },
};

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

/**
 * Snake Duel renderer. The server owns the simulation at a fixed 120 ms step;
 * we simply paint the latest authoritative grid at display refresh rate and
 * fade the trail so fast motion still reads well.
 */
export function SnakeDuelCanvas({
  state,
  seat,
  onTurn,
}: {
  state: SnakeState;
  seat: Seat;
  onTurn: (dir: Direction) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dir = KEYS[event.key];
      if (!dir) return;
      event.preventDefault();
      onTurn(dir);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onTurn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    const draw = () => {
      const snapshot = stateRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = canvas.clientWidth;
      if (canvas.width !== Math.floor(css * dpr)) {
        canvas.width = Math.floor(css * dpr);
        canvas.height = Math.floor(css * dpr);
      }

      const size = canvas.width;
      const cell = size / SNAKE_GRID;

      context.fillStyle = '#05060c';
      context.fillRect(0, 0, size, size);

      context.strokeStyle = 'rgba(255,255,255,0.04)';
      context.lineWidth = Math.max(1, dpr * 0.5);
      for (let i = 1; i < SNAKE_GRID; i += 1) {
        context.beginPath();
        context.moveTo(i * cell, 0);
        context.lineTo(i * cell, size);
        context.moveTo(0, i * cell);
        context.lineTo(size, i * cell);
        context.stroke();
      }

      // Food pellets pulse gently so they are easy to spot.
      const pulse = 0.72 + Math.sin(performance.now() / 220) * 0.12;
      for (const index of snapshot.food) {
        const x = (index % SNAKE_GRID) * cell;
        const y = Math.floor(index / SNAKE_GRID) * cell;
        context.fillStyle = '#a3e635';
        context.shadowColor = 'rgba(163,230,53,0.6)';
        context.shadowBlur = cell * 0.8;
        context.beginPath();
        context.arc(x + cell / 2, y + cell / 2, (cell / 2) * pulse * 0.7, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      }

      snapshot.snakes.forEach((snake, index) => {
        const palette = COLORS[index as Seat];
        context.shadowColor = palette.glow;
        snake.cells.forEach((position, i) => {
          const x = (position % SNAKE_GRID) * cell;
          const y = Math.floor(position / SNAKE_GRID) * cell;
          const head = i === 0;
          context.globalAlpha = snake.alive ? 1 - Math.min(0.55, i * 0.02) : 0.28;
          context.shadowBlur = head ? cell : 0;
          context.fillStyle = head ? palette.head : palette.body;
          const inset = head ? cell * 0.06 : cell * 0.14;
          roundRect(context, x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.28);
          context.fill();
        });
        context.globalAlpha = 1;
        context.shadowBlur = 0;
      });

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const you = state.snakes[seat];
  const them = state.snakes[seat === 0 ? 1 : 0];

  return (
    <div className="mx-auto w-full max-w-[32rem]">
      <div className="mb-3 flex items-center justify-between font-mono text-xs">
        <span className="text-neon-cyan">
          you · {you.score} pellets{you.alive ? '' : ' · crashed'}
        </span>
        <span className="text-neon-pink">
          rival · {them.score} pellets{them.alive ? '' : ' · crashed'}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="aspect-square w-full rounded-xl border border-white/8 bg-void-950"
        aria-label="snake duel arena"
      />

      <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
        <span />
        <TouchButton dir="up" onTurn={onTurn} label="▲" />
        <span />
        <TouchButton dir="left" onTurn={onTurn} label="◀" />
        <TouchButton dir="down" onTurn={onTurn} label="▼" />
        <TouchButton dir="right" onTurn={onTurn} label="▶" />
      </div>

      <p className="mt-3 hidden text-center text-xs text-slate-500 sm:block">Arrow keys or WASD to steer.</p>
    </div>
  );
}

function TouchButton({
  dir,
  label,
  onTurn,
}: {
  dir: Direction;
  label: string;
  onTurn: (dir: Direction) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        onTurn(dir);
      }}
      className="grid h-12 place-items-center rounded-xl border border-white/8 bg-void-900/70 text-lg text-slate-300 active:scale-95"
    >
      {label}
    </button>
  );
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
