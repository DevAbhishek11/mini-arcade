import { useEffect, useRef } from 'react';
import {
  BALL_RADIUS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_INSET,
  PADDLE_WIDTH,
  type PaddleDirection,
  type PongState,
  type Seat,
} from '@mini-arcade/shared';

interface Props {
  state: PongState;
  seat: Seat;
  onInput: (dir: PaddleDirection) => void;
}

/**
 * Canvas renderer with client side extrapolation: the server streams state at
 * 30 Hz, we draw at display refresh rate and advance the ball by the time
 * elapsed since the last packet so motion stays perfectly smooth.
 */
export function PongCanvas({ state, seat, onInput }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const receivedAtRef = useRef(performance.now());
  const dirRef = useRef<PaddleDirection>(0);

  stateRef.current = state;
  useEffect(() => {
    receivedAtRef.current = performance.now();
  }, [state]);

  // Input: keyboard + pointer drag, de-duplicated so we only emit on change.
  useEffect(() => {
    const push = (dir: PaddleDirection) => {
      if (dirRef.current === dir) return;
      dirRef.current = dir;
      onInput(dir);
    };

    const pressed = new Set<string>();
    const resolve = () => {
      const up = pressed.has('ArrowUp') || pressed.has('w') || pressed.has('W');
      const down = pressed.has('ArrowDown') || pressed.has('s') || pressed.has('S');
      push(up === down ? 0 : up ? -1 : 1);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S'].includes(event.key)) {
        event.preventDefault();
        pressed.add(event.key);
        resolve();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.key);
      resolve();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);

    const canvas = canvasRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const y = ((event.clientY - rect.top) / rect.height) * FIELD_HEIGHT;
      const paddleY = stateRef.current.paddles[seat].y;
      push(Math.abs(y - paddleY) < 18 ? 0 : y > paddleY ? 1 : -1);
    };
    const onPointerLeave = () => push(0);

    canvas?.addEventListener('pointermove', onPointer);
    canvas?.addEventListener('pointerleave', onPointerLeave);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas?.removeEventListener('pointermove', onPointer);
      canvas?.removeEventListener('pointerleave', onPointerLeave);
      push(0);
    };
  }, [onInput, seat]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let frame = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round((rect.width * FIELD_HEIGHT) / FIELD_WIDTH) * dpr;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const snapshot = stateRef.current;
      const scale = canvas.width / FIELD_WIDTH;
      const dt = Math.min((performance.now() - receivedAtRef.current) / 1000, 0.12);

      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

      // Field
      context.fillStyle = '#080a14';
      context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      context.strokeStyle = 'rgba(255,255,255,0.08)';
      context.lineWidth = 2;
      context.setLineDash([10, 14]);
      context.beginPath();
      context.moveTo(FIELD_WIDTH / 2, 0);
      context.lineTo(FIELD_WIDTH / 2, FIELD_HEIGHT);
      context.stroke();
      context.setLineDash([]);

      // Score
      context.font = '600 84px "Space Grotesk", sans-serif';
      context.textAlign = 'center';
      context.fillStyle = 'rgba(255,255,255,0.06)';
      context.fillText(String(snapshot.score[0]), FIELD_WIDTH / 2 - 90, 100);
      context.fillText(String(snapshot.score[1]), FIELD_WIDTH / 2 + 90, 100);

      // Paddles
      const paddle = (index: 0 | 1, color: string) => {
        const p = snapshot.paddles[index];
        const y = Math.max(
          PADDLE_HEIGHT / 2,
          Math.min(FIELD_HEIGHT - PADDLE_HEIGHT / 2, p.y + p.dir * 520 * dt),
        );
        const x = index === 0 ? PADDLE_INSET : FIELD_WIDTH - PADDLE_INSET - PADDLE_WIDTH;
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 22;
        context.beginPath();
        context.roundRect(x, y - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT, 7);
        context.fill();
        context.shadowBlur = 0;
      };
      paddle(0, seat === 0 ? '#22d3ee' : '#f472b6');
      paddle(1, seat === 1 ? '#22d3ee' : '#f472b6');

      // Ball
      const bx = snapshot.ball.x + snapshot.ball.vx * dt;
      const by = snapshot.ball.y + snapshot.ball.vy * dt;
      context.fillStyle = '#ffffff';
      context.shadowColor = '#a3e635';
      context.shadowBlur = 28;
      context.beginPath();
      context.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;

      if (snapshot.serveCountdownMs > 0) {
        context.fillStyle = 'rgba(226,232,240,0.75)';
        context.font = '600 34px "Space Grotesk", sans-serif';
        context.fillText(
          `Serving in ${Math.ceil(snapshot.serveCountdownMs / 1000)}`,
          FIELD_WIDTH / 2,
          FIELD_HEIGHT / 2 + 120,
        );
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [seat]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <canvas
        ref={canvasRef}
        className="w-full touch-none rounded-2xl border border-white/8 bg-void-950 shadow-[0_30px_80px_-40px_rgba(34,211,238,0.5)]"
        style={{ aspectRatio: `${FIELD_WIDTH} / ${FIELD_HEIGHT}` }}
      />
      <p className="mt-3 text-center text-xs text-slate-500">
        Move with <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono">W</kbd>/
        <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono">S</kbd> or the arrow keys · or just drag on
        the field · first to 5
      </p>
    </div>
  );
}
