import { create } from 'zustand';
import type { AvatarConfig, OfficeInfo, PublicUser } from '@xbrain/shared';

export type AppPhase = 'boot' | 'creator' | 'joining' | 'game' | 'full' | 'fatal' | 'admin';

export interface BootStep {
  id: string;
  label: string;
  done: boolean;
}

export interface ServerConfig {
  officeId: string;
  name: string;
  capacity: number;
  voice: { enabled: boolean; url?: string };
  allowTeleport: boolean;
  store: 'postgres' | 'memory';
  serverTime: number;
}

interface AppState {
  phase: AppPhase;
  steps: BootStep[];
  error: string | null;
  token: string | null;
  user: PublicUser | null;
  /** Draft avatar while in the creator (not yet saved). */
  draft: AvatarConfig | null;
  serverConfig: ServerConfig | null;
  office: OfficeInfo | null;
  /** Avatar editor opened from inside the game. */
  editingInGame: boolean;
  setPhase: (phase: AppPhase) => void;
  setStep: (id: string, label: string, done?: boolean) => void;
  set: (patch: Partial<AppState>) => void;
}

export const useApp = create<AppState>((set) => ({
  phase: window.location.hash.startsWith('#/admin') ? 'admin' : 'boot',
  steps: [],
  error: null,
  token: localStorage.getItem('xbrain.token'),
  user: null,
  draft: null,
  serverConfig: null,
  office: null,
  editingInGame: false,
  setPhase: (phase) => set({ phase }),
  setStep: (id, label, done = false) =>
    set((s) => {
      const exists = s.steps.find((x) => x.id === id);
      return { steps: exists ? s.steps.map((x) => (x.id === id ? { id, label, done } : x)) : [...s.steps, { id, label, done }] };
    }),
  set: (patch) => set(patch),
}));
