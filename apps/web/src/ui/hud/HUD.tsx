import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Expand, LogOut, Settings, Users } from 'lucide-react';
import { EMOTES } from '@xbrain/shared';
import { useApp } from '../../stores/app';
import { useGame } from '../../stores/game';
import { useSettings } from '../../stores/settings';
import { useWorld } from '../../stores/world';
import { useVoiceStore } from '../../stores/voice';
import { input } from '../../game/controls/input';
import { net } from '../../services/network';
import { voice } from '../../services/voice';
import { Logo } from '../LoadingScreen';
import { ChatPanel } from './Chat';
import { Toolbar } from './Toolbar';
import { BigMap, MiniMap } from './Map';
import { Dashboard } from './Dashboard';
import { SettingsModal } from './Settings';
import { ComputerUI, ConnectionOverlay, InteractionPrompt, OnlineList, PerfOverlay, PointerHint, Toasts, WhiteboardUI } from './Panels';

function useHotkeys() {
  useEffect(() => {
    const g = () => useGame.getState();
    const offs = [
      input.onPress('camera', () => {
        const s = g();
        if (s.anyModal()) return;
        if (s.cameraMode === 'overview' || s.cameraMode === 'preset') s.setCamera(s.followMode);
        else s.setCamera(s.cameraMode === 'third' ? 'first' : 'third');
      }),
      input.onPress('map', () => {
        const s = g();
        if (s.chatFocused || s.settingsOpen) return;
        s.set({ mapOpen: !s.mapOpen });
      }),
      input.onPress('chat', (e) => {
        e.preventDefault();
        g().set({ chatOpen: true, chatFocused: true });
      }),
      input.onPress('menu', () => {
        const s = g();
        if (s.mapOpen || s.computerOpen || s.whiteboardOpen || s.onlineOpen || s.emoteOpen) {
          s.set({ mapOpen: false, computerOpen: false, whiteboardOpen: null, onlineOpen: false, emoteOpen: false });
        } else if (s.settingsOpen) s.set({ settingsOpen: false });
        else if (s.cameraMode === 'overview' || s.cameraMode === 'preset') s.setCamera(s.followMode);
        else s.set({ settingsOpen: true });
      }),
      input.onPress('mic', () => {
        if (useSettings.getState().pushToTalk) return;
        void voice.setMic(!useVoiceStore.getState().micOn);
      }),
      input.onPress('ptt', () => useSettings.getState().pushToTalk && void voice.ptt(true)),
      input.onRelease('ptt', () => useSettings.getState().pushToTalk && void voice.ptt(false)),
      input.onPress('emote', () => g().set({ emoteOpen: !g().emoteOpen })),
      input.onPress('dashboard', () => g().set({ dashboardOpen: !g().dashboardOpen })),
      input.onPress('hideUi', () => g().set({ hudHidden: !g().hudHidden })),
      input.onPress('perf', () => useSettings.getState().set({ showFps: !useSettings.getState().showFps })),
    ];
    const onDigit = (e: KeyboardEvent) => {
      if (!g().emoteOpen || !/^Digit[1-7]$/.test(e.code)) return;
      const name = EMOTES[Number(e.code.slice(5)) - 1];
      if (name) net.emote(name);
      g().set({ emoteOpen: false });
    };
    window.addEventListener('keydown', onDigit);
    return () => {
      offs.forEach((o) => o());
      window.removeEventListener('keydown', onDigit);
    };
  }, []);
}

function TopLeft() {
  const officeName = useWorld((s) => s.officeName);
  const online = useWorld((s) => Object.keys(s.players).length);
  const capacity = useWorld((s) => s.capacity);
  const ping = useGame((s) => s.ping);
  return (
    <div className="pointer-events-auto flex flex-col gap-3">
      <div className="glass flex items-center gap-3 px-3 py-2.5">
        <div className="rounded-xl bg-white px-2.5 py-1.5">
          <Logo className="h-6" />
        </div>
        <div className="pr-1">
          <div className="text-[13px] font-bold leading-tight">{officeName}</div>
          <div className="flex items-center gap-2 text-[11px] text-white/60">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              {online}/{capacity} online
            </span>
            <span className="font-mono">{ping ? `${ping} ms` : ''}</span>
          </div>
        </div>
      </div>
      <Dashboard />
    </div>
  );
}

function TopRight() {
  const user = useApp((s) => s.user);
  const avatar = user?.avatar;
  const onlineOpen = useGame((s) => s.onlineOpen);
  const count = useWorld((s) => Object.keys(s.players).length);
  return (
    <div className="glass pointer-events-auto flex items-center gap-1 p-1.5">
      <button className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/10" title="Edit avatar" onClick={() => useApp.getState().set({ editingInGame: true })}>
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-brand text-xs font-bold" style={{ background: avatar?.topColor ?? '#444' }}>
          <span className="h-4 w-4 rounded-full" style={{ background: avatar?.skin ?? '#ddd' }} />
        </span>
        <span className="max-w-[140px] truncate text-sm font-semibold">{user?.displayName}</span>
      </button>
      <button className={`btn-ghost h-9 border-0 ${onlineOpen ? 'bg-white/15' : ''}`} title="People online" onClick={() => useGame.getState().set({ onlineOpen: !onlineOpen })}>
        <Users className="h-4 w-4" /> <span className="text-xs">{count}</span>
      </button>
      <button className="btn-ghost h-9 w-9 border-0 p-0" title="Settings (Esc)" onClick={() => useGame.getState().set({ settingsOpen: true })}>
        <Settings className="h-4 w-4" />
      </button>
      <button
        className="btn-ghost h-9 w-9 border-0 p-0"
        title="Fullscreen"
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
      >
        <Expand className="h-4 w-4" />
      </button>
      <button
        className="btn-ghost h-9 w-9 border-0 p-0 hover:bg-red-500/30"
        title="Leave office"
        onClick={async () => {
          await net.leave();
          useApp.getState().set({ phase: 'creator' });
        }}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function HUD() {
  useHotkeys();
  const hidden = useGame((s) => s.hudHidden);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const mapOpen = useGame((s) => s.mapOpen);
  return (
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.div key="hud" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-10 select-none text-white">
            <div className="absolute left-4 top-4">
              <TopLeft />
            </div>
            <div className="absolute right-4 top-4 flex flex-col items-end gap-3">
              <TopRight />
              <OnlineList />
            </div>
            <div className="absolute bottom-4 left-4 flex w-[380px] max-w-[42vw] flex-col gap-2">
              <Toasts />
              <ChatPanel />
            </div>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
              <InteractionPrompt />
              <Toolbar />
            </div>
            <div className="absolute bottom-4 right-4">
              <MiniMap />
            </div>
            <PointerHint />
          </motion.div>
        )}
      </AnimatePresence>
      {hidden && (
        <button className="fixed right-4 top-4 z-10 rounded-lg bg-black/40 px-3 py-1.5 text-xs text-white/70 backdrop-blur hover:bg-black/60" onClick={() => useGame.getState().set({ hudHidden: false })}>
          Photo mode · press H to show UI
        </button>
      )}
      <AnimatePresence>{settingsOpen && <SettingsModal key="settings" />}</AnimatePresence>
      <AnimatePresence>{mapOpen && <BigMap key="map" />}</AnimatePresence>
      <ComputerUI />
      <WhiteboardUI />
      <ConnectionOverlay />
      <PerfOverlay />
    </>
  );
}
