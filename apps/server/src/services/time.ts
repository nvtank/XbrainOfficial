import { config } from '../config';

const offsetMs = () => config.tzOffsetMinutes * 60_000;

/** Start of the current office-local day (epoch ms). */
export function startOfDay(now = Date.now()): number {
  const d = new Date(now + offsetMs());
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - offsetMs();
}

/** Office-local calendar day key, e.g. "2026-11-06". */
export function dayKey(now = Date.now()): string {
  return new Date(now + offsetMs()).toISOString().slice(0, 10);
}

/** Minutes since local midnight (office timezone). */
export function localMinutes(now = Date.now()): number {
  const d = new Date(now + offsetMs());
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Start of the current office-local week (Monday 00:00). */
export function startOfWeek(now = Date.now()): number {
  const d = new Date(now + offsetMs());
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - dow * 86_400_000 - offsetMs();
}
