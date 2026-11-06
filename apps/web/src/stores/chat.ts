import { create } from 'zustand';
import type { ChatChannel, ChatMsg } from '@xbrain/shared';

export type ChatTab = 'global' | 'nearby' | 'meeting' | 'private';

interface ChatState {
  messages: ChatMsg[];
  tab: ChatTab;
  privateTo: string | null;
  unread: number;
  /** Speech bubbles: sid → { text, until }. */
  bubbles: Record<string, { text: string; until: number }>;
  add: (m: ChatMsg) => void;
  system: (text: string) => void;
  set: (patch: Partial<ChatState>) => void;
}

let sysId = 0;

export const useChat = create<ChatState>((set) => ({
  messages: [],
  tab: 'global',
  privateTo: null,
  unread: 0,
  bubbles: {},
  add: (m) => set((s) => ({ messages: [...s.messages.slice(-199), m] })),
  system: (text) =>
    set((s) => ({
      messages: [
        ...s.messages.slice(-199),
        { id: `sys-${sysId++}`, channel: 'system' as ChatChannel, from: '', fromUserId: '', fromName: 'XBrain', text, t: Date.now() },
      ],
    })),
  set: (patch) => set(patch),
}));
