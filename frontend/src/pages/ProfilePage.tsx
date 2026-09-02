import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { GAME_CATALOG, isGameId } from '@mini-arcade/shared';
import { UpgradeAccountCard } from '@/components/UpgradeAccountCard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stat } from '@/components/ui/Stat';
import { api, type MatchHistoryItem } from '@/lib/api';
import { useSession } from '@/store/session';

export function ProfilePage() {
  const { player, rename, signOut } = useSession();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<MatchHistoryItem[] | null>(null);

  useEffect(() => {
    if (player) setDraft(player.nickname);
  }, [player?.nickname]);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    api
      .playerMatches(player.id, 12)
      .then((page) => !cancelled && setHistory(page.items))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [player?.id, player?.wins, player?.losses, player?.draws]);

  if (!player) return null;

  const played = player.wins + player.losses + player.draws;
  const winRate = played === 0 ? 0 : Math.round((player.wins / played) * 100);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (draft === player.nickname) return;
    setSaving(true);
    setStatus(null);
    try {
      await rename(draft);
      setStatus({ tone: 'ok', message: 'Nickname updated' });
    } catch (error) {
      setStatus({ tone: 'error', message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <UpgradeAccountCard />

      <Card className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar nickname={player.nickname} avatar={player.avatar} size="lg" ring />
        <div className="flex-1">
          <CardLabel>{player.isGuest ? 'guest player' : 'registered player'}</CardLabel>
          <h1 className="mt-1 text-3xl font-bold">{player.nickname}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Member since {new Date(player.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge tone="cyan" className="text-base">
          {player.rating} elo
        </Badge>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matches" value={played} />
        <Stat label="Wins" value={player.wins} accent="#a3e635" />
        <Stat label="Losses" value={player.losses} accent="#fb7185" />
        <Stat label="Win rate" value={`${winRate}%`} accent="#22d3ee" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardLabel>Identity</CardLabel>
          <h2 className="mt-1 text-lg font-semibold">Change nickname</h2>
          <form className="mt-4 flex gap-2" onSubmit={submit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              minLength={3}
              maxLength={18}
              className="h-11 flex-1 rounded-xl border border-white/8 bg-void-950/60 px-3.5 text-sm outline-none transition-colors focus:border-neon-cyan/50"
            />
            <Button type="submit" loading={saving} disabled={draft === player.nickname}>
              Save
            </Button>
          </form>
          {status && (
            <p className={clsx('mt-3 text-sm', status.tone === 'ok' ? 'text-neon-lime' : 'text-rose-400')}>
              {status.message}
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Your session lives in a signed token in this browser. Starting a new session gives you a fresh
            player and a fresh rating.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={signOut}>
            Start a new session
          </Button>
        </Card>

        <Card className="p-0">
          <div className="p-6 pb-3">
            <CardLabel>Recent matches</CardLabel>
          </div>
          {history === null && <p className="px-6 pb-6 text-sm text-slate-500">Loading…</p>}
          {history?.length === 0 && (
            <div className="px-6 pb-6">
              <EmptyState title="No matches yet" description="Your last twelve games will show up here." />
            </div>
          )}
          {history && history.length > 0 && (
            <div className="divide-y divide-white/5">
              {history.map((item) => (
                <div key={item.matchId} className="flex items-center gap-3 px-6 py-3">
                  <span
                    className={clsx(
                      'grid size-8 place-items-center rounded-lg text-xs font-bold',
                      item.result === 'win' && 'bg-neon-lime/15 text-neon-lime',
                      item.result === 'loss' && 'bg-rose-500/15 text-rose-400',
                      item.result === 'draw' && 'bg-white/5 text-slate-400',
                    )}
                  >
                    {item.result[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {isGameId(item.gameId) ? GAME_CATALOG[item.gameId].name : item.gameId}
                    </p>
                    <p className="truncate text-xs text-slate-500">vs {item.opponentNickname ?? 'unknown'}</p>
                  </div>
                  <span
                    className={clsx(
                      'font-mono text-sm tabular-nums',
                      item.ratingDelta >= 0 ? 'text-neon-lime' : 'text-rose-400',
                    )}
                  >
                    {item.ratingDelta >= 0 ? '+' : ''}
                    {item.ratingDelta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
