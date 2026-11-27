import { AppData, PlannedSession, Shoe, WorkoutLog } from '../types';
import { getWeekKey, toISODateLocal } from './metrics';

export const STORAGE_KEY = 'stridemetric_data_v1';
export const THEME_KEY = 'stridemetric_theme';
export const MAX_WEEKLY_PLAN_DAYS = 4;

export const DEFAULT_SHOES: Shoe[] = [
  {
    id: 'shoe-gt2000-12',
    name: 'ASICS GT-2000 12',
    role: 'Daily Trainer · Easy & Steady',
    initialKm: 112.5,
    maxKm: 700,
  },
  {
    id: 'shoe-superblast-3',
    name: 'ASICS Superblast 3',
    role: 'Tempo · Threshold & Race',
    initialKm: 48.0,
    maxKm: 600,
  },
];

export const DEFAULT_WEEKLY_PLAN: PlannedSession[] = [
  {
    id: 'plan-tue-intervals',
    dayIndex: 1, // Tuesday
    category: 'Running',
    defaultActivity: 'Outdoor Run',
    title: '5K Threshold Intervals',
    targetDistanceKm: 7,
    targetDurationMin: 35,
    targetPaceLabel: '4:10–4:20 /km',
    checklist: [
      '1.5 km easy warm-up + dynamic leg swings',
      '4 × 1 km at target threshold pace (90s jog recovery)',
      '1.5 km cool-down jog',
    ],
    notes: 'Keep cadence crisp and relaxed. On treadmill, use 1.0% incline at 14.0–14.4 km/h.',
  },
  {
    id: 'plan-thu-cycling',
    dayIndex: 3, // Thursday
    category: 'Indoor Cycling',
    defaultActivity: 'Indoor Bike',
    title: 'Zone 2 Aerobic Base Ride',
    targetDistanceKm: 20,
    targetDurationMin: 45,
    targetPaceLabel: '85–90 rpm · Easy',
    checklist: [
      '10 min easy spin warm-up',
      '30 min steady Zone 2 aerobic cadence (conversational)',
      '5 min cool-down spin + hip flexor stretch',
    ],
    notes: 'Low-impact aerobic volume to support 10K endurance without pounding the legs.',
  },
  {
    id: 'plan-sat-longrun',
    dayIndex: 5, // Saturday
    category: 'Running',
    defaultActivity: 'Outdoor Run',
    title: '10K Endurance Progression',
    targetDistanceKm: 10,
    targetDurationMin: 52,
    targetPaceLabel: '5:05–5:20 /km',
    checklist: [
      'First 7 km relaxed aerobic pace (5:20 /km)',
      'Final 3 km steady progression toward 4:55 /km',
      '5 min walk cool-down + hydration',
    ],
    notes: 'Focus on even splits and controlled breathing through the final 3 km.',
  },
  {
    id: 'plan-sun-strength',
    dayIndex: 6, // Sunday
    category: 'Home Strength/Prehab',
    defaultActivity: 'Strength/Prehab',
    title: 'Runner Strength & Prehab Circuit',
    targetDurationMin: 30,
    targetPaceLabel: '3 rounds · Controlled',
    checklist: [
      'Single-leg glute bridges (3 × 12 each side)',
      'Bulgarian split squats (3 × 10 each side)',
      'Eccentric bent-knee calf raises (3 × 15 each side)',
      'Dead bugs & side planks (3 × 45s)',
    ],
    notes: 'Build tendon resilience for knees, calves, and hips.',
  },
];

function offsetDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toISODateLocal(d);
}

export function createDefaultData(): AppData {
  const currentWeek = getWeekKey();

  const sampleWorkouts: WorkoutLog[] = [
    {
      id: 'w-sample-1',
      date: offsetDateStr(2),
      activityType: 'Outdoor Run',
      distanceKm: 7.0,
      durationSec: 31 * 60 + 42, // 4:31 /km overall
      shoeId: 'shoe-superblast-3',
      rpe: 7,
      avgHr: 164,
      maxHr: 181,
      hrSource: 'garmin-hrm',
      hrSourceApp: 'Garmin HRM-Pro',
      notes: '4 × 1 km reps felt smooth around 4:15 /km. Superblast 3 felt snappy.',
      planSessionId: 'plan-tue-intervals',
    },
    {
      id: 'w-sample-2',
      date: offsetDateStr(4),
      activityType: 'Strength/Prehab',
      distanceKm: 0,
      durationSec: 32 * 60,
      rpe: 5,
      notes: 'Full single-leg prehab circuit plus ankle mobility work.',
      planSessionId: 'plan-sun-strength',
    },
    {
      id: 'w-sample-3',
      date: offsetDateStr(5),
      activityType: 'Outdoor Run',
      distanceKm: 10.0,
      durationSec: 51 * 60 + 20, // 5:08 /km
      shoeId: 'shoe-gt2000-12',
      rpe: 6,
      avgHr: 147,
      maxHr: 162,
      hrSource: 'screenshot',
      hrSourceApp: 'Garmin Connect',
      notes: 'Steady 10K loop. Negative split on final 2 km.',
      planSessionId: 'plan-sat-longrun',
    },
    {
      id: 'w-sample-4',
      date: offsetDateStr(8),
      activityType: 'Treadmill',
      distanceKm: 5.0,
      durationSec: 21 * 60 + 30, // 4:18 /km (~14.0 km/h)
      shoeId: 'shoe-superblast-3',
      rpe: 8,
      avgHr: 169,
      maxHr: 184,
      hrSource: 'manual',
      notes: '1% incline progression from 13.5 to 14.5 km/h.',
    },
  ];

  return {
    version: 1,
    weeklyPlan: DEFAULT_WEEKLY_PLAN,
    completedPlanSessions: {
      [`${currentWeek}_plan-tue-intervals`]: true,
    },
    completedChecklistSteps: {
      [`${currentWeek}_plan-tue-intervals_0`]: true,
      [`${currentWeek}_plan-tue-intervals_1`]: true,
      [`${currentWeek}_plan-tue-intervals_2`]: true,
    },
    workouts: sampleWorkouts,
    shoes: DEFAULT_SHOES,
    weeklyDistanceGoalKm: 25,
    maxHrSetting: 190,
  };
}

