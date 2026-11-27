import { DayIndex } from '../types';

export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_NAMES_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * Formats seconds into mm:ss (e.g., 1199 -> "19:59", 3625 -> "60:25").
 */
export function formatDurationMMSS(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';
  const rounded = Math.round(totalSeconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats total seconds into human-readable hours & minutes (e.g., "3h 15m" or "42m").
 */
export function formatTotalTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0m';
  const totalMins = Math.round(totalSeconds / 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
}

/**
 * Calculates pace in seconds per kilometer.
 */
export function calcPaceSecPerKm(distanceKm: number, durationSec: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationSec)) return null;
  if (distanceKm <= 0 || durationSec <= 0) return null;
  return durationSec / distanceKm;
}

/**
 * Formats pace in min/km (e.g., 239.8 -> "4:00 /km" or "3:59 /km").
 */
export function formatPaceMinPerKm(paceSecPerKm: number | null, withUnit = true): string {
  if (paceSecPerKm === null || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) {
    return withUnit ? '— /km' : '—';
  }
  const rounded = Math.round(paceSecPerKm);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  return withUnit ? `${formatted} /km` : formatted;
}

/**
 * Converts pace (seconds per km) to speed (km/h).
 */
export function paceSecToSpeedKmh(paceSecPerKm: number | null): number | null {
  if (paceSecPerKm === null || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) {
    return null;
  }
  return 3600 / paceSecPerKm;
}

/**
 * Converts speed (km/h) to pace (seconds per km).
 */
export function speedKmhToPaceSec(speedKmh: number): number | null {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return null;
  return 3600 / speedKmh;
}

/**
 * Formats km/h speed with 1 decimal place.
 */
export function formatSpeedKmh(speedKmh: number | null, withUnit = true): string {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh <= 0) {
    return withUnit ? '— km/h' : '—';
  }
  const val = speedKmh.toFixed(1);
  return withUnit ? `${val} km/h` : val;
}

/**
 * Returns local YYYY-MM-DD string for a Date object.
 */
export function toISODateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses YYYY-MM-DD as local midnight Date.
 */
export function parseISODateLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Returns DayIndex (0 = Mon ... 6 = Sun) for a Date.
 */
export function getMondayBasedDayIndex(date: Date): DayIndex {
  const jsDay = date.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  return ((jsDay + 6) % 7) as DayIndex;
}

/**
 * Returns the Monday Date of the week containing `date`.
 */
export function getStartOfWeekMonday(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = getMondayBasedDayIndex(copy);
  copy.setDate(copy.getDate() - diff);
  return copy;
}

/**
 * Returns YYYY-MM-DD of the Monday for the week containing `date` (used as stable week key).
 */
export function getWeekKey(date: Date = new Date()): string {
  return toISODateLocal(getStartOfWeekMonday(date));
}

/**
 * Returns all 7 dates (Mon–Sun) for the week containing `referenceDate`.
 */
export function getWeekDates(referenceDate: Date = new Date()): Date[] {
  const monday = getStartOfWeekMonday(referenceDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/**
 * Formats a YYYY-MM-DD date nicely (e.g., "Thu, 26 Nov").
 */
export function formatDisplayDate(isoDate: string): string {
  const d = parseISODateLocal(isoDate);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Returns RPE description text.
 */
export function getRpeLabel(rpe: number): string {
  if (rpe <= 2) return 'Very Easy';
  if (rpe <= 4) return 'Easy / Aerobic';
  if (rpe <= 6) return 'Moderate / Steady';
  if (rpe <= 8) return 'Hard / Threshold';
  return 'Max Effort';
}

export interface HrZoneInfo {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  pctMax: number;
  minBpm: number;
  maxBpm: number;
}

/**
 * Returns standard 5-zone boundaries for a given Max HR.
 */
export function getHrZoneRanges(maxHrSetting: number): {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  minPct: number;
  maxPct: number;
  minBpm: number;
  maxBpm: number;
}[] {
  const safeMax = Math.max(120, Math.min(230, Math.round(maxHrSetting || 190)));
  return [
    { zone: 1, name: 'Recovery', minPct: 50, maxPct: 60, minBpm: Math.round(safeMax * 0.5), maxBpm: Math.round(safeMax * 0.6) },
    { zone: 2, name: 'Aerobic Base', minPct: 60, maxPct: 70, minBpm: Math.round(safeMax * 0.6) + 1, maxBpm: Math.round(safeMax * 0.7) },
    { zone: 3, name: 'Tempo', minPct: 70, maxPct: 80, minBpm: Math.round(safeMax * 0.7) + 1, maxBpm: Math.round(safeMax * 0.8) },
    { zone: 4, name: 'Threshold', minPct: 80, maxPct: 90, minBpm: Math.round(safeMax * 0.8) + 1, maxBpm: Math.round(safeMax * 0.9) },
    { zone: 5, name: 'VO2 Max', minPct: 90, maxPct: 100, minBpm: Math.round(safeMax * 0.9) + 1, maxBpm: safeMax },
  ];
}

/**
 * Computes HR Zone (1-5) and % of Max HR for a given bpm reading.
 */
export function getHrZone(bpm: number, maxHrSetting: number): HrZoneInfo | null {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  const safeMax = Math.max(120, Math.min(230, Math.round(maxHrSetting || 190)));
  const pctMax = Math.round((bpm / safeMax) * 100);
  const ranges = getHrZoneRanges(safeMax);

  let matched = ranges[0];
  if (pctMax >= 90) matched = ranges[4];
  else if (pctMax >= 80) matched = ranges[3];
  else if (pctMax >= 70) matched = ranges[2];
  else if (pctMax >= 60) matched = ranges[1];
  else matched = ranges[0];

  return {
    zone: matched.zone,
    name: matched.name,
    pctMax,
    minBpm: matched.minBpm,
    maxBpm: matched.maxBpm,
  };
}

