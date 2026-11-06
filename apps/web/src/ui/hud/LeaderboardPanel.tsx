/** HUD Hall of Fame: hardest workers today / this week / this month (live data from the server). */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Trophy, X } from 'lucide-react';
import type { LeaderboardPeriod } from '@xbrain/shared';
import { useGame } from '../../stores/game';
import { useWorld } from '../../stores/world';
import { useApp } from '../../stores/app';
import { PERIOD_LABEL, colorFor, fmtHours, initials, rankedLive } from '../../game/leaderboard';

const MEDAL = ['🥇', '🥈', '🥉'];

export function LeaderboardPanel() {
  const open = useGame((s) => s.leaderboardOpen);
  const data = useWorld((s) => s.leaderboard);
  const me = useApp((s) => s.user?.id);
  const [period, setPeriod] = useState<LeaderboardPeriod>('today');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);
  const close = () => useGame.getState().set({ leaderboardOpen: false });
  const rows = rankedLive(data, period);
  const top = rows[0]?.live || 1;
  const myRank = rows.findIndex((r) => r.userId === me);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="lb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6 text-white backdrop-blur-sm" onClick={close}>
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass w-[min(560px,96vw)] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-extrabold">
                <Trophy className="h-5 w-5 text-brand" /> Bảng vàng chăm chỉ
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="btn-ghost h-8 px-2 text-xs"
                  title="Đi tới bức tường Hall of Fame"
                  onClick={() => {
                    close();
                    useGame.getState().setCamera('preset', 'leaderboard');
                  }}
                >
                  <Camera className="h-4 w-4" /> Xem tường
                </button>
                <button className="btn-ghost" onClick={close}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mb-4 text-xs text-white/55">Xếp theo thời gian làm việc tại bàn (đồng hồ làm việc của server). Cập nhật trực tiếp.</div>
            <div className="mb-4 flex gap-1 rounded-xl bg-white/5 p-1">
              {(Object.keys(PERIOD_LABEL) as LeaderboardPeriod[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${p === period ? 'bg-brand text-black' : 'text-white/70 hover:bg-white/10'}`}>
                  {PERIOD_LABEL[p].vi}
                </button>
              ))}
            </div>
            {!data ? (
              <div className="py-10 text-center text-sm text-white/60">Đang tải bảng xếp hạng…</div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/60">Chưa có ai làm việc trong khoảng này. Ngồi vào bàn để lên bảng vàng!</div>
            ) : (
              <div className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto pr-1">
                {rows.map((r, i) => (
                  <div key={r.userId} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.userId === me ? 'bg-brand/20 ring-1 ring-brand/60' : 'bg-white/5'}`}>
                    <div className="w-7 text-center text-base font-extrabold text-white/70">{MEDAL[i] ?? i + 1}</div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: colorFor(r.userId) }}>
                      {initials(r.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm font-semibold">
                        <span className="truncate">{r.name}</span>
                        {r.userId === me && <span className="rounded bg-brand px-1.5 text-[10px] font-bold text-black">BẠN</span>}
                        {r.working && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" title="Đang làm việc" />}
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/10">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (r.live / top) * 100)}%`, background: colorFor(r.userId) }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-sm font-bold ${r.working ? 'text-emerald-300' : 'text-brand'}`}>{fmtHours(r.live)}</div>
                      <div className="text-[10px] text-white/45">{r.sessions} phiên</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data && me && myRank < 0 && rows.length > 0 && <div className="mt-3 text-center text-xs text-white/55">Bạn chưa vào top 10 — ngồi vào bàn và bắt đầu làm việc nhé! 💪</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
