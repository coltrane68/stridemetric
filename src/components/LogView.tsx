import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, SlidersHorizontal, Heart, Bluetooth, Camera } from 'lucide-react';
import { ActivityType, HrSource, LogPrefill, Shoe, WorkoutLog } from '../types';
import {
  calcPaceSecPerKm,
  formatDisplayDate,
  formatDurationMMSS,
  formatPaceMinPerKm,
  formatSpeedKmh,
  getHrZone,
  getRpeLabel,
  paceSecToSpeedKmh,
  toISODateLocal,
} from '../utils/metrics';
import { getShoeTotalKm } from '../utils/storage';
import { GarminHrmPanel, GarminHrmResult } from './GarminHrmPanel';
import { ScreenshotExtraction, ScreenshotHrImporter } from './ScreenshotHrImporter';

const ACTIVITY_TYPES: ActivityType[] = [
  'Outdoor Run',
  'Treadmill',
  'Indoor Bike',
  'Strength/Prehab',
  'Padel',
];

const SHOE_RELEVANT_TYPES: ActivityType[] = ['Outdoor Run', 'Treadmill'];
const HR_RELEVANT_TYPES: ActivityType[] = ['Outdoor Run', 'Treadmill', 'Indoor Bike'];

interface LogViewProps {
  workouts: WorkoutLog[];
  shoes: Shoe[];
  maxHrSetting: number;
  prefill: LogPrefill | null;
  onClearPrefill: () => void;
  onSaveWorkout: (workout: WorkoutLog) => void;
  onDeleteWorkout: (workoutId: string) => void;
  onOpenShoeModal: (shoe: Shoe | null) => void;
}

