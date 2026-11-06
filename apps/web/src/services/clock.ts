/** Server clock estimation (NTP-style) so timers are driven by server timestamps, not local counters. */
const samples: Array<{ offset: number; rtt: number }> = [];
let offset = 0;
let rtt = 0;

export function addClockSample(clientSentAt: number, serverTime: number) {
  const now = Date.now();
  const r = now - clientSentAt;
  if (r < 0 || r > 10_000) return;
  samples.push({ offset: serverTime + r / 2 - now, rtt: r });
  if (samples.length > 9) samples.shift();
  // Use the offsets of the lowest-RTT half (more accurate).
  const best = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.max(1, Math.ceil(samples.length / 2)));
  offset = best.reduce((s, x) => s + x.offset, 0) / best.length;
  rtt = r;
}

export const serverNow = () => Date.now() + offset;
export const clockRtt = () => rtt;
export const setRoughOffset = (serverTime: number) => {
  if (!samples.length) offset = serverTime - Date.now();
};

export function formatHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function workElapsed(p: { working: boolean; workAccumMs: number; workSegmentStart: number }): number {
  if (!p.working) return 0;
  return p.workAccumMs + (p.workSegmentStart ? Math.max(0, serverNow() - p.workSegmentStart) : 0);
}
