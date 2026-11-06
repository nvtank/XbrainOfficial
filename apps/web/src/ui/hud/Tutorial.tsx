/**
 * First-time onboarding: interactive steps that complete themselves when the player
 * actually does the thing (moves, turns the camera, checks in, sits, makes a face…),
 * plus a controls cheat sheet (F1 / "?") that can be opened any time.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, GraduationCap, Keyboard, Navigation, X } from 'lucide-react';
import { EMOTE_HOTKEYS, EMOTE_ICONS, EMOTE_LABELS, INTERACTABLE_BY_ID } from '@xbrain/shared';
import { useApp } from '../../stores/app';
import { useGame } from '../../stores/game';
import { useSettings, keyLabel, type KeyAction } from '../../stores/settings';
import { useWorld } from '../../stores/world';
import { runtime } from '../../game/runtime';

const doneKey = (uid?: string) => `xbrain.tutorial.done.${uid ?? 'guest'}`;

interface Step {
  id: string;
  title: string;
  body: (k: (a: KeyAction) => string) => React.ReactNode;
  /** Returns true when the player completed the step. */
  check?: (ctx: { start: { x: number; z: number; yaw: number }; myUserId?: string }) => boolean;
  action?: { label: string; run: () => void };
}

const Kbd = ({ children }: { children: React.ReactNode }) => <span className="kbd mx-0.5">{children}</span>;

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Chào mừng đến XBrain Virtual Office! 👋',
    body: () => (
      <>
        Đây là văn phòng XBrain Đà Nẵng phiên bản 3D. Bạn có thể đi lại, điểm danh, ngồi làm việc tính giờ, trò chuyện bằng chat hoặc giọng nói với đồng nghiệp ở gần. Làm theo vài bước ngắn dưới đây nhé —
        mỗi bước sẽ <b className="text-brand">tự hoàn thành</b> khi bạn làm đúng.
      </>
    ),
  },
  {
    id: 'move',
    title: '1 · Di chuyển',
    body: (k) => (
      <>
        Dùng <Kbd>{k('forward')}</Kbd>
        <Kbd>{k('left')}</Kbd>
        <Kbd>{k('back')}</Kbd>
        <Kbd>{k('right')}</Kbd> (hoặc phím mũi tên) để đi, giữ <Kbd>{k('run')}</Kbd> để chạy, <Kbd>{k('jump')}</Kbd> để nhảy. Hãy đi vào trong văn phòng qua cửa kính tự động.
      </>
    ),
    check: ({ start }) => Math.hypot(runtime.local.pos.x - start.x, runtime.local.pos.z - start.z) > 3,
  },
  {
    id: 'camera',
    title: '2 · Xoay camera',
    body: (k) => (
      <>
        <b>Giữ chuột và kéo</b> để xoay camera, <b>cuộn chuột</b> để phóng to/thu nhỏ. Bấm <Kbd>{k('camera')}</Kbd> để đổi giữa góc nhìn thứ ba và thứ nhất. Nút <b>Camera</b> ở thanh dưới có góc nhìn toàn cảnh, từng phòng và camera an ninh.
      </>
    ),
    check: ({ start }) => {
      let d = Math.abs(runtime.camYaw - start.yaw) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d > 0.6 || useGame.getState().cameraMode !== 'third';
    },
  },
  {
    id: 'checkin',
    title: '3 · Điểm danh khuôn mặt',
    body: (k) => (
      <>
        Máy <b>Face ID</b> nằm bên trái vách logo đen ở sảnh lễ tân. Đứng trước máy và bấm <Kbd>{k('interact')}</Kbd> để quét khuôn mặt (mô phỏng). Kết quả hiện trên <b>Attendance Dashboard</b> treo tường cạnh đó.
      </>
    ),
    check: ({ myUserId }) => !!(myUserId && useWorld.getState().attendance[myUserId]),
    action: {
      label: 'Chỉ đường tới máy điểm danh',
      run: () => {
        const it = INTERACTABLE_BY_ID.checkin;
        useGame.getState().set({ navTarget: { label: 'Face ID check-in', points: [{ x: it.x, z: it.z + 0.3 }] } });
      },
    },
  },
  {
    id: 'desk',
    title: '4 · Ngồi vào bàn & bắt đầu làm việc',
    body: (k) => (
      <>
        Bấm nút <b>Find desk</b> để được chỉ đường tới bàn trống gần nhất (đường kẻ cam trên sàn). Đến gần ghế và bấm <Kbd>{k('interact')}</Kbd> — đồng hồ <b>WORKING</b> sẽ chạy trên đầu bạn theo giờ server. Bấm <Kbd>{k('interact')}</Kbd> lần nữa để đứng dậy, <Kbd>{k('secondary')}</Kbd> để dùng máy tính.
      </>
    ),
    check: () => useGame.getState().seatPhase === 'seated' || useGame.getState().seatPhase === 'sitting',
  },
  {
    id: 'emote',
    title: '5 · Biểu cảm dễ thương',
    body: () => (
      <>
        Bấm phím số để thể hiện cảm xúc, mọi người đều thấy ngay:
        <div className="mt-2 grid grid-cols-5 gap-1">
          {EMOTE_HOTKEYS.map(([code, e]) => (
            <div key={e} className="rounded-lg bg-white/5 px-1 py-1 text-center text-[11px]">
              <div className="text-lg leading-none">{EMOTE_ICONS[e]}</div>
              <span className="kbd mt-0.5 scale-90">{keyLabel(code)}</span>
              <div className="text-white/60">{EMOTE_LABELS[e]}</div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-xs text-white/50">Thêm emote (chào, cổ vũ, nhảy…) trong nút Emotes. Gõ “haha” hoặc “huhu” trong chat cũng tự đổi biểu cảm.</div>
      </>
    ),
    check: () => !!runtime.local.emote,
  },
  {
    id: 'talk',
    title: '6 · Trò chuyện',
    body: (k) => (
      <>
        Bấm <Kbd>{k('chat')}</Kbd> để chat (Global, Nearby ~10 m, Meeting, Private). Bấm <Kbd>{k('mic')}</Kbd> để bật mic, hoặc bật push-to-talk trong Settings và giữ <Kbd>{k('ptt')}</Kbd> để nói. Giọng nói nghe rõ trong 3 m, nhỏ dần tới 12 m, phòng kín sẽ cách âm.
      </>
    ),
    check: () => useGame.getState().chatFocused,
  },
  {
    id: 'more',
    title: '7 · Còn nữa…',
    body: (k) => (
      <>
        <Kbd>{k('map')}</Kbd> bản đồ & chỉ đường · <Kbd>{k('dashboard')}</Kbd> trạng thái văn phòng · <Kbd>{k('hideUi')}</Kbd> ẩn giao diện để chụp ảnh · <Kbd>{k('menu')}</Kbd> cài đặt (đồ hoạ, phím, micro, nhân vật).
        <div className="mt-2">
          Mở lại hướng dẫn và bảng phím tắt bất cứ lúc nào bằng <Kbd>F1</Kbd> hoặc nút <b>?</b> ở góc trên bên phải. Chúc bạn làm việc vui vẻ! 🧡
        </div>
      </>
    ),
  },
];

export function Tutorial() {
  const user = useApp((s) => s.user);
  const keys = useSettings((s) => s.keys);
  const open = useGame((s) => s.tutorialOpen);
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const start = useRef({ x: 0, z: 0, yaw: 0 });
  const k = (a: KeyAction) => keyLabel(keys[a]);

  // Show automatically the first time this account enters the office.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(doneKey(user?.id)) === '1';
    } catch {
      /* ignore */
    }
    if (!seen) {
      const t = setTimeout(() => useGame.getState().set({ tutorialOpen: true }), 1200);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  // Reset the baseline whenever a step starts.
  useEffect(() => {
    start.current = { x: runtime.local.pos.x, z: runtime.local.pos.z, yaw: runtime.camYaw };
  }, [i, open]);

  // Auto-complete steps by watching what the player does.
  useEffect(() => {
    if (!open) return;
    const step = STEPS[i];
    if (!step.check || done[step.id]) return;
    const id = setInterval(() => {
      const me = useWorld.getState().selfSid ? useWorld.getState().players[useWorld.getState().selfSid!] : undefined;
      if (step.check!({ start: start.current, myUserId: me?.userId })) {
        setDone((d) => ({ ...d, [step.id]: true }));
        setTimeout(() => setI((x) => Math.min(STEPS.length - 1, x + 1)), 900);
      }
    }, 250);
    return () => clearInterval(id);
  }, [i, open, done]);

  const finish = () => {
    try {
      localStorage.setItem(doneKey(user?.id), '1');
    } catch {
      /* ignore */
    }
    useGame.getState().set({ tutorialOpen: false });
    setI(0);
  };

  const step = STEPS[i];
  const isDone = !!done[step.id];
  return (
    <AnimatePresence>
      {open && (
        <div key="tut" className="pointer-events-none fixed inset-x-0 top-14 z-20 flex justify-center px-4">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="pointer-events-auto w-[min(560px,92vw)]">
          <div className="glass overflow-hidden border-brand/40">
            <div className="flex items-center gap-2 bg-gradient-to-r from-brand-deep/80 to-brand/60 px-4 py-2 text-xs font-bold tracking-wider text-black">
              <GraduationCap className="h-4 w-4" /> HƯỚNG DẪN · {i + 1}/{STEPS.length}
              <div className="ml-auto flex gap-1">
                {STEPS.map((s, n) => (
                  <span key={s.id} className={`h-1.5 w-4 rounded-full ${n === i ? 'bg-black' : done[s.id] || n < i ? 'bg-black/50' : 'bg-black/20'}`} />
                ))}
              </div>
              <button className="ml-2 rounded p-0.5 hover:bg-black/15" title="Bỏ qua hướng dẫn" onClick={finish}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={step.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-5 py-4">
                <div className="flex items-center gap-2 text-base font-extrabold">
                  {step.title}
                  {isDone && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                      <Check className="h-3 w-3" /> Xong!
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-white/85">{step.body(k)}</div>
                {step.check && !isDone && <div className="mt-2 text-xs italic text-brand-yellow/90">Hãy thử ngay — bước này tự hoàn thành khi bạn làm xong.</div>}
              </motion.div>
            </AnimatePresence>
            <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
              <button className="btn-ghost py-1.5 text-xs" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))}>
                <ChevronLeft className="h-4 w-4" /> Trước
              </button>
              {step.action && (
                <button className="btn-ghost py-1.5 text-xs" onClick={step.action.run}>
                  <Navigation className="h-3.5 w-3.5" /> {step.action.label}
                </button>
              )}
              <button className="ml-auto text-xs text-white/50 hover:text-white" onClick={finish}>
                Bỏ qua
              </button>
              {i < STEPS.length - 1 ? (
                <button className="btn-primary py-1.5 text-xs" onClick={() => setI((x) => x + 1)}>
                  {step.check && !isDone ? 'Bỏ qua bước này' : 'Tiếp'} <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button className="btn-primary py-1.5 text-xs" onClick={finish}>
                  Bắt đầu làm việc! <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Controls cheat sheet (F1 / "?"). */
export function HelpPanel() {
  const open = useGame((s) => s.helpOpen);
  const keys = useSettings((s) => s.keys);
  const close = () => useGame.getState().set({ helpOpen: false });
  const rows: Array<[string, React.ReactNode]> = [
    ['Di chuyển', <>{['forward', 'left', 'back', 'right'].map((a) => <Kbd key={a}>{keyLabel(keys[a as KeyAction])}</Kbd>)} / phím mũi tên</>],
    ['Chạy · Nhảy', <><Kbd>{keyLabel(keys.run)}</Kbd> · <Kbd>{keyLabel(keys.jump)}</Kbd></>],
    ['Tương tác / ngồi / đứng dậy', <Kbd>{keyLabel(keys.interact)}</Kbd>],
    ['Dùng máy tính · slide tiếp', <Kbd>{keyLabel(keys.secondary)}</Kbd>],
    ['Xoay camera · zoom', <>Kéo chuột · cuộn chuột</>],
    ['Đổi góc nhìn / về nhân vật', <Kbd>{keyLabel(keys.camera)}</Kbd>],
    ['Biểu cảm', <>Phím <Kbd>1</Kbd>…<Kbd>0</Kbd> · menu <Kbd>{keyLabel(keys.emote)}</Kbd></>],
    ['Chat', <Kbd>{keyLabel(keys.chat)}</Kbd>],
    ['Mic · Push-to-talk', <><Kbd>{keyLabel(keys.mic)}</Kbd> · giữ <Kbd>{keyLabel(keys.ptt)}</Kbd></>],
    ['Bản đồ · Trạng thái', <><Kbd>{keyLabel(keys.map)}</Kbd> · <Kbd>{keyLabel(keys.dashboard)}</Kbd></>],
    ['Ẩn UI · Hiệu năng', <><Kbd>{keyLabel(keys.hideUi)}</Kbd> · <Kbd>{keyLabel(keys.perf)}</Kbd></>],
    ['Cài đặt · đóng bảng', <Kbd>{keyLabel(keys.menu)}</Kbd>],
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="help" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6 text-white backdrop-blur-sm" onClick={close}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="glass w-[min(640px,96vw)] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-extrabold">
                <Keyboard className="h-5 w-5 text-brand" /> Hướng dẫn & phím tắt
              </div>
              <button className="btn-ghost" onClick={close}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {rows.map(([l, v]) => (
                <div key={l} className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-sm">
                  <span className="text-white/75">{l}</span>
                  <span className="shrink-0">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/55">
              Mẹo: ngồi vào bàn để bắt đầu tính giờ · điểm danh ở máy Face ID cạnh lễ tân · đổi phím trong Settings → Controls.
              <button
                className="btn-primary ml-auto"
                onClick={() => {
                  close();
                  useGame.getState().set({ tutorialOpen: true });
                }}
              >
                <GraduationCap className="h-4 w-4" /> Xem lại hướng dẫn từng bước
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