export const LogView: React.FC<LogViewProps> = ({
  workouts,
  shoes,
  maxHrSetting,
  prefill,
  onClearPrefill,
  onSaveWorkout,
  onDeleteWorkout,
  onOpenShoeModal,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(toISODateLocal(new Date()));
  const [activityType, setActivityType] = useState<ActivityType>('Outdoor Run');
  const [distanceKm, setDistanceKm] = useState<string>('5.00');
  const [durationMin, setDurationMin] = useState<string>('24');
  const [durationSec, setDurationSec] = useState<string>('00');
  const [shoeId, setShoeId] = useState<string>(shoes[0]?.id ?? '');
  const [rpe, setRpe] = useState<number>(6);
  const [notes, setNotes] = useState<string>('');
  const [planSessionId, setPlanSessionId] = useState<string | undefined>(undefined);

  // Heart rate state (Run & Bike sessions)
  const [hrMode, setHrMode] = useState<'manual' | 'garmin-hrm' | 'screenshot'>('manual');
  const [avgHrInput, setAvgHrInput] = useState<string>('');
  const [maxHrInput, setMaxHrInput] = useState<string>('');
  const [hrSource, setHrSource] = useState<HrSource | undefined>(undefined);
  const [hrSourceApp, setHrSourceApp] = useState<string | undefined>(undefined);
  const [hrSamples, setHrSamples] = useState<number[] | undefined>(undefined);

  const [historyFilter, setHistoryFilter] = useState<'All' | ActivityType>('All');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Apply prefill from TodayView "Log Details"
  useEffect(() => {
    if (!prefill) return;
    setEditingId(null);
    if (prefill.date) setDate(prefill.date);
    if (prefill.activityType) {
      setActivityType(prefill.activityType);
      if (!SHOE_RELEVANT_TYPES.includes(prefill.activityType)) {
        setShoeId('');
      } else if (!shoeId && shoes[0]) {
        setShoeId(shoes[0].id);
      }
    }
    if (typeof prefill.distanceKm === 'number') {
      setDistanceKm(prefill.distanceKm > 0 ? prefill.distanceKm.toFixed(2) : '');
    }
    if (typeof prefill.durationSec === 'number' && prefill.durationSec > 0) {
      const m = Math.floor(prefill.durationSec / 60);
      const s = prefill.durationSec % 60;
      setDurationMin(String(m));
      setDurationSec(s.toString().padStart(2, '0'));
    }
    if (prefill.notes) setNotes(prefill.notes);
    setPlanSessionId(prefill.planSessionId);
    onClearPrefill();
  }, [prefill, onClearPrefill, shoes, shoeId]);

  const handleActivityChange = (nextType: ActivityType) => {
    setActivityType(nextType);
    if (SHOE_RELEVANT_TYPES.includes(nextType)) {
      if (!shoeId && shoes[0]) setShoeId(shoes[0].id);
    } else {
      setShoeId('');
      if (nextType === 'Strength/Prehab' || nextType === 'Padel') {
        setDistanceKm('');
      }
    }
    if (!HR_RELEVANT_TYPES.includes(nextType)) {
      setAvgHrInput('');
      setMaxHrInput('');
      setHrSource(undefined);
      setHrSourceApp(undefined);
      setHrSamples(undefined);
    }
  };

  // Support pasting "24:30" directly into minutes field
  const handleMinutesInput = (val: string) => {
    if (val.includes(':')) {
      const [mPart, sPart] = val.split(':');
      const m = parseInt(mPart, 10);
      const s = parseInt(sPart, 10);
      setDurationMin(Number.isFinite(m) ? String(Math.max(0, m)) : '');
      setDurationSec(
        Number.isFinite(s) ? Math.min(59, Math.max(0, s)).toString().padStart(2, '0') : '00'
      );
      return;
    }
    setDurationMin(val.replace(/[^\d]/g, '').slice(0, 3));
  };

  const handleSecondsInput = (val: string) => {
    const clean = val.replace(/[^\d]/g, '').slice(0, 2);
    if (clean === '') {
      setDurationSec('');
      return;
    }
    const num = parseInt(clean, 10);
    setDurationSec(num > 59 ? '59' : clean);
  };

  const handleApplyHrmData = (result: GarminHrmResult, applyDuration: boolean) => {
    setAvgHrInput(String(result.avgHr));
    setMaxHrInput(String(result.maxHr));
    setHrSource('garmin-hrm');
    setHrSourceApp(result.deviceName);
    setHrSamples(result.samples);
    if (applyDuration && result.durationSec && result.durationSec > 0) {
      const m = Math.floor(result.durationSec / 60);
      const s = result.durationSec % 60;
      setDurationMin(String(m));
      setDurationSec(s.toString().padStart(2, '0'));
    }
  };

  const handleApplyScreenshot = (extracted: ScreenshotExtraction, includeFullSession: boolean) => {
    if (extracted.avgHr !== null) setAvgHrInput(String(extracted.avgHr));
    if (extracted.maxHr !== null) setMaxHrInput(String(extracted.maxHr));
    setHrSource('screenshot');
    setHrSourceApp(extracted.sourceApp);
    setHrSamples(undefined);

    if (includeFullSession) {
      if (extracted.activityType) {
        setActivityType(extracted.activityType);
        if (!SHOE_RELEVANT_TYPES.includes(extracted.activityType)) {
          setShoeId('');
        } else if (!shoeId && shoes[0]) {
          setShoeId(shoes[0].id);
        }
      }
      if (extracted.date) setDate(extracted.date);
      if (extracted.distanceKm !== null) setDistanceKm(extracted.distanceKm.toFixed(2));
      if (extracted.durationSec !== null && extracted.durationSec > 0) {
        const m = Math.floor(extracted.durationSec / 60);
        const s = extracted.durationSec % 60;
        setDurationMin(String(m));
        setDurationSec(s.toString().padStart(2, '0'));
      }
      if (extracted.notes && !notes.trim()) {
        setNotes(extracted.notes);
      }
    }
  };

  const parsedDist = Math.max(0, parseFloat(distanceKm) || 0);
  const parsedMins = Math.max(0, parseInt(durationMin, 10) || 0);
  const parsedSecs = Math.min(59, Math.max(0, parseInt(durationSec, 10) || 0));
  const totalDurationSec = parsedMins * 60 + parsedSecs;

  const parsedAvgHr = parseInt(avgHrInput, 10);
  const parsedMaxHr = parseInt(maxHrInput, 10);
  const validAvgHr =
    Number.isFinite(parsedAvgHr) && parsedAvgHr >= 30 && parsedAvgHr <= 240 ? parsedAvgHr : undefined;
  const validMaxHr =
    Number.isFinite(parsedMaxHr) && parsedMaxHr >= 30 && parsedMaxHr <= 245 ? parsedMaxHr : undefined;

  const livePaceSec = calcPaceSecPerKm(parsedDist, totalDurationSec);
  const liveSpeedKmh = paceSecToSpeedKmh(livePaceSec);
  const liveHrZone = validAvgHr ? getHrZone(validAvgHr, maxHrSetting) : null;

  const isShoeRelevant = SHOE_RELEVANT_TYPES.includes(activityType);
  const isHrRelevant = HR_RELEVANT_TYPES.includes(activityType);

  const resetForm = () => {
    setEditingId(null);
    setDate(toISODateLocal(new Date()));
    setActivityType('Outdoor Run');
    setDistanceKm('5.00');
    setDurationMin('24');
    setDurationSec('00');
    setShoeId(shoes[0]?.id ?? '');
    setRpe(6);
    setNotes('');
    setPlanSessionId(undefined);
    setAvgHrInput('');
    setMaxHrInput('');
    setHrSource(undefined);
    setHrSourceApp(undefined);
    setHrSamples(undefined);
  };

  const handleEditExisting = (w: WorkoutLog) => {
    setEditingId(w.id);
    setDate(w.date);
    setActivityType(w.activityType);
    setDistanceKm(w.distanceKm > 0 ? String(w.distanceKm) : '');
    const m = Math.floor(w.durationSec / 60);
    const s = w.durationSec % 60;
    setDurationMin(String(m));
    setDurationSec(s.toString().padStart(2, '0'));
    setShoeId(w.shoeId ?? '');
    setRpe(w.rpe);
    setNotes(w.notes);
    setPlanSessionId(w.planSessionId);
    setAvgHrInput(w.avgHr ? String(w.avgHr) : '');
    setMaxHrInput(w.maxHr ? String(w.maxHr) : '');
    setHrSource(w.hrSource);
    setHrSourceApp(w.hrSourceApp);
    setHrSamples(w.hrSamples);
    setHrMode('manual');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalDurationSec <= 0 && parsedDist <= 0) return;

    const hasAnyHr = isHrRelevant && (validAvgHr !== undefined || validMaxHr !== undefined);

    const workout: WorkoutLog = {
      id: editingId ?? `w-${Date.now()}`,
      date,
      activityType,
      distanceKm: Math.round(parsedDist * 100) / 100,
      durationSec: totalDurationSec,
      shoeId: shoeId || undefined,
      rpe,
      notes: notes.trim(),
      planSessionId,
      avgHr: isHrRelevant ? validAvgHr : undefined,
      maxHr: isHrRelevant ? validMaxHr : undefined,
      hrSource: hasAnyHr ? hrSource ?? 'manual' : undefined,
      hrSourceApp: hasAnyHr ? hrSourceApp : undefined,
      hrSamples: hasAnyHr ? hrSamples : undefined,
    };

    onSaveWorkout(workout);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
    resetForm();
  };

  const shoeMap = new Map(shoes.map((s) => [s.id, s]));
  const filteredWorkouts = [...workouts]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .filter((w) => (historyFilter === 'All' ? true : w.activityType === historyFilter));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Workout Logger
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Record completed runs, rides, strength, and padel sessions in metric units with heart rate support.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Workout Entry Form */}
        <section className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {editingId ? 'Edit Session' : 'Log Completed Session'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[40px] px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Activity Type */}
            <div>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Activity Type
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ACTIVITY_TYPES.map((type) => {
                  const active = activityType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleActivityChange(type)}
                      className={`min-h-[46px] px-3 rounded-xl text-sm font-semibold border whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date + Distance + Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="log-date"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Date
                </label>
                <input
                  id="log-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full min-h-[48px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label
                  htmlFor="log-distance"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Distance (km)
                </label>
                <input
                  id="log-distance"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder={isShoeRelevant || activityType === 'Indoor Bike' ? '5.00' : 'Optional'}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums text-base font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Duration (mm:ss)
                </span>
                <div className="flex items-center min-h-[48px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus-within:ring-2 focus-within:ring-orange-500">
                  <input
                    aria-label="Duration minutes"
                    type="text"
                    inputMode="numeric"
                    placeholder="mm"
                    value={durationMin}
                    onChange={(e) => handleMinutesInput(e.target.value)}
                    className="w-full bg-transparent text-center font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50 focus:outline-none"
                  />
                  <span className="font-mono font-bold text-slate-400 px-0.5">:</span>
                  <input
                    aria-label="Duration seconds"
                    type="text"
                    inputMode="numeric"
                    placeholder="ss"
                    value={durationSec}
                    onChange={(e) => handleSecondsInput(e.target.value)}
                    onBlur={() => {
                      if (durationSec !== '') {
                        setDurationSec(durationSec.padStart(2, '0'));
                      }
                    }}
                    className="w-full bg-transparent text-center font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Auto-Calculated Average Pace & Speed Live Readout */}
            <div className="grid grid-cols-2 gap-4 py-3.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800/70">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  Auto Average Pace
                </span>
                <span className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5 block">
                  {formatPaceMinPerKm(livePaceSec)}
                </span>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  Equivalent Speed
                </span>
                <span className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5 block">
                  {formatSpeedKmh(liveSpeedKmh)}
                </span>
              </div>
            </div>

            {/* Heart Rate Data Capture (Run & Bike Sessions) */}
            {isHrRelevant && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Heart Rate (Run &amp; Bike)
                  </span>
                  {(validAvgHr || validMaxHr) && (
                    <span className="text-xs font-mono tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                      {validAvgHr ? `Avg ${validAvgHr}` : ''}
                      {validAvgHr && validMaxHr ? ' · ' : ''}
                      {validMaxHr ? `Max ${validMaxHr}` : ''} bpm
                      {hrSourceApp ? ` · ${hrSourceApp}` : ''}
                    </span>
                  )}
                </div>

                {/* 3-Method Interactive Mode Selector */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setHrMode('manual')}
                    className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                      hrMode === 'manual'
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Heart className="w-3.5 h-3.5" />
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setHrMode('garmin-hrm')}
                    className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                      hrMode === 'garmin-hrm'
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    HRM-Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => setHrMode('screenshot')}
                    className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                      hrMode === 'screenshot'
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Screenshot
                  </button>
                </div>

                {hrMode === 'manual' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="log-avg-hr"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          Average HR (bpm)
                        </label>
                        <input
                          id="log-avg-hr"
                          type="number"
                          min={30}
                          max={240}
                          inputMode="numeric"
                          placeholder="e.g. 154"
                          value={avgHrInput}
                          onChange={(e) => {
                            setAvgHrInput(e.target.value);
                            setHrSource('manual');
                            setHrSourceApp(undefined);
                          }}
                          className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums text-base font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="log-max-hr"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          Max HR (bpm)
                        </label>
                        <input
                          id="log-max-hr"
                          type="number"
                          min={30}
                          max={245}
                          inputMode="numeric"
                          placeholder="e.g. 178"
                          value={maxHrInput}
                          onChange={(e) => {
                            setMaxHrInput(e.target.value);
                            setHrSource('manual');
                            setHrSourceApp(undefined);
                          }}
                          className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums text-base font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    {liveHrZone && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                        Zone {liveHrZone.zone} · {liveHrZone.name} ({liveHrZone.pctMax}% of {maxHrSetting} bpm max)
                      </p>
                    )}
                  </div>
                )}

                {hrMode === 'garmin-hrm' && (
                  <GarminHrmPanel
                    maxHrSetting={maxHrSetting}
                    onApplyHrmData={handleApplyHrmData}
                  />
                )}

                {hrMode === 'screenshot' && (
                  <ScreenshotHrImporter onApplyExtraction={handleApplyScreenshot} />
                )}
              </div>
            )}

            {/* Shoe Rotation Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Shoe Rotation {isShoeRelevant ? '' : '(Optional)'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenShoeModal(null)}
                  className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 min-h-[32px] px-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Shoe
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {shoes.map((sh) => {
                  const active = shoeId === sh.id;
                  const totalKm = getShoeTotalKm(sh, workouts);
                  return (
                    <div
                      key={sh.id}
                      className={`flex items-center justify-between rounded-xl border transition-colors ${
                        active
                          ? 'bg-orange-50/70 dark:bg-orange-500/10 border-orange-500 dark:border-orange-400'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setShoeId(active ? '' : sh.id)}
                        className="flex-1 min-h-[54px] px-3.5 py-2 text-left min-w-0"
                      >
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {sh.name}
                        </span>
                        <span className="block text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {totalKm.toFixed(1)} / {sh.maxKm} km
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenShoeModal(sh)}
                        aria-label={`Edit ${sh.name}`}
                        className="min-h-[44px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShoeId('')}
                  className={`min-h-[54px] px-3.5 rounded-xl border text-left text-sm font-medium transition-colors ${
                    shoeId === ''
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  None / Non-Running
                </button>
              </div>
            </div>

            {/* RPE 1–10 Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Effort (RPE)
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {rpe}/10 · {getRpeLabel(rpe)}
                </span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                  const active = rpe === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRpe(val)}
                      className={`min-h-[44px] rounded-xl font-mono tabular-nums text-sm font-bold border transition-colors ${
                        active
                          ? 'bg-orange-600 text-white border-orange-600 dark:bg-orange-500 dark:border-orange-500'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="log-notes"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Session Notes
              </label>
              <textarea
                id="log-notes"
                rows={2}
                placeholder="Splits, incline %, heart rate feel, legs..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={totalDurationSec <= 0 && parsedDist <= 0}
              className="w-full min-h-[52px] rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
            >
              {justSaved ? (
                <>
                  <Check className="w-5 h-5 stroke-[2.5]" />
                  Workout Saved
                </>
              ) : editingId ? (
                'Update Workout'
              ) : (
                'Save Workout'
              )}
            </button>
          </form>
        </section>

        {/* RIGHT: Filterable Workout History */}
        <section className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Recent History
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredWorkouts.length} logged
            </span>
          </div>

          {/* Interactive Activity Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
            {(['All', ...ACTIVITY_TYPES] as const).map((f) => {
              const active = historyFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHistoryFilter(f)}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {filteredWorkouts.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <SlidersHorizontal className="w-6 h-6 mx-auto text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No {historyFilter === 'All' ? '' : `${historyFilter} `}sessions recorded yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredWorkouts.map((w) => {
                const paceSec = calcPaceSecPerKm(w.distanceKm, w.durationSec);
                const shoe = w.shoeId ? shoeMap.get(w.shoeId) : undefined;
                const hrZone = w.avgHr ? getHrZone(w.avgHr, maxHrSetting) : null;
                return (
                  <li key={w.id} className="py-4 first:pt-2 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {w.activityType}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDisplayDate(w.date)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">RPE {w.rpe}/10</span>
                        </div>

                        <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 mt-1.5">
                          {w.distanceKm > 0 && (
                            <span className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-50">
                              {w.distanceKm.toFixed(2)} km
                            </span>
                          )}
                          <span className="font-mono tabular-nums text-base font-semibold text-slate-700 dark:text-slate-300">
                            {formatDurationMMSS(w.durationSec)}
                          </span>
                          {paceSec !== null && (
                            <span className="font-mono tabular-nums text-sm font-semibold text-orange-600 dark:text-orange-400">
                              {formatPaceMinPerKm(paceSec)}
                            </span>
                          )}
                        </div>

                        {(w.avgHr || w.maxHr) && (
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 mt-1">
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              {w.avgHr ? `Avg ${w.avgHr} bpm` : ''}
                              {w.avgHr && w.maxHr ? ' · ' : ''}
                              {w.maxHr ? `Max ${w.maxHr} bpm` : ''}
                            </span>
                            {hrZone && (
                              <>
                                <span aria-hidden="true" className="text-slate-400">·</span>
                                <span className="font-sans text-slate-500 dark:text-slate-400">
                                  Z{hrZone.zone} {hrZone.name}
                                </span>
                              </>
                            )}
                            {w.hrSourceApp && (
                              <>
                                <span aria-hidden="true" className="text-slate-400">·</span>
                                <span className="font-sans text-slate-500 dark:text-slate-400">
                                  {w.hrSourceApp}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        {shoe && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Shoe: <span className="text-slate-700 dark:text-slate-300 font-medium">{shoe.name}</span>
                          </p>
                        )}

                        {w.notes && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-snug">
                            {w.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditExisting(w)}
                          aria-label="Edit workout"
                          className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === w.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteWorkout(w.id);
                              setConfirmDeleteId(null);
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(w.id)}
                            aria-label="Delete workout"
                            className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

