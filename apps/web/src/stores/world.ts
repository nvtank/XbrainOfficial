/** UI-facing mirror of the replicated office state (updated in batches from the network layer). */
import { create } from 'zustand';
import { sanitizeAvatar, type AvatarConfig, type LeaderboardData, type StatsMsg, type ZoneId } from '@xbrain/shared';

export interface PlayerView {
  sid: string;
  idx: number;
  userId: string;
  name: string;
  avatar: AvatarConfig;
  avatarKey: string;
  role: string;
  seatId: string;
  working: boolean;
  workSegmentStart: number;
  workAccumMs: number;
  online: boolean;
  micOn: boolean;
  muted: boolean;
  zone: ZoneId;
  joinedAt: number;
}

export interface AttendanceView {
  userId: string;
  name: string;
  time: number;
  late: boolean;
}

interface WorldState {
  selfSid: string | null;
  players: Record<string, PlayerView>;
  seats: Record<string, string>;
  objects: Record<string, number>;
  boards: Record<string, string>;
  officeName: string;
  capacity: number;
  allowTeleport: boolean;
  stats: StatsMsg | null;
  statsAt: number;
  speaking: Record<string, boolean>;
  attendance: Record<string, AttendanceView>;
  attendanceDay: string;
  activeWeek: number;
  lateAfter: number;
  leaderboard: LeaderboardData | null;
  set: (patch: Partial<WorldState>) => void;
  reset: () => void;
}

const empty = {
  selfSid: null,
  players: {},
  seats: {},
  objects: {},
  boards: {},
  officeName: 'XBrain Office',
  capacity: 50,
  allowTeleport: false,
  stats: null,
  statsAt: 0,
  speaking: {},
  attendance: {},
  attendanceDay: '',
  activeWeek: 0,
  lateAfter: 540,
  leaderboard: null,
};

export const useWorld = create<WorldState>((set) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(empty),
}));

export function parseAvatar(json: string): AvatarConfig {
  try {
    return sanitizeAvatar(JSON.parse(json || '{}'));
  } catch {
    return sanitizeAvatar({});
  }
}

export const selfPlayer = () => {
  const s = useWorld.getState();
  return s.selfSid ? s.players[s.selfSid] : undefined;
};
