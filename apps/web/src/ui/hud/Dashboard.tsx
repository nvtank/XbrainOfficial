import { motion, AnimatePresence } from 'framer-motion';
import { Activity } from 'lucide-react';
import { SEAT_BY_ID, TOTAL_DESKS, ZONE_BY_ID } from '@xbrain/shared';
import { useGame } from '../../stores/game';
import { useWorld } from '../../stores/world';
import { formatHMS, workElapsed } from '../../services/clock';
import { useTick } from './Toolbar';

/** Live office status — every number comes from replicated server state or the server stats message. */
export function Dashboard() {
  useTick();
  const open = useGame((s) => s.dashboardOpen);
  const players = useWorld((s) => s.players);
  const seats = useWorld((s) => s.seats);
  const capacity = useWorld((s) => s.capacity);
  const stats = useWorld((s) => s.stats);
  const selfSid = useWorld((s) => s.selfSid);
  const me = selfSid ? players[selfSid] : undefined;
  const list = Object.values(players);
  const working = list.filter((p) => p.working).sort((a, b) => workElapsed(b) - workElapsed(a));
  const desksUsed = Object.keys(seats).filter((id) => SEAT_BY_ID[id]?.kind === 'desk').length;
  const live = me?.working ? workElapsed(me) - (stats?.runningBaseMs ?? 0) : 0;
  const today = (stats?.todayMs ?? 0) + Math.max(0, live);
  const status = me?.working
    ? `Working · ${SEAT_BY_ID[me.seatId]?.label ?? ''}`
    : me?.seatId
      ? `Seated · ${SEAT_BY_ID[me.seatId]?.label ?? ''}`
      : me
        ? `Walking · ${ZONE_BY_ID[me.zone]?.name ?? ''}`
        : '—';

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass w-[300px] p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-extrabold tracking-[0.18em]">
            <Activity className="h-4 w-4 text-brand" /> XBRAIN OFFICE STATUS
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-xl bg-white/5 py-2">
              <div className="text-lg font-extrabold text-emerald-400">
                {list.length}
                <span className="text-xs text-white/40">/{capacity}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-white/50">Online</div>
            </div>
            <div className="rounded-xl bg-white/5 py-2">
              <div className="text-lg font-extrabold text-amber-300">{working.length}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/50">Working</div>
            </div>
            <div className="rounded-xl bg-white/5 py-2">
              <div className="text-lg font-extrabold text-sky-300">{TOTAL_DESKS - desksUsed}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/50">Free desks</div>
            </div>
          </div>
          <div className="mt-2.5 rounded-xl bg-gradient-to-r from-brand/25 to-brand-deep/10 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">My working time today</span>
              <span className="font-mono text-lg font-bold">{formatHMS(today)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-white/50">
              <span className="truncate">{status}</span>
              <span>Week {formatHMS((stats?.weekMs ?? 0) + Math.max(0, live)).slice(0, 5)}h</span>
            </div>
          </div>
          <div className="mt-2.5">
            <div className="label mb-1">Working now · {desksUsed}/{TOTAL_DESKS} desks in use</div>
            <div className="scrollbar-thin max-h-[160px] space-y-0.5 overflow-y-auto pr-1">
              {working.length === 0 && <div className="py-2 text-xs text-white/35">Nobody is working yet.</div>}
              {working.map((p) => (
                <div key={p.sid} className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs ${p.sid === selfSid ? 'bg-brand/15' : 'hover:bg-white/5'}`}>
                  <span className="truncate font-medium">
                    {p.name}
                    <span className="ml-1 text-white/40">{SEAT_BY_ID[p.seatId]?.deskId}</span>
                  </span>
                  <span className={`font-mono ${p.online ? 'text-amber-300' : 'text-white/40'}`}>{formatHMS(workElapsed(p))}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
