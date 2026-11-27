export type TabId = 'today' | 'log' | 'calculator' | 'stats';

export type ActivityType =
  | 'Outdoor Run'
  | 'Treadmill'
  | 'Indoor Bike'
  | 'Strength/Prehab'
  | 'Padel';

export type PlanCategory = 'Running' | 'Indoor Cycling' | 'Home Strength/Prehab';

/** 0 = Monday, 1 = Tuesday, ... 6 = Sunday */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PlannedSession {
  id: string;
  dayIndex: DayIndex;
  category: PlanCategory;
  defaultActivity: ActivityType;
  title: string;
  targetDistanceKm?: number;
  targetDurationMin?: number;
  targetPaceLabel?: string;
  checklist: string[];
  notes?: string;
}

export type HrSource = 'manual' | 'garmin-hrm' | 'screenshot';

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  activityType: ActivityType;
  distanceKm: number; // 0 for non-distance activities
  durationSec: number; // total seconds
  shoeId?: string;
  rpe: number; // 1 to 10
  notes: string;
  planSessionId?: string;
  avgHr?: number; // beats per minute
  maxHr?: number; // beats per minute
  hrSource?: HrSource;
  hrSourceApp?: string; // e.g., "Garmin HRM-Pro", "Garmin Connect", "Strava", "Google Health"
  hrSamples?: number[]; // optional compact HR sample trace from live BLE strap
}

export interface Shoe {
  id: string;
  name: string;
  role: string;
  initialKm: number;
  maxKm: number;
  retired?: boolean;
}

export interface AppData {
  version: number;
  weeklyPlan: PlannedSession[];
  /** Keys formatted as `${weekKey}_${planSessionId}` -> boolean */
  completedPlanSessions: Record<string, boolean>;
  /** Keys formatted as `${weekKey}_${planSessionId}_${stepIndex}` -> boolean */
  completedChecklistSteps: Record<string, boolean>;
  workouts: WorkoutLog[];
  shoes: Shoe[];
  weeklyDistanceGoalKm: number;
  maxHrSetting: number;
}

export interface LogPrefill {
  date?: string;
  activityType?: ActivityType;
  distanceKm?: number;
  durationSec?: number;
  notes?: string;
  planSessionId?: string;
}
