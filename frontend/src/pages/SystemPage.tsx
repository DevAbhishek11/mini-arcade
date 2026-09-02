import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { HealthReport } from '@mini-arcade/shared';
import { Badge } from '@/components/ui/Badge';
import { Card, CardLabel } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { api } from '@/lib/api';

type Runtime = Awaited<ReturnType<typeof api.runtime>>;

/** Operational dashboard: the infrastructure the arcade runs on, live. */
export function SystemPage() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([api.health(), api.runtime()])
        .then(([h, r]) => {
          if (cancelled) return;
          setHealth(h);
          setRuntime(r);
          setError(null);
        })
        .catch((err: Error) => !cancelled && setError(err.message));
    };
    load();
    const timer = window.setInterval(load, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <CardLabel>Operations</CardLabel>
        <h1 className="mt-1 text-3xl font-bold">System health</h1>
        <p className="mt-2 text-sm text-slate-400">
          Live readout from the worker serving this request. Prometheus metrics are exposed at{' '}
          <a href="/metrics" target="_blank" rel="noreferrer" className="text-neon-cyan hover:underline">
            /metrics
          </a>
          .
        </p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Status"
          value={health?.status ?? '—'}
          accent={health?.status === 'ok' ? '#a3e635' : '#fbbf24'}
        />
        <Stat label="Uptime" value={health ? `${Math.floor(health.uptimeSeconds / 60)}m` : '—'} />
        <Stat label="Worker" value={runtime ? `#${runtime.workerId} · pid ${runtime.pid}` : '—'} />
        <Stat label="Cluster size" value={runtime?.cluster.workers ?? '—'} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardLabel>Dependencies</CardLabel>
          <div className="mt-4 space-y-3">
            {Object.entries(health?.checks ?? {}).map(([name, check]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3.5 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium capitalize text-white">{name}</p>
                  {check.detail && <p className="text-xs text-slate-500">{check.detail}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {check.latencyMs !== undefined && (
                    <span className="font-mono text-xs text-slate-500">{check.latencyMs} ms</span>
                  )}
                  <Badge
                    tone={check.status === 'up' ? 'lime' : check.status === 'down' ? 'rose' : 'neutral'}
                    dot
                  >
                    {check.status}
                  </Badge>
                </div>
              </div>
            ))}
            {!health && <p className="text-sm text-slate-500">Loading…</p>}
          </div>
        </Card>

        <Card>
          <CardLabel>Resources</CardLabel>
          <div className="mt-4 space-y-4">
            {runtime && (
              <>
                <MemoryBar label="RSS" value={runtime.memoryMb.rss} max={512} />
                <MemoryBar
                  label="Heap used"
                  value={runtime.memoryMb.heapUsed}
                  max={runtime.memoryMb.heapTotal}
                />
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Stat label="Hosted matches" value={runtime.hostedMatches} />
                  <Stat label="Sockets here" value={runtime.onlineLocal} />
                  <Stat label="L1 cache" value={`${runtime.cache.l1Size}/${runtime.cache.l1Max}`} />
                  <Stat
                    label="Storage"
                    value={runtime.storage}
                    hint={runtime.cache.redis ? 'redis on' : 'no redis'}
                  />
                </div>
              </>
            )}
            {!runtime && <p className="text-sm text-slate-500">Loading…</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MemoryBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-500">
          {value} / {max} MB
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-void-800">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            pct > 85
              ? 'bg-rose-500'
              : pct > 60
                ? 'bg-neon-amber'
                : 'bg-gradient-to-r from-neon-cyan to-neon-violet',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
