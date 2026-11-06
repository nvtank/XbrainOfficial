import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, MapPin, Navigation, Sparkles, X } from 'lucide-react';
import {
  DESKS,
  DESK_DEPTH,
  DESK_WIDTH,
  FURNITURE,
  MAP_BOUNDS,
  ROOM_NAV_TARGET,
  SEAT_BY_ID,
  WALL_PIECES,
  ZONES,
  ZONE_BY_ID,
  getNavNode,
  rectFromCenter,
  type ZoneId,
} from '@xbrain/shared';
import { useGame } from '../../stores/game';
import { useWorld } from '../../stores/world';
import { runtime } from '../../game/runtime';
import { net } from '../../services/network';

const W = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
const H = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;
const ZONE_CAMERA: Partial<Record<ZoneId, string>> = { outside: 'entrance', lobby: 'reception', workspace: 'workspace', meeting: 'meeting', kitchen: 'kitchen', director: 'director', storage: 'storage', lounge: 'bridge' };

export function navigateToZone(zone: ZoneId) {
  const node = ROOM_NAV_TARGET[zone] ? getNavNode(ROOM_NAV_TARGET[zone]!) : undefined;
  if (!node) return;
  useGame.getState().set({ navTarget: { label: ZONE_BY_ID[zone].name, zone, points: [{ x: node.x, z: node.z }] }, mapOpen: false });
  useGame.getState().toast('info', `Route to ${ZONE_BY_ID[zone].name} shown on the floor.`);
}