export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return validateAndNormalizeData(parsed);
  } catch {
    return createDefaultData();
  }
}

export function saveAppData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function validateAndNormalizeData(input: unknown): AppData {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid JSON structure: expected an object.');
  }
  const obj = input as Partial<AppData>;

  if (!Array.isArray(obj.workouts) || !Array.isArray(obj.shoes) || !Array.isArray(obj.weeklyPlan)) {
    throw new Error('Backup file is missing required fields (weeklyPlan, workouts, shoes).');
  }

  // Enforce 4-day maximum on imported weekly plans
  const normalizedPlan: PlannedSession[] = obj.weeklyPlan
    .filter(
      (s): s is PlannedSession =>
        Boolean(s && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.dayIndex === 'number')
    )
    .slice(0, MAX_WEEKLY_PLAN_DAYS)
    .map((s) => ({
      ...s,
      checklist: Array.isArray(s.checklist) ? s.checklist.map(String) : [],
    }));

  const normalizedShoes: Shoe[] = obj.shoes
    .filter((sh): sh is Shoe => Boolean(sh && typeof sh.id === 'string' && typeof sh.name === 'string'))
    .map((sh) => ({
      id: sh.id,
      name: sh.name,
      role: typeof sh.role === 'string' ? sh.role : 'Running Shoe',
      initialKm: Number.isFinite(Number(sh.initialKm)) ? Math.max(0, Number(sh.initialKm)) : 0,
      maxKm: Number.isFinite(Number(sh.maxKm)) && Number(sh.maxKm) > 0 ? Number(sh.maxKm) : 650,
      retired: Boolean(sh.retired),
    }));

  const normalizedWorkouts: WorkoutLog[] = obj.workouts
    .filter(
      (w): w is WorkoutLog =>
        Boolean(w && typeof w.id === 'string' && typeof w.date === 'string' && typeof w.activityType === 'string')
    )
    .map((w) => {
      const avgHrNum = Number(w.avgHr);
      const maxHrNum = Number(w.maxHr);
      const validAvgHr = Number.isFinite(avgHrNum) && avgHrNum >= 30 && avgHrNum <= 240 ? Math.round(avgHrNum) : undefined;
      const validMaxHr = Number.isFinite(maxHrNum) && maxHrNum >= 30 && maxHrNum <= 245 ? Math.round(maxHrNum) : undefined;
      const validSource =
        w.hrSource === 'manual' || w.hrSource === 'garmin-hrm' || w.hrSource === 'screenshot'
          ? w.hrSource
          : undefined;
      const validSamples = Array.isArray(w.hrSamples)
        ? w.hrSamples
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n >= 30 && n <= 245)
            .slice(0, 120)
        : undefined;

      return {
        id: w.id,
        date: w.date,
        activityType: w.activityType,
        distanceKm: Number.isFinite(Number(w.distanceKm)) ? Math.max(0, Number(w.distanceKm)) : 0,
        durationSec: Number.isFinite(Number(w.durationSec)) ? Math.max(0, Math.round(Number(w.durationSec))) : 0,
        shoeId: typeof w.shoeId === 'string' && w.shoeId ? w.shoeId : undefined,
        rpe: Number.isFinite(Number(w.rpe)) ? Math.min(10, Math.max(1, Math.round(Number(w.rpe)))) : 5,
        notes: typeof w.notes === 'string' ? w.notes : '',
        planSessionId: typeof w.planSessionId === 'string' ? w.planSessionId : undefined,
        avgHr: validAvgHr,
        maxHr: validMaxHr,
        hrSource: validSource,
        hrSourceApp: typeof w.hrSourceApp === 'string' && w.hrSourceApp ? w.hrSourceApp.slice(0, 60) : undefined,
        hrSamples: validSamples && validSamples.length > 0 ? validSamples : undefined,
      };
    });

  const parsedMaxHrSetting = Number(obj.maxHrSetting);

  return {
    version: 1,
    weeklyPlan: normalizedPlan,
    completedPlanSessions:
      obj.completedPlanSessions && typeof obj.completedPlanSessions === 'object'
        ? obj.completedPlanSessions
        : {},
    completedChecklistSteps:
      obj.completedChecklistSteps && typeof obj.completedChecklistSteps === 'object'
        ? obj.completedChecklistSteps
        : {},
    workouts: normalizedWorkouts,
    shoes: normalizedShoes.length > 0 ? normalizedShoes : DEFAULT_SHOES,
    weeklyDistanceGoalKm:
      Number.isFinite(Number(obj.weeklyDistanceGoalKm)) && Number(obj.weeklyDistanceGoalKm) > 0
        ? Number(obj.weeklyDistanceGoalKm)
        : 25,
    maxHrSetting:
      Number.isFinite(parsedMaxHrSetting) && parsedMaxHrSetting >= 120 && parsedMaxHrSetting <= 230
        ? Math.round(parsedMaxHrSetting)
        : 190,
  };
}

export function getShoeTotalKm(shoe: Shoe, workouts: WorkoutLog[]): number {
  const loggedKm = workouts.reduce((sum, w) => (w.shoeId === shoe.id ? sum + w.distanceKm : sum), 0);
  return Math.round((shoe.initialKm + loggedKm) * 100) / 100;
}
