import React, { useRef, useState } from 'react';
import { Download, Upload, Plus, Pencil, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { ActivityType, AppData, Shoe, WorkoutLog } from '../types';
import {
  calcPaceSecPerKm,
  formatPaceMinPerKm,
  formatTotalTime,
  getHrZone,
  getHrZoneRanges,
  getStartOfWeekMonday,
  getWeekDates,
  toISODateLocal,
} from '../utils/metrics';
import { getShoeTotalKm, MAX_WEEKLY_PLAN_DAYS } from '../utils/storage';

interface StatsViewProps {
  data: AppData;
  onUpdateWeeklyGoal: (km: number) => void;
  onUpdateMaxHrSetting: (bpm: number) => void;
  onOpenShoeModal: (shoe: Shoe | null) => void;
  onImportJson: (rawJson: string) => { ok: boolean; message: string };
  onResetDefaultData: () => void;
}

const ALL_ACTIVITIES: ActivityType[] = [
  'Outdoor Run',
  'Treadmill',
  'Indoor Bike',
  'Strength/Prehab',
  'Padel',
];

export const StatsView: React.FC<StatsViewProps> = ({
  data,
  onUpdateWeeklyGoal,
  onUpdateMaxHrSetting,
  onOpenShoeModal,
  onImportJson,
  onResetDefaultData,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(5); // latest week
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(data.weeklyDistanceGoalKm));
  const [editingMaxHr, setEditingMaxHr] = useState(false);
  const [maxHrInput, setMaxHrInput] = useState(String(data.maxHrSetting || 190));
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const today = new Date();
  const currentWeekDates = getWeekDates(today);
  const currentWeekIsoSet = new Set(currentWeekDates.map(toISODateLocal));

  // Build 6-week history buckets (oldest -> current week)
  const sixWeeks = Array.from({ length: 6 }, (_, i) => {
    const weeksAgo = 5 - i;
    const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weeksAgo * 7);
    const monday = getStartOfWeekMonday(ref);
    const dates = getWeekDates(monday);
    const isoSet = new Set(dates.map(toISODateLocal));
    const weekWorkouts = data.workouts.filter((w) => isoSet.has(w.date));
    const runKm = weekWorkouts
      .filter((w) => w.activityType === 'Outdoor Run' || w.activityType === 'Treadmill')
      .reduce((sum, w) => sum + w.distanceKm, 0);
    const totalKm = weekWorkouts.reduce((sum, w) => sum + w.distanceKm, 0);

    return {
      label:
        weeksAgo === 0
          ? 'This Wk'
          : monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      runKm: Math.round(runKm * 10) / 10,
      totalKm: Math.round(totalKm * 10) / 10,
      sessions: weekWorkouts.length,
    };
  });

  const maxChartKm = Math.max(
    data.weeklyDistanceGoalKm,
    ...sixWeeks.map((w) => w.totalKm),
    10
  );

  // Current week stats
  const thisWeekWorkouts = data.workouts.filter((w) => currentWeekIsoSet.has(w.date));
  const thisWeekTotalKm = thisWeekWorkouts.reduce((sum, w) => sum + w.distanceKm, 0);
  const thisWeekRunWorkouts = thisWeekWorkouts.filter(
    (w) => w.activityType === 'Outdoor Run' || w.activityType === 'Treadmill'
  );
  const thisWeekRunKm = thisWeekRunWorkouts.reduce((sum, w) => sum + w.distanceKm, 0);
  const thisWeekTotalSec = thisWeekWorkouts.reduce((sum, w) => sum + w.durationSec, 0);

  // Overall average running pace across all logged runs
  const allRuns = data.workouts.filter(
    (w) =>
      (w.activityType === 'Outdoor Run' || w.activityType === 'Treadmill') &&
      w.distanceKm > 0 &&
      w.durationSec > 0
  );
  const totalRunDist = allRuns.reduce((sum, w) => sum + w.distanceKm, 0);
  const totalRunSec = allRuns.reduce((sum, w) => sum + w.durationSec, 0);
  const avgRunPaceSec = calcPaceSecPerKm(totalRunDist, totalRunSec);

  const weeklyGoalPct = Math.min(
    100,
    Math.round((thisWeekTotalKm / Math.max(1, data.weeklyDistanceGoalKm)) * 100)
  );

  // Activity breakdown across all workouts
  const activityBreakdown = ALL_ACTIVITIES.map((type) => {
    const list = data.workouts.filter((w) => w.activityType === type);
    return {
      type,
      count: list.length,
      distanceKm: list.reduce((s, w) => s + w.distanceKm, 0),
      durationSec: list.reduce((s, w) => s + w.durationSec, 0),
    };
  });

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(goalInput);
    if (Number.isFinite(parsed) && parsed > 0) {
      onUpdateWeeklyGoal(Math.round(parsed));
    }
    setEditingGoal(false);
  };

  const handleSaveMaxHr = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(maxHrInput, 10);
    if (Number.isFinite(parsed) && parsed >= 120 && parsed <= 230) {
      onUpdateMaxHrSetting(parsed);
    }
    setEditingMaxHr(false);
  };

  // Heart rate analytics for Run & Bike sessions
  const hrWorkouts = data.workouts.filter(
    (w) =>
      (w.activityType === 'Outdoor Run' ||
        w.activityType === 'Treadmill' ||
        w.activityType === 'Indoor Bike') &&
      typeof w.avgHr === 'number' &&
      w.avgHr > 0
  );
  const overallAvgHr =
    hrWorkouts.length > 0
      ? Math.round(hrWorkouts.reduce((sum, w) => sum + (w.avgHr ?? 0), 0) / hrWorkouts.length)
      : null;
  const peakMaxHr = data.workouts.reduce((peak, w) => Math.max(peak, w.maxHr ?? 0), 0);
  const zoneRanges = getHrZoneRanges(data.maxHrSetting || 190);
  const zoneCounts = zoneRanges.map((z) => ({
    ...z,
    count: hrWorkouts.filter((w) => getHrZone(w.avgHr ?? 0, data.maxHrSetting || 190)?.zone === z.zone)
      .length,
  }));

  const handleExportJson = () => {
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stridemetric-backup-${toISODateLocal(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupFeedback({
      type: 'success',
      text: `Exported ${data.workouts.length} workouts and ${data.shoes.length} shoes to JSON.`,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const result = onImportJson(content);
      setBackupFeedback({
        type: result.ok ? 'success' : 'error',
        text: result.message,
      });
    };
    reader.onerror = () => {
      setBackupFeedback({
        type: 'error',
        text: 'Could not read the selected file.',
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getShoeStatus = (pct: number): { label: string; barClass: string; textClass: string } => {
    if (pct >= 85) {
      return {
        label: 'Replace Soon',
        barClass: 'bg-rose-600 dark:bg-rose-500',
        textClass: 'text-rose-600 dark:text-rose-400',
      };
    }
    if (pct >= 60) {
      return {
        label: 'Mid-Life',
        barClass: 'bg-amber-500 dark:bg-amber-400',
        textClass: 'text-amber-700 dark:text-amber-400',
      };
    }
    return {
      label: 'Fresh',
      barClass: 'bg-orange-600 dark:bg-orange-500',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  };

  const activeWeekBar = sixWeeks[selectedWeekIdx] ?? sixWeeks[5];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Training Stats &amp; Gear
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Weekly distance, session volume, shoe mileage tracking, and cross-device JSON backup.
        </p>
      </div>

      {/* Top 4 KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Weekly Distance
            </span>
            <button
              type="button"
              onClick={() => {
                setGoalInput(String(data.weeklyDistanceGoalKm));
                setEditingGoal((prev) => !prev);
              }}
              className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
            >
              Goal
            </button>
          </div>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
            {thisWeekTotalKm.toFixed(1)}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">km</span>
          </p>
          {editingGoal ? (
            <form onSubmit={handleSaveGoal} className="flex items-center gap-1.5 mt-2">
              <input
                type="number"
                min={5}
                max={200}
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="w-16 px-2 py-1 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-orange-600 text-white"
              >
                Save
              </button>
            </form>
          ) : (
            <div className="mt-2.5">
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-600 dark:bg-orange-500 rounded-full"
                  style={{ width: `${weeklyGoalPct}%` }}
                />
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1 block">
                {weeklyGoalPct}% of {data.weeklyDistanceGoalKm} km ({thisWeekRunKm.toFixed(1)} km run)
              </span>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Weekly Sessions
          </span>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
            {thisWeekWorkouts.length}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {' '}
              / {Math.max(data.weeklyPlan.length, 1)}
            </span>
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 block">
            {data.weeklyPlan.length} of {MAX_WEEKLY_PLAN_DAYS} max plan days
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Avg Run Pace
          </span>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
            {formatPaceMinPerKm(avgRunPaceSec, false)}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400"> /km</span>
          </p>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-2 block">
            Across {allRuns.length} logged runs
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Weekly Time
          </span>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
            {formatTotalTime(thisWeekTotalSec)}
          </p>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-2 block">
            {data.workouts.length} total sessions logged
          </span>
        </div>
      </div>

      {/* Main 2-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Shoe Rotation Mileage Bars + Heart Rate Zones */}
        <div className="lg:col-span-6 space-y-6">
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                Shoe Rotation Mileage
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Auto-tracked from logged runs plus starting offset
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenShoeModal(null)}
              className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Add Shoe
            </button>
          </div>

          <div className="space-y-5">
            {data.shoes.map((shoe) => {
              const totalKm = getShoeTotalKm(shoe, data.workouts);
              const pct = Math.min(100, Math.round((totalKm / Math.max(1, shoe.maxKm)) * 100));
              const remainingKm = Math.max(0, Math.round((shoe.maxKm - totalKm) * 10) / 10);
              const status = getShoeStatus(pct);
              const runCount = data.workouts.filter((w) => w.shoeId === shoe.id).length;

              return (
                <div
                  key={shoe.id}
                  className="pb-5 last:pb-0 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                        {shoe.name}
                      </h3>
                      <div className="flex items-center flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>{shoe.role}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-semibold ${status.textClass}`}>{status.label}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenShoeModal(shoe)}
                      aria-label={`Edit ${shoe.name}`}
                      className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Mileage Bar */}
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between text-xs mb-1.5">
                      <span className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-slate-100">
                        {totalKm.toFixed(1)}{' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          / {shoe.maxKm} km
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {pct}% · {remainingKm.toFixed(0)} km left
                      </span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${status.barClass}`}
                        style={{ width: `${Math.max(pct, totalKm > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1.5">
                      {runCount} logged {runCount === 1 ? 'session' : 'sessions'} · {shoe.initialKm.toFixed(1)} km base offset
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Heart Rate Zones & Summary (Run & Bike) */}
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                Heart Rate &amp; Zones
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Run &amp; bike sessions based on Max HR {data.maxHrSetting || 190} bpm
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMaxHrInput(String(data.maxHrSetting || 190));
                setEditingMaxHr((prev) => !prev);
              }}
              className="min-h-[38px] px-3 rounded-lg text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Set Max HR
            </button>
          </div>

          {editingMaxHr && (
            <form onSubmit={handleSaveMaxHr} className="flex items-center gap-2 mb-4">
              <input
                type="number"
                min={120}
                max={230}
                value={maxHrInput}
                onChange={(e) => setMaxHrInput(e.target.value)}
                className="w-24 min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono tabular-nums text-sm text-slate-900 dark:text-white"
              />
              <span className="text-xs text-slate-500">bpm</span>
              <button
                type="submit"
                className="min-h-[42px] px-3.5 rounded-xl bg-orange-600 text-white text-xs font-semibold"
              >
                Save
              </button>
            </form>
          )}

          <div className="grid grid-cols-2 gap-4 py-3 mb-4 border-y border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Avg Session HR</span>
              <span className="font-mono tabular-nums text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5 block">
                {overallAvgHr !== null ? `${overallAvgHr} bpm` : '—'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Highest Peak HR</span>
              <span className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5 block">
                {peakMaxHr > 0 ? `${peakMaxHr} bpm` : '—'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {zoneCounts.map((z) => {
              const sharePct =
                hrWorkouts.length > 0 ? Math.round((z.count / hrWorkouts.length) * 100) : 0;
              return (
                <div key={z.zone}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      Z{z.zone} · {z.name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {z.minBpm}–{z.maxBpm} bpm · <strong className="text-slate-900 dark:text-slate-100">{z.count}</strong>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-600 dark:bg-rose-500 rounded-full transition-all duration-300"
                      style={{ width: `${sharePct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        </div>

        {/* RIGHT: 6-Week Volume Chart + Activity Mix + JSON Backup */}
        <div className="lg:col-span-6 space-y-6">
          {/* 6-Week Distance Trend */}
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  6-Week Distance Trend
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeWeekBar.label}:{' '}
                  <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {activeWeekBar.totalKm.toFixed(1)} km
                  </strong>{' '}
                  ({activeWeekBar.sessions} sessions)
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Goal: {data.weeklyDistanceGoalKm} km
              </span>
            </div>

            <div className="grid grid-cols-6 gap-2 items-end h-40 pt-4">
              {sixWeeks.map((wk, idx) => {
                const heightPct = Math.round((wk.totalKm / maxChartKm) * 100);
                const selected = idx === selectedWeekIdx;
                return (
                  <button
                    key={wk.label}
                    type="button"
                    onClick={() => setSelectedWeekIdx(idx)}
                    className="h-full flex flex-col items-center justify-end gap-1.5 group focus-visible:outline-none"
                  >
                    <span
                      className={`font-mono tabular-nums text-[11px] font-semibold ${
                        selected
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {wk.totalKm > 0 ? wk.totalKm.toFixed(0) : '0'}
                    </span>
                    <div className="w-full max-w-[40px] h-24 bg-slate-100 dark:bg-slate-800/80 rounded-lg flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          selected
                            ? 'bg-orange-600 dark:bg-orange-500'
                            : 'bg-slate-400 dark:bg-slate-600 group-hover:bg-slate-500 dark:group-hover:bg-slate-500'
                        }`}
                        style={{ height: `${Math.max(heightPct, wk.totalKm > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-medium truncate max-w-full ${
                        selected
                          ? 'text-slate-900 dark:text-slate-100 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {wk.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Activity Distribution */}
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-3">
              Activity Breakdown
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {activityBreakdown.map((item) => (
                <div key={item.type} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.type}</span>
                  <div className="flex items-center gap-3 font-mono tabular-nums text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    <span>{item.count}×</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.distanceKm > 0 ? `${item.distanceKm.toFixed(1)} km` : '—'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-900 dark:text-slate-100 font-semibold">
                      {formatTotalTime(item.durationSec)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Local Backup & Transfer (JSON Export / Import) */}
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Data Backup &amp; Device Transfer
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              All training data is saved locally in your browser. Export a JSON backup to transfer your log, plan, and shoe rotation to another device.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <button
                type="button"
                onClick={handleExportJson}
                className="min-h-[48px] px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap hover:opacity-90 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Export JSON Backup
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import JSON Backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Import JSON backup file"
              />
            </div>

            {backupFeedback && (
              <div
                role="status"
                className={`mt-3 px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  backupFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                }`}
              >
                {backupFeedback.type === 'success' ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{backupFeedback.text}</span>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Restore default 4-day plan &amp; ASICS shoes
              </span>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="min-h-[40px] px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Data
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="min-h-[38px] px-2.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetDefaultData();
                      setConfirmReset(false);
                      setBackupFeedback({
                        type: 'success',
                        text: 'Reset to default 4-day training plan and ASICS shoe rotation.',
                      });
                    }}
                    className="min-h-[38px] px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
