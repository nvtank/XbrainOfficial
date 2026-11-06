import { create } from 'zustand';
import type { Vec2, ZoneId } from '@xbrain/shared';

export type CameraMode = 'third' | 'first' | 'overview' | 'preset';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface InteractPrompt {
  id: string;
  label: string;
  verb: string;
  key: string;
  secondary?: { verb: string; key: string };
  disabled?: string;
}

export interface Toast {
  id: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'chat';
  text: string;
  title?: string;
}

export interface NavTarget {
  label: string;
  points: Vec2[];
  zone?: ZoneId;
}

interface GameState {
  cameraMode: CameraMode;
  cameraPreset: string | null;
  /** Camera mode to return to when leaving overview/preset. */
  followMode: 'third' | 'first';
  hudHidden: boolean;
  chatOpen: boolean;
  chatFocused: boolean;
  mapOpen: boolean;
  settingsOpen: boolean;
  settingsTab: string;
  dashboardOpen: boolean;
  onlineOpen: boolean;
  emoteOpen: boolean;
  computerOpen: boolean;
  whiteboardOpen: string | null;
  prompt: InteractPrompt | null;
  /** Local seat state. */
  seatId: string | null;
  seatPhase: 'none' | 'requesting' | 'sitting' | 'seated' | 'standing';
  navTarget: NavTarget | null;
  highlightZone: ZoneId | null;
  connection: ConnectionState;
  pointerLocked: boolean;
  ping: number;
  toasts: Toast[];
  set: (patch: Partial<GameState>) => void;
  toast: (level: Toast['level'], text: string, title?: string) => void;
  dismissToast: (id: number) => void;
  setCamera: (mode: CameraMode, preset?: string | null) => void;
  /** Any modal panel that should block gameplay keys. */
  anyModal: () => boolean;
}

let toastId = 1;

export const useGame = create<GameState>((set, get) => ({
  cameraMode: 'third',
  cameraPreset: null,
  followMode: 'third',
  hudHidden: false,
  chatOpen: true,
  chatFocused: false,
  mapOpen: false,
  settingsOpen: false,
  settingsTab: 'graphics',
  dashboardOpen: true,
  onlineOpen: false,
  emoteOpen: false,
  computerOpen: false,
  whiteboardOpen: null,
  prompt: null,
  seatId: null,
  seatPhase: 'none',
  navTarget: null,
  highlightZone: null,
  connection: 'connecting',
  pointerLocked: false,
  ping: 0,
  toasts: [],
  set: (patch) => set(patch),
  toast: (level, text, title) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, level, text, title }] }));
    setTimeout(() => get().dismissToast(id), level === 'error' ? 7000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setCamera: (mode, preset = null) =>
    set((s) => ({
      cameraMode: mode,
      cameraPreset: mode === 'preset' ? preset : null,
      followMode: mode === 'third' || mode === 'first' ? mode : s.followMode,
    })),
  anyModal: () => {
    const s = get();
    return s.settingsOpen || s.mapOpen || s.computerOpen || !!s.whiteboardOpen || s.chatFocused;
  },
}));
