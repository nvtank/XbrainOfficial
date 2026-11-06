import type { AvatarConfig, OfficeInfo, PublicUser, VoiceTokenResponse } from '@xbrain/shared';
import { useApp, type ServerConfig } from '../stores/app';

/** Game server base URL (REST + WebSocket). */
export function serverHttpUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  // Dev: Vite proxies /api; production single-container: same origin.
  return '';
}

export function serverWsUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/^http/, 'ws').replace(/\/$/, '');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // In dev the page is served by Vite (5173) and the game server listens on 2567.
  if (import.meta.env.DEV) return `${proto}://${location.hostname}:${import.meta.env.VITE_SERVER_PORT || 2567}`;
  return `${proto}://${location.host}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const token = useApp.getState().token;
  const res = await fetch(`${serverHttpUrl()}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'http_error', data.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  config: () => request<ServerConfig>('GET', '/config'),
  guest: (displayName: string, avatar: AvatarConfig) => request<{ token: string; user: PublicUser }>('POST', '/auth/guest', { displayName, avatar }),
  me: () => request<{ user: PublicUser }>('GET', '/me'),
  updateMe: (displayName: string) => request<{ user: PublicUser }>('PUT', '/me', { displayName }),
  saveAvatar: (avatar: AvatarConfig) => request<{ user: PublicUser }>('PUT', '/me/avatar', { avatar }),
  office: () => request<OfficeInfo>('GET', '/office'),
  voiceToken: (sessionId: string) => request<VoiceTokenResponse>('GET', `/voice/token?sessionId=${encodeURIComponent(sessionId)}`),
  officeStats: () => request<{ online: number; working: number; desksUsed: number; capacity: number }>('GET', '/stats/office'),
  admin: {
    status: (t: string) => request<AdminStatus>('GET', '/admin/status', undefined, { 'x-admin-token': t }),
    sessions: (t: string) => request<{ sessions: AdminSession[] }>('GET', '/admin/sessions', undefined, { 'x-admin-token': t }),
    kick: (t: string, sessionId: string, reason?: string) => request('POST', '/admin/kick', { sessionId, reason }, { 'x-admin-token': t }),
    mute: (t: string, sessionId: string, muted: boolean, minutes = 15) => request('POST', '/admin/mute', { sessionId, muted, minutes }, { 'x-admin-token': t }),
    capacity: (t: string, capacity: number) => request('POST', '/admin/capacity', { capacity }, { 'x-admin-token': t }),
    teleport: (t: string, allow: boolean) => request('POST', '/admin/teleport', { allow }, { 'x-admin-token': t }),
  },
};

export interface AdminPlayer {
  sessionId: string;
  userId: string;
  name: string;
  role: string;
  zone: string;
  seatId: string | null;
  working: boolean;
  workMs: number;
  online: boolean;
  micOn: boolean;
  muted: boolean;
  position: { x: number; z: number };
  violations: number;
}

export interface AdminStatus {
  uptimeSec: number;
  node: string;
  store: string;
  voice: boolean;
  cpuPercent: number;
  memory: { rssMB: number; heapUsedMB: number };
  loadavg: number[];
  office: { online: number; present: number; working: number; desksUsed: number; capacity: number; clients: number; allowTeleport: boolean; roomId: string } | null;
  players: AdminPlayer[];
}

export interface AdminSession {
  id: string;
  userId: string;
  displayName: string;
  deskId: string;
  startedAt: string;
  endedAt: string | null;
  activeMs: number;
  endReason: string | null;
}
