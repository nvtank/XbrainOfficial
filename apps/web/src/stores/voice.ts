import { create } from 'zustand';

export type VoiceStatus = 'off' | 'unavailable' | 'connecting' | 'connected' | 'error';

interface VoiceState {
  status: VoiceStatus;
  statusText: string;
  micOn: boolean;
  pttHeld: boolean;
  permission: 'unknown' | 'granted' | 'denied';
  inputLevel: number;
  devices: MediaDeviceInfo[];
  /** Per-user local volume (0–2) and local mute, keyed by sessionId. */
  userVolume: Record<string, number>;
  localMuted: Record<string, boolean>;
  /** Users currently audible (subscribed + gain > 0). */
  audible: Record<string, number>;
  set: (patch: Partial<VoiceState>) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  status: 'off',
  statusText: '',
  micOn: false,
  pttHeld: false,
  permission: 'unknown',
  inputLevel: 0,
  devices: [],
  userVolume: {},
  localMuted: {},
  audible: {},
  set: (patch) => set(patch),
}));
