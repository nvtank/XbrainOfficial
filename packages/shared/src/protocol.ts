/** Network protocol between web client and the Colyseus office room. */
import type { EmoteName } from './constants';
import type { AvatarConfig } from './avatar';

export type ChatChannel = 'global' | 'nearby' | 'private' | 'meeting' | 'system';

/** Client → server message names. */
export const C2S = {
  Move: 'move',
  Sit: 'sit',
  Stand: 'stand',
  Chat: 'chat',
  Emote: 'emote',
  Interact: 'interact',
  Whiteboard: 'whiteboard',
  VoiceState: 'voice',
  Ping: 'ping',
  MyStats: 'mystats',
  Teleport: 'teleport',
  AvatarUpdated: 'avatarUpdated',
  CheckIn: 'checkin',
} as const;

/** Server → client message names. */
export const S2C = {
  Snapshot: 'snap',
  Chat: 'chat',
  Pong: 'pong',
  Correction: 'correction',
  Emote: 'emote',
  Stats: 'stats',
  Notice: 'notice',
  SeatResult: 'seatResult',
  Teleported: 'teleported',
  CheckInResult: 'checkinResult',
} as const;

/** Quantized transform: [sessionIndex, x*100, y*100, z*100, rotY*1000, anim]. */
export type SnapshotEntry = [number, number, number, number, number, number];

export interface SnapshotMsg {
  /** Server timestamp (ms). */
  t: number;
  /** Entries keyed by numeric player index (see Player.idx). */
  p: SnapshotEntry[];
}

export interface MoveMsg {
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
}

export interface ChatSendMsg {
  channel: Exclude<ChatChannel, 'system'>;
  text: string;
  /** Recipient session id for private messages. */
  to?: string;
}

export interface ChatMsg {
  id: string;
  channel: ChatChannel;
  from: string;
  fromUserId: string;
  fromName: string;
  to?: string;
  toName?: string;
  text: string;
  t: number;
}

export interface EmoteMsg {
  sid: string;
  name: EmoteName;
  t: number;
}

export interface SeatResultMsg {
  ok: boolean;
  seatId: string;
  action: 'sit' | 'stand';
  reason?: string;
}

export interface NoticeMsg {
  level: 'info' | 'warn' | 'error';
  text: string;
  code?: string;
}

export interface StatsMsg {
  /** Completed work time today (ms), excluding the current running segment. */
  todayMs: number;
  sessionsToday: number;
  weekMs: number;
  /** Part of the running timer already counted in todayMs (pause mode carry-over). */
  runningBaseMs: number;
}

export interface CheckInResultMsg {
  ok: boolean;
  /** Already checked in today (time = the first check-in). */
  already: boolean;
  name: string;
  /** Server timestamp of the check-in. */
  time: number;
  late: boolean;
  reason?: string;
}

/** Kiosk screen content shared with everyone (whiteboard map key "kiosk"). */
export interface KioskDisplay {
  name: string;
  time: number;
  late: boolean;
  already: boolean;
}

export type LeaderboardPeriod = 'today' | 'week' | 'month';

export interface LeaderboardEntry {
  userId: string;
  name: string;
  /** Work time in the period (ms), including the running session at `at`. */
  ms: number;
  sessions: number;
  /** Currently working → clients add (now - at) live. */
  working: boolean;
}

/** Replicated as JSON in OfficeState.leaderboard. */
export interface LeaderboardData {
  at: number;
  today: LeaderboardEntry[];
  week: LeaderboardEntry[];
  month: LeaderboardEntry[];
}

export interface InteractMsg {
  id: string;
  /** Optional action: 'next' for the TV slide. */
  action?: string;
}

export interface JoinOptions {
  token: string;
  /** Client build (for compatibility checks). */
  v?: string;
}

/** REST DTOs */
export interface PublicUser {
  id: string;
  displayName: string;
  role: 'member' | 'admin';
  avatar: AvatarConfig | null;
  createdAt: string;
}

export interface OfficeInfo {
  officeId: string;
  name: string;
  roomId: string | null;
  online: number;
  capacity: number;
  voice: { enabled: boolean; url?: string };
  allowTeleport: boolean;
  serverTime: number;
}

export interface VoiceTokenResponse {
  url: string;
  token: string;
  room: string;
  identity: string;
}
