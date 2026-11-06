/** Shared helpers for the leaderboard (3D LED wall + HUD panel). */
import type { LeaderboardData, LeaderboardEntry, LeaderboardPeriod } from '@xbrain/shared';
import { serverNow } from '../services/clock';

export const PERIOD_LABEL: Record<LeaderboardPeriod, { en: string; vi: string }> = {
  today: { en: 'TODAY', vi: 'Hôm nay' },
  week: { en: 'THIS WEEK', vi: 'Tuần này' },
  month: { en: 'THIS MONTH', vi: 'Tháng này' },
};

/** Work time including live progress since the server computed the board. */
export function liveMs(e: LeaderboardEntry, data: LeaderboardData): number {
  return e.ms + (e.working ? Math.max(0, serverNow() - data.at) : 0);
}

export function rankedLive(data: LeaderboardData | null, period: LeaderboardPeriod): Array<LeaderboardEntry & { live: number }> {
  if (!data) return [];
  return data[period].map((e) => ({ ...e, live: liveMs(e, data) })).sort((a, b) => b.live - a.live);
}

export function fmtHours(ms: number): string {
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

const PALETTE = ['#F7941D', '#4fb4ff', '#4ade80', '#f472b6', '#a78bfa', '#fbbf24', '#f97316', '#22d3ee', '#fb7185', '#84cc16'];
export function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => (/^\d+$/.test(w) ? w.slice(-2) : w[0]!.toUpperCase()))
    .join('')
    .slice(0, 3) || '?';
