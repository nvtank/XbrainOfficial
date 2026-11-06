import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_VOICE_RANGES, type VoiceRanges } from '@xbrain/shared';

export type Quality = 'low' | 'medium' | 'high';
export type TimeOfDay = 'auto' | 'day' | 'sunset' | 'night';

export const KEY_ACTIONS = [
  'forward', 'back', 'left', 'right', 'run', 'jump', 'interact', 'secondary', 'camera', 'map', 'chat', 'menu',
  'ptt', 'mic', 'emote', 'dashboard', 'leaderboard', 'hideUi', 'perf',
] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Move left',
  right: 'Move right',
  run: 'Run (hold)',
  jump: 'Jump',
  interact: 'Interact / Sit / Stand',
  secondary: 'Secondary action (computer, next slide)',
  camera: 'Switch camera',
  map: 'Office map',
  chat: 'Open chat',
  menu: 'Menu / Settings',
  ptt: 'Push-to-talk (hold)',
  mic: 'Toggle microphone',
  emote: 'Emotes',
  dashboard: 'Office status dashboard',
  leaderboard: 'Leaderboard (Hall of Fame)',
  hideUi: 'Hide UI (photo mode)',
  perf: 'Performance monitor',
};

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  jump: 'Space',
  interact: 'KeyE',
  secondary: 'KeyF',
  camera: 'KeyC',
  map: 'KeyM',
  chat: 'Enter',
  menu: 'Escape',
  ptt: 'KeyV',
  mic: 'KeyT',
  emote: 'KeyG',
  dashboard: 'KeyB',
  leaderboard: 'KeyL',
  hideUi: 'KeyH',
  perf: 'Backquote',
};

export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
    Space: 'Space', Enter: 'Enter', Escape: 'Esc', Backquote: '`', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return map[code] ?? code;
}

export interface SettingsState {
  quality: Quality;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  masterVolume: number;
  voiceVolume: number;
  effectsVolume: number;
  micDeviceId: string;
  pushToTalk: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  voiceRanges: VoiceRanges;
  keys: Record<KeyAction, string>;
  avatarCollision: boolean;
  showFps: boolean;
  showNames: boolean;
  timeOfDay: TimeOfDay;
  autoDeskCamera: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setKey' | 'resetKeys'>>) => void;
  setKey: (action: KeyAction, code: string) => void;
  resetKeys: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: 'medium',
      mouseSensitivity: 1,
      invertY: false,
      fov: 60,
      masterVolume: 0.9,
      voiceVolume: 1,
      effectsVolume: 0.6,
      micDeviceId: '',
      pushToTalk: false,
      noiseSuppression: true,
      echoCancellation: true,
      voiceRanges: DEFAULT_VOICE_RANGES,
      keys: DEFAULT_KEYS,
      avatarCollision: true,
      showFps: false,
      showNames: true,
      timeOfDay: 'auto',
      autoDeskCamera: true,
      set: (patch) => set(patch),
      setKey: (action, code) => set((s) => ({ keys: { ...s.keys, [action]: code } })),
      resetKeys: () => set({ keys: DEFAULT_KEYS }),
    }),
    {
      name: 'xbrain.settings.v1',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, keys: { ...DEFAULT_KEYS, ...(p.keys ?? {}) }, voiceRanges: { ...DEFAULT_VOICE_RANGES, ...(p.voiceRanges ?? {}) } };
      },
    },
  ),
);
