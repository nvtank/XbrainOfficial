import { config } from '../config';

const offsetMs = () => config.tzOffsetMinutes * 60_000;

/** Start of the current office-local day (epoch ms). */
export function startOfDay(now = Date.now()): number {
  const d = new Date(now + offsetMs());
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - offsetMs();
}

/** Start of the current office-local week (Monday 00:00). */
export function startOfWeek(now = Date.now()): number {
  const d = new Date(now + offsetMs());
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - dow * 86_400_000 - offsetMs();
}