export function MiniMap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = { w: 200, h: Math.round((200 * H) / W) };
  const bg = useMemo(() => {
    const c = document.createElement('canvas');
    const k = 2;
    c.width = size.w * k;
    c.height = size.h * k;
    const ctx = c.getContext('2d')!;
    ctx.scale((size.w * k) / W, (size.h * k) / H);
    ctx.translate(-MAP_BOUNDS.minX, -MAP_BOUNDS.minZ);
    for (const z of ZONES) {
      ctx.fillStyle = z.mapColor;
      ctx.fillRect(z.rect.minX, z.rect.minZ, z.rect.maxX - z.rect.minX, z.rect.maxZ - z.rect.minZ);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const f of FURNITURE) {
      if (!['meetingTable', 'receptionDesk', 'kitchenCounter', 'directorDesk', 'sofa', 'barCounter', 'roundTable', 'shelf', 'lockerBank', 'bookshelf'].includes(f.type)) continue;
      const r = rectFromCenter(f.x, f.z, f.w, f.d, f.rotY);
      ctx.fillRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
    }
    for (const p of WALL_PIECES) {
      if (p.y0 > 1) continue;
      ctx.fillStyle = p.material === 'glass' || p.material === 'curtain' || p.material === 'frosted' ? '#7dd3fc' : p.material === 'black' ? '#000' : '#e5e7eb';
      const pad = 0.12;
      ctx.fillRect(p.rect.minX - pad / 2, p.rect.minZ - pad / 2, p.rect.maxX - p.rect.minX + pad, p.rect.maxZ - p.rect.minZ + pad);
    }
    return c;
  }, [size.w, size.h]);

  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (frame++ % 6) return;
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const k = 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(bg, 0, 0);
      ctx.scale((size.w * k) / W, (size.h * k) / H);
      ctx.translate(-MAP_BOUNDS.minX, -MAP_BOUNDS.minZ);
      const { seats, players, selfSid } = useWorld.getState();
      for (const d of DESKS) {
        ctx.fillStyle = seats[d.seatId] ? '#F7941D' : 'rgba(255,255,255,0.45)';
        ctx.fillRect(d.x - DESK_WIDTH / 2 + 0.06, d.z - DESK_DEPTH / 2 + 0.04, DESK_WIDTH - 0.12, DESK_DEPTH - 0.08);
      }
      const nav = useGame.getState().navTarget;
      if (nav) {
        const dest = nav.points[nav.points.length - 1];
        ctx.fillStyle = '#F7941D';
        ctx.beginPath();
        ctx.arc(dest.x, dest.z, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [sid, pos] of runtime.remotePos) {
        const p = players[sid];
        ctx.fillStyle = p?.working ? '#fbbf24' : '#ffffff';
        ctx.beginPath();
        ctx.arc(pos.x, pos.z, 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      if (selfSid) {
        const L = runtime.local;
        ctx.save();
        ctx.translate(L.pos.x, L.pos.z);
        ctx.rotate(-L.rotY);
        ctx.fillStyle = '#F7941D';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.18;
        ctx.beginPath();
        ctx.moveTo(0, 1.0);
        ctx.lineTo(0.62, -0.6);
        ctx.lineTo(0, -0.25);
        ctx.lineTo(-0.62, -0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [bg, size.w, size.h]);

  const mode = useGame((s) => s.cameraMode);
  return (
    <div className="glass pointer-events-auto overflow-hidden p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold tracking-wider text-white/70">MINI MAP</span>
        <button className="text-[10px] text-white/50 hover:text-white" onClick={() => useGame.getState().set({ mapOpen: true })}>
          Open (M)
        </button>
      </div>
      <canvas ref={canvas} width={size.w * 2} height={size.h * 2} style={{ width: size.w, height: size.h }} className="cursor-pointer rounded-lg" onClick={() => useGame.getState().set({ mapOpen: true })} />
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {(['meeting', 'kitchen', 'director', 'workspace', 'lobby', 'lounge'] as ZoneId[]).map((z) => (
          <button key={z} className="rounded-md bg-white/5 px-1 py-1 text-[10px] text-white/70 hover:bg-white/15 hover:text-white" title={`${ZONE_BY_ID[z].name} camera`} onClick={() => useGame.getState().setCamera('preset', ZONE_CAMERA[z]!)}>
            {ZONE_BY_ID[z].name.split(' ')[0]}
          </button>
        ))}
      </div>
      {(mode === 'overview' || mode === 'preset') && (
        <button className="btn-primary mt-1.5 w-full py-1.5 text-xs" onClick={() => useGame.getState().setCamera(useGame.getState().followMode)}>
          Back to my avatar
        </button>
      )}
    </div>
  );
}

export function BigMap() {
  const players = useWorld((s) => s.players);
  const seats = useWorld((s) => s.seats);
  const selfSid = useWorld((s) => s.selfSid);
  const allowTeleport = useWorld((s) => s.allowTeleport);
  const [sel, setSel] = useState<{ kind: 'zone'; id: ZoneId } | { kind: 'desk'; id: string } | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const close = () => useGame.getState().set({ mapOpen: false, highlightZone: null });
  const L = runtime.local;
  const zone = sel?.kind === 'zone' ? ZONE_BY_ID[sel.id] : null;
  const desk = sel?.kind === 'desk' ? DESKS.find((d) => d.id === sel.id) : null;
  const deskOcc = desk ? seats[desk.seatId] : undefined;
  const inZone = zone ? Object.values(players).filter((p) => p.zone === zone.id) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6 text-white backdrop-blur-sm" onClick={close}>
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="glass flex max-h-full w-[min(1100px,96vw)] gap-4 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-extrabold tracking-[0.18em]">XBRAIN OFFICE MAP</div>
            <div className="text-xs text-white/50">Entrance at the bottom · click a room or desk</div>
          </div>
          <svg viewBox={`${MAP_BOUNDS.minX} ${MAP_BOUNDS.minZ} ${W} ${H}`} className="max-h-[78vh] w-full rounded-xl bg-[#0d0f13]">
            {ZONES.map((z) => (
              <g key={z.id} className="cursor-pointer" onClick={() => setSel({ kind: 'zone', id: z.id })}>
                <rect
                  x={z.rect.minX}
                  y={z.rect.minZ}
                  width={z.rect.maxX - z.rect.minX}
                  height={z.rect.maxZ - z.rect.minZ}
                  fill={z.mapColor}
                  opacity={sel?.kind === 'zone' && sel.id === z.id ? 1 : 0.75}
                  stroke={sel?.kind === 'zone' && sel.id === z.id ? '#F7941D' : 'none'}
                  strokeWidth={0.25}
                />
                {z.navigable && (
                  <text x={(z.rect.minX + z.rect.maxX) / 2} y={(z.rect.minZ + z.rect.maxZ) / 2 + (z.id === 'workspace' ? -13.6 : 0)} fill="white" fontSize={0.85} fontWeight={700} textAnchor="middle" opacity={0.85} style={{ pointerEvents: 'none' }}>
                    {z.name}
                  </text>
                )}
              </g>
            ))}
            {WALL_PIECES.filter((p) => p.y0 < 1).map((p, i) => (
              <rect key={i} x={p.rect.minX} y={p.rect.minZ} width={Math.max(0.12, p.rect.maxX - p.rect.minX)} height={Math.max(0.12, p.rect.maxZ - p.rect.minZ)} fill={p.material === 'glass' || p.material === 'curtain' || p.material === 'frosted' ? '#7dd3fc' : '#e5e7eb'} style={{ pointerEvents: 'none' }} />
            ))}
            {DESKS.map((d) => {
              const occ = seats[d.seatId];
              const selected = sel?.kind === 'desk' && sel.id === d.id;
              return (
                <rect
                  key={d.id}
                  x={d.x - DESK_WIDTH / 2 + 0.05}
                  y={d.z - DESK_DEPTH / 2 + 0.04}
                  width={DESK_WIDTH - 0.1}
                  height={DESK_DEPTH - 0.08}
                  rx={0.08}
                  fill={occ ? '#F7941D' : '#d6d3d1'}
                  stroke={selected ? '#fff' : 'none'}
                  strokeWidth={0.12}
                  className="cursor-pointer"
                  onClick={() => setSel({ kind: 'desk', id: d.id })}
                >
                  <title>{`${d.id}${occ ? ` · ${players[occ]?.name ?? ''}` : ' · free'}`}</title>
                </rect>
              );
            })}
            {[1, 2, 3, 4, 5].map((c) => (
              <text key={c} x={-0.9} y={-5 - (c - 1) * 5 + 0.3} fill="#F7941D" fontSize={0.8} fontWeight={800} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                {c}
              </text>
            ))}
            {Object.values(players).map((p) => {
              const pos = p.sid === selfSid ? L.pos : runtime.remotePos.get(p.sid);
              if (!pos || p.sid === selfSid) return null;
              return (
                <g key={p.sid} style={{ pointerEvents: 'none' }}>
                  <circle cx={pos.x} cy={pos.z} r={0.45} fill={p.working ? '#fbbf24' : '#fff'} stroke="#000" strokeWidth={0.08} />
                  <text x={pos.x} y={pos.z - 0.65} fontSize={0.55} fill="#fff" textAnchor="middle">
                    {p.name}
                  </text>
                </g>
              );
            })}
            <g transform={`translate(${L.pos.x} ${L.pos.z}) rotate(${(-L.rotY * 180) / Math.PI})`} style={{ pointerEvents: 'none' }}>
              <path d="M0 1.1 L0.7 -0.65 L0 -0.25 L-0.7 -0.65 Z" fill="#F7941D" stroke="#fff" strokeWidth={0.15} />
            </g>
          </svg>
        </div>
        <div className="flex w-[260px] flex-col gap-3">
          <div className="flex justify-end">
            <button className="btn-ghost" onClick={close}>
              <X className="h-4 w-4" /> Close
            </button>
          </div>
          {!sel && <div className="text-sm text-white/60">Select a room to view it with a camera, get walking directions or teleport (if allowed). Select a desk to see who is sitting there.</div>}
          {zone && (
            <div className="space-y-3">
              <div>
                <div className="label">Room</div>
                <div className="text-lg font-bold">{zone.name}</div>
                <div className="text-xs text-white/50">{zone.nameVi}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                {ZONE_CAMERA[zone.id] && (
                  <button className="btn-ghost justify-start" onClick={() => (useGame.getState().setCamera('preset', ZONE_CAMERA[zone.id]!), close())}>
                    <Eye className="h-4 w-4" /> View with room camera
                  </button>
                )}
                {ROOM_NAV_TARGET[zone.id] && (
                  <button className="btn-primary justify-start" onClick={() => navigateToZone(zone.id)}>
                    <Navigation className="h-4 w-4" /> Show me the way
                  </button>
                )}
                {ROOM_NAV_TARGET[zone.id] && (
                  <button className="btn-ghost justify-start" disabled={!allowTeleport || !!useGame.getState().seatId} title={allowTeleport ? '' : 'Teleport is disabled by the administrator'} onClick={() => (net.teleport(zone.id), close())}>
                    <Sparkles className="h-4 w-4" /> Teleport {allowTeleport ? '' : '(disabled)'}
                  </button>
                )}
              </div>
              <div>
                <div className="label mb-1">People here ({inZone.length})</div>
                <div className="scrollbar-thin max-h-[260px] space-y-1 overflow-y-auto">
                  {inZone.map((p) => (
                    <div key={p.sid} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-xs">
                      <span>{p.name}</span>
                      {p.working && <span className="text-amber-300">working</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {desk && (
            <div className="space-y-3">
              <div>
                <div className="label">Desk</div>
                <div className="text-lg font-bold">
                  {desk.id} <span className="text-sm font-normal text-white/50">· Cluster {desk.cluster}, row {desk.row}</span>
                </div>
                <div className={`mt-1 text-sm ${deskOcc ? 'text-amber-300' : 'text-emerald-300'}`}>{deskOcc ? `In use by ${players[deskOcc]?.name ?? 'someone'}` : 'Available'}</div>
              </div>
              <button
                className="btn-primary w-full justify-start"
                onClick={() => {
                  const s = SEAT_BY_ID[desk.seatId];
                  useGame.getState().set({ navTarget: { label: s.label, points: [{ x: s.stand.x, z: s.stand.z }] }, mapOpen: false });
                }}
              >
                <MapPin className="h-4 w-4" /> Walk to this desk
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
