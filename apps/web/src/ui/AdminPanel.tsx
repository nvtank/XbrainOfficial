/** Basic administrator console (#/admin): online users, kick, mute, capacity, teleport policy, server health. */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, Cpu, MemoryStick, RefreshCw, Shield, Users, Volume2, VolumeX } from 'lucide-react';
import { SEAT_BY_ID } from '@xbrain/shared';
import { api, type AdminSession, type AdminStatus } from '../services/api';
import { formatHMS } from '../services/clock';
import { Logo } from './LoadingScreen';

export default function AdminPanel() {
  const [token, setToken] = useState(() => sessionStorage.getItem('xbrain.admin') ?? '');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cap, setCap] = useState(50);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, w] = await Promise.all([api.admin.status(token), api.admin.sessions(token)]);
      setStatus(s);
      setSessions(w.sessions);
      setError(null);
      sessionStorage.setItem('xbrain.admin', token);
      if (s.office) setCap(s.office.capacity);
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="h-full overflow-y-auto bg-[#0f1115] p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white px-3 py-1.5">
              <Logo className="h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-lg font-bold">
                <Shield className="h-5 w-5 text-brand" /> Administrator
              </div>
              <div className="text-xs text-white/50">XBrain Virtual Office server console</div>
            </div>
          </div>
          <a href="#/" className="btn-ghost" onClick={() => setTimeout(() => location.reload(), 10)}>
            <ArrowLeft className="h-4 w-4" /> Back to office
          </a>
        </div>

        <div className="glass flex items-center gap-2 p-3">
          <input className="input max-w-sm" type="password" placeholder="ADMIN_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="btn-primary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Connect
          </button>
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>

        {status && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ['Online', `${status.office?.present ?? 0}/${status.office?.capacity ?? '-'}`, Users],
                ['Working', String(status.office?.working ?? 0), Users],
                ['CPU (process)', `${status.cpuPercent}%`, Cpu],
                ['Memory (RSS)', `${status.memory.rssMB} MB`, MemoryStick],
                ['Uptime', formatHMS(status.uptimeSec * 1000), RefreshCw],
              ].map(([l, v, I]) => {
                const Icon = I as typeof Users;
                return (
                  <div key={l as string} className="glass p-4">
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <Icon className="h-3.5 w-3.5" /> {l as string}
                    </div>
                    <div className="mt-1 text-2xl font-bold">{v as string}</div>
                  </div>
                );
              })}
            </div>
            <div className="glass flex flex-wrap items-center gap-4 p-4 text-sm">
              <span className="text-white/60">
                Node {status.node} · store <b>{status.store}</b> · voice <b>{status.voice ? 'LiveKit' : 'disabled'}</b> · room {status.office?.roomId}
              </span>
              <span className="ml-auto flex items-center gap-2">
                Capacity
                <input className="input w-20 py-1" type="number" min={1} max={200} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
                <button className="btn-ghost" onClick={async () => (await api.admin.capacity(token, cap), load())}>
                  Apply
                </button>
              </span>
              <span className="flex items-center gap-2">
                Teleport
                <button className={status.office?.allowTeleport ? 'btn-primary' : 'btn-ghost'} onClick={async () => (await api.admin.teleport(token, !status.office?.allowTeleport), load())}>
                  {status.office?.allowTeleport ? 'Allowed' : 'Disabled'}
                </button>
              </span>
            </div>
            <div className="glass overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase text-white/50">
                  <tr>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Zone</th>
                    <th className="px-3 py-2">Seat</th>
                    <th className="px-3 py-2">Work</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Violations</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {status.players.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-white/40">
                        Nobody online
                      </td>
                    </tr>
                  )}
                  {status.players.map((p) => (
                    <tr key={p.sessionId} className="border-t border-white/5">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{p.name}</div>
                        <div className="font-mono text-[10px] text-white/40">
                          {p.userId} · {p.sessionId}
                        </div>
                      </td>
                      <td className="px-3 py-2">{p.zone}</td>
                      <td className="px-3 py-2">{p.seatId ? SEAT_BY_ID[p.seatId]?.label : '—'}</td>
                      <td className="px-3 py-2 font-mono">{p.working ? formatHMS(p.workMs) : '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {p.online ? 'online' : 'reconnecting'} {p.micOn && '· mic'} {p.muted && <span className="text-red-300">· muted</span>}
                      </td>
                      <td className="px-3 py-2">{p.violations}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="btn-ghost mr-1 py-1" onClick={async () => (await api.admin.mute(token, p.sessionId, !p.muted, 15), load())}>
                          {p.muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {p.muted ? 'Unmute' : 'Mute 15m'}
                        </button>
                        <button className="btn-danger py-1" onClick={async () => (await api.admin.kick(token, p.sessionId), load())}>
                          <Ban className="h-3.5 w-3.5" /> Kick
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="glass p-4">
              <div className="mb-2 text-sm font-bold">Recent work sessions (desk usage history)</div>
              <div className="max-h-72 overflow-y-auto text-xs">
                <table className="w-full text-left">
                  <thead className="text-white/50">
                    <tr>
                      <th className="py-1">User</th>
                      <th>Desk</th>
                      <th>Started</th>
                      <th>Ended</th>
                      <th>Active</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-t border-white/5">
                        <td className="py-1">{s.displayName}</td>
                        <td>{s.deskId}</td>
                        <td>{new Date(s.startedAt).toLocaleString('vi-VN')}</td>
                        <td>{s.endedAt ? new Date(s.endedAt).toLocaleTimeString('vi-VN') : <span className="text-amber-300">running</span>}</td>
                        <td className="font-mono">{formatHMS(s.activeMs)}</td>
                        <td>{s.endReason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
