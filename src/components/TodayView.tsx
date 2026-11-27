import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Circle,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  Calendar,
  X,
} from 'lucide-react';
import {
  ActivityType,
  DayIndex,
  LogPrefill,
  PlanCategory,
  PlannedSession,
  WorkoutLog,
} from '../types';
import {
  DAY_NAMES_FULL,
  DAY_NAMES_SHORT,
  getMondayBasedDayIndex,
  getWeekDates,
  getWeekKey,
  toISODateLocal,
} from '../utils/metrics';
import { MAX_WEEKLY_PLAN_DAYS } from '../utils/storage';

interface TodayViewProps {
  weeklyPlan: PlannedSession[];
  completedPlanSessions: Record<string, boolean>;
  completedChecklistSteps: Record<string, boolean>;
  workouts: WorkoutLog[];
  weeklyDistanceGoalKm: number;
  onTogglePlanComplete: (weekKey: string, sessionId: string) => void;
  onToggleChecklistStep: (weekKey: string, sessionId: string, stepIndex: number) => void;
  onSavePlanSession: (session: PlannedSession) => void;
  onDeletePlanSession: (sessionId: string) => void;
  onQuickLog: (prefill: LogPrefill) => void;
}

const CATEGORY_DEFAULT_ACTIVITY: Record<PlanCategory, ActivityType> = {
  Running: 'Outdoor Run',
  'Indoor Cycling': 'Indoor Bike',
  'Home Strength/Prehab': 'Strength/Prehab',
};

export const TodayView: React.FC<TodayViewProps> = ({
  weeklyPlan,
  completedPlanSessions,
  completedChecklistSteps,
  workouts,
  weeklyDistanceGoalKm,
  onTogglePlanComplete,
  onToggleChecklistStep,
  onSavePlanSession,
  onDeletePlanSession,
  onQuickLog,
}) => {
  const today = new Date();
  const todayIndex = getMondayBasedDayIndex(today);
  const weekKey = getWeekKey(today);
  const weekDates = getWeekDates(today);

  const [selectedDay, setSelectedDay] = useState<DayIndex>(todayIndex);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<PlannedSession | null>(null);

  // Plan editor form state
  const [formDay, setFormDay] = useState<DayIndex>(0);
  const [formCategory, setFormCategory] = useState<PlanCategory>('Running');
  const [formTitle, setFormTitle] = useState('');
  const [formDistKm, setFormDistKm] = useState('');
  const [formDurationMin, setFormDurationMin] = useState('');
  const [formPaceLabel, setFormPaceLabel] = useState('');
  const [formChecklistText, setFormChecklistText] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedPlan = [...weeklyPlan].sort((a, b) => a.dayIndex - b.dayIndex);
  const planByDay = new Map<DayIndex, PlannedSession>();
  sortedPlan.forEach((s) => planByDay.set(s.dayIndex, s));

  const selectedSession = planByDay.get(selectedDay) ?? null;
  const selectedDateObj = weekDates[selectedDay];
  const selectedDateIso = toISODateLocal(selectedDateObj);
  const isSelectedToday = selectedDay === todayIndex;

  // Weekly metrics for current week
  const weekIsoSet = new Set(weekDates.map(toISODateLocal));
  const thisWeekWorkouts = workouts.filter((w) => weekIsoSet.has(w.date));
  const thisWeekDistanceKm = thisWeekWorkouts.reduce((sum, w) => sum + w.distanceKm, 0);
  const completedCount = sortedPlan.filter(
    (s) => completedPlanSessions[`${weekKey}_${s.id}`]
  ).length;

  // Next upcoming scheduled session for rest days
  const nextSession =
    sortedPlan.find((s) => s.dayIndex > selectedDay) ?? sortedPlan[0] ?? null;

  const occupiedDays = new Set(weeklyPlan.map((s) => s.dayIndex));
  const canAddDay = weeklyPlan.length < MAX_WEEKLY_PLAN_DAYS;

  const openNewSessionEditor = (preferredDay?: DayIndex) => {
    if (!canAddDay) return;
    let targetDay: DayIndex = preferredDay ?? selectedDay;
    if (occupiedDays.has(targetDay)) {
      const firstFree = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).find((d) => !occupiedDays.has(d));
      targetDay = firstFree ?? 0;
    }
    setEditingSession(null);
    setFormDay(targetDay);
    setFormCategory('Running');
    setFormTitle('');
    setFormDistKm('5');
    setFormDurationMin('30');
    setFormPaceLabel('5:00 /km');
    setFormChecklistText('1 km easy warm-up\nMain set steady effort\n1 km cool-down');
    setFormNotes('');
    setEditorOpen(true);
  };

  const openEditSessionEditor = (session: PlannedSession) => {
    setEditingSession(session);
    setFormDay(session.dayIndex);
    setFormCategory(session.category);
    setFormTitle(session.title);
    setFormDistKm(session.targetDistanceKm ? String(session.targetDistanceKm) : '');
    setFormDurationMin(session.targetDurationMin ? String(session.targetDurationMin) : '');
    setFormPaceLabel(session.targetPaceLabel ?? '');
    setFormChecklistText(session.checklist.join('\n'));
    setFormNotes(session.notes ?? '');
    setEditorOpen(true);
  };

  const handleSaveEditor = (e: React.FormEvent) => {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title) return;

    const checklistLines = formChecklistText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const parsedDist = parseFloat(formDistKm);
    const parsedDur = parseInt(formDurationMin, 10);

    const updated: PlannedSession = {
      id: editingSession ? editingSession.id : `plan-${Date.now()}`,
      dayIndex: formDay,
      category: formCategory,
      defaultActivity: CATEGORY_DEFAULT_ACTIVITY[formCategory],
      title,
      targetDistanceKm: Number.isFinite(parsedDist) && parsedDist > 0 ? parsedDist : undefined,
      targetDurationMin: Number.isFinite(parsedDur) && parsedDur > 0 ? parsedDur : undefined,
      targetPaceLabel: formPaceLabel.trim() || undefined,
      checklist: checklistLines.length > 0 ? checklistLines : [title],
      notes: formNotes.trim() || undefined,
    };

    onSavePlanSession(updated);
    setSelectedDay(updated.dayIndex);
    setEditorOpen(false);
  };

  const isSelectedComplete = selectedSession
    ? Boolean(completedPlanSessions[`${weekKey}_${selectedSession.id}`])
    : false;

  const weekProgressPct =
    sortedPlan.length > 0 ? Math.min(100, Math.round((completedCount / sortedPlan.length) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Top Page Heading + Weekly Compact Progress Strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {today.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-0.5 text-balance">
            Weekly Training Schedule
          </h1>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block text-xs">Plan Done</span>
            <span className="font-mono tabular-nums font-bold text-lg text-slate-900 dark:text-slate-50">
              {completedCount}/{sortedPlan.length}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
          <div>
            <span className="text-slate-500 dark:text-slate-400 block text-xs">Week Volume</span>
            <span className="font-mono tabular-nums font-bold text-lg text-slate-900 dark:text-slate-50">
              {thisWeekDistanceKm.toFixed(1)}{' '}
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                / {weeklyDistanceGoalKm} km
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 7-Day Interactive Week Strip */}
      <div
        className="grid grid-cols-7 gap-1.5 sm:gap-2.5"
        role="tablist"
        aria-label="Days of the current week"
      >
        {weekDates.map((dateObj, idx) => {
          const dayIdx = idx as DayIndex;
          const session = planByDay.get(dayIdx);
          const isToday = dayIdx === todayIndex;
          const isSelected = dayIdx === selectedDay;
          const isDone = session ? Boolean(completedPlanSessions[`${weekKey}_${session.id}`]) : false;

          return (
            <button
              key={dayIdx}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedDay(dayIdx)}
              className={`min-h-[68px] sm:min-h-[76px] rounded-2xl border flex flex-col items-center justify-center gap-1 px-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100 shadow-sm'
                  : 'bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <span
                className={`text-[11px] font-medium ${
                  isSelected
                    ? 'text-slate-300 dark:text-slate-600'
                    : isToday
                    ? 'text-orange-600 dark:text-orange-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {DAY_NAMES_SHORT[dayIdx]}
              </span>
              <span className="font-mono tabular-nums text-base font-bold leading-none">
                {dateObj.getDate()}
              </span>
              <span className="h-4 flex items-center justify-center">
                {session ? (
                  isDone ? (
                    <Check
                      className={`w-3.5 h-3.5 stroke-[2.75] ${
                        isSelected
                          ? 'text-emerald-400 dark:text-emerald-600'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                      aria-label="Completed"
                    />
                  ) : (
                    <span
                      className={`text-[10px] font-semibold leading-none ${
                        isSelected
                          ? 'text-orange-300 dark:text-orange-600'
                          : 'text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      {session.category === 'Running'
                        ? 'Run'
                        : session.category === 'Indoor Cycling'
                        ? 'Bike'
                        : 'Str'}
                    </span>
                  )
                ) : (
                  <span
                    className={`text-[10px] leading-none ${
                      isSelected
                        ? 'text-slate-400 dark:text-slate-500'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    Rest
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Responsive Grid: Left = Today's / Selected Day Session Focus, Right = 4-Day Weekly Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* FOCAL ANCHOR: Today's Session & Daily Checklist */}
        <section className="lg:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className={isSelectedToday ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}>
                  {isSelectedToday ? "Today's Session" : `${DAY_NAMES_FULL[selectedDay]}'s Session`}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {selectedDateObj.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                {selectedSession && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{selectedSession.category}</span>
                  </>
                )}
              </div>

              {selectedSession ? (
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1.5 text-balance">
                  {selectedSession.title}
                </h2>
              ) : (
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1.5">
                  Rest &amp; Recovery Day
                </h2>
              )}
            </div>

            {selectedSession && (
              <button
                type="button"
                onClick={() => openEditSessionEditor(selectedSession)}
                aria-label="Edit this session"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>

          {selectedSession ? (
            <div className="mt-5 space-y-5">
              {/* Target Metric Strip (Unboxed typographic grid) */}
              <div className="grid grid-cols-3 gap-3 py-3.5 border-y border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Target Distance</span>
                  <span className="font-mono tabular-nums text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5 block">
                    {selectedSession.targetDistanceKm
                      ? `${selectedSession.targetDistanceKm.toFixed(1)} km`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Est. Duration</span>
                  <span className="font-mono tabular-nums text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5 block">
                    {selectedSession.targetDurationMin
                      ? `${selectedSession.targetDurationMin} min`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Target Effort</span>
                  <span className="font-mono tabular-nums text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-50 mt-0.5 block truncate">
                    {selectedSession.targetPaceLabel || 'Steady'}
                  </span>
                </div>
              </div>

              {/* Daily Checklist */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2.5">
                  Session Checklist
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {selectedSession.checklist.map((step, index) => {
                    const stepKey = `${weekKey}_${selectedSession.id}_${index}`;
                    const checked = Boolean(completedChecklistSteps[stepKey]) || isSelectedComplete;
                    return (
                      <li key={index}>
                        <button
                          type="button"
                          onClick={() => onToggleChecklistStep(weekKey, selectedSession.id, index)}
                          className="w-full min-h-[48px] py-2.5 flex items-start gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg"
                        >
                          {checked ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-orange-500 shrink-0 mt-0.5 transition-colors" />
                          )}
                          <span
                            className={`text-sm sm:text-[15px] leading-snug ${
                              checked
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {step}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {selectedSession.notes && (
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {selectedSession.notes}
                </p>
              )}

              {/* Primary Action Controls */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onTogglePlanComplete(weekKey, selectedSession.id)}
                  className={`flex-1 min-h-[50px] px-5 rounded-xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2 whitespace-nowrap transition-colors active:scale-[0.99] ${
                    isSelectedComplete
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white'
                  }`}
                >
                  <Check className="w-5 h-5 stroke-[2.5]" />
                  {isSelectedComplete ? 'Completed — Undo' : 'Mark Complete'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onQuickLog({
                      date: selectedDateIso,
                      activityType: selectedSession.defaultActivity,
                      distanceKm: selectedSession.targetDistanceKm ?? 0,
                      durationSec: (selectedSession.targetDurationMin ?? 30) * 60,
                      notes: selectedSession.title,
                      planSessionId: selectedSession.id,
                    })
                  }
                  className="min-h-[50px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                >
                  Log Details
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <p className="text-sm sm:text-[15px] text-slate-600 dark:text-slate-400 leading-relaxed">
                No structured workout scheduled for {DAY_NAMES_FULL[selectedDay]}. Protect your recovery between your 4 weekly training days with light walking, mobility, or sleep.
              </p>

              {nextSession && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Next Scheduled · {DAY_NAMES_FULL[nextSession.dayIndex]}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate block mt-0.5">
                      {nextSession.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDay(nextSession.dayIndex)}
                    className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
                  >
                    Preview
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onQuickLog({
                      date: selectedDateIso,
                      activityType: 'Padel',
                      distanceKm: 0,
                      durationSec: 60 * 60,
                    })
                  }
                  className="flex-1 min-h-[48px] px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  Log Extra Session (e.g. Padel)
                </button>

                {canAddDay && (
                  <button
                    type="button"
                    onClick={() => openNewSessionEditor(selectedDay)}
                    className="min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule {DAY_NAMES_SHORT[selectedDay]}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* SECONDARY PANEL: Full 4-Day-Maximum Weekly Schedule Overview */}
        <section className="lg:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                4-Day Weekly Plan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {sortedPlan.length} of {MAX_WEEKLY_PLAN_DAYS} max training days scheduled
              </p>
            </div>

            <button
              type="button"
              disabled={!canAddDay}
              onClick={() => openNewSessionEditor()}
              className={`min-h-[44px] px-3.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                canAddDay
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 hover:opacity-90'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
              }`}
              title={canAddDay ? 'Add a training day' : '4-day weekly maximum reached'}
            >
              <Plus className="w-4 h-4" />
              Add Day
            </button>
          </div>

          {/* Weekly Completion Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <span>This week&apos;s adherence</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-200">
                {weekProgressPct}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${weekProgressPct}%` }}
              />
            </div>
          </div>

          {/* Scheduled Sessions List */}
          {sortedPlan.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No training days scheduled yet. Add up to 4 weekly sessions.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedPlan.map((session) => {
                const done = Boolean(completedPlanSessions[`${weekKey}_${session.id}`]);
                const isSelected = session.dayIndex === selectedDay;
                return (
                  <li key={session.id} className="py-3 first:pt-1 last:pb-0">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onTogglePlanComplete(weekKey, session.id)}
                        aria-label={
                          done
                            ? `Mark ${session.title} incomplete`
                            : `Mark ${session.title} complete`
                        }
                        className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                          done
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-transparent hover:border-orange-500'
                        }`}
                      >
                        <Check className="w-5 h-5 stroke-[2.75]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedDay(session.dayIndex)}
                        className="flex-1 min-w-0 text-left py-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                      >
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className={`font-semibold ${
                              isSelected
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {DAY_NAMES_SHORT[session.dayIndex]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{session.category}</span>
                          {session.targetDistanceKm && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {session.targetDistanceKm} km
                              </span>
                            </>
                          )}
                        </div>
                        <p
                          className={`text-sm font-semibold truncate mt-0.5 ${
                            done
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {session.title}
                        </p>
                      </button>

                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditSessionEditor(session)}
                          aria-label={`Edit ${session.title}`}
                          className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === session.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              onDeletePlanSession(session.id);
                              setConfirmDeleteId(null);
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(session.id)}
                            aria-label={`Remove ${session.title}`}
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

          {!canAddDay && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              Maximum of 4 weekly training days active. Edit or remove a day to reschedule.
            </p>
          )}
        </section>
      </div>

      {/* Plan Session Editor Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-editor-title"
        >
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111827] border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-xl">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 id="plan-editor-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">
                {editingSession ? 'Edit Scheduled Session' : 'Add Training Day'}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close editor"
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditor} className="p-5 space-y-4">
              {/* Day of Week selector */}
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Training Day
                </span>
                <div className="grid grid-cols-7 gap-1.5">
                  {([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => {
                    const takenByOther =
                      occupiedDays.has(d) && (!editingSession || editingSession.dayIndex !== d);
                    const active = formDay === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={takenByOther}
                        onClick={() => setFormDay(d)}
                        className={`min-h-[44px] rounded-xl text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-orange-600 text-white'
                            : takenByOther
                            ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {DAY_NAMES_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category selector */}
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Focus Category
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['Running', 'Indoor Cycling', 'Home Strength/Prehab'] as PlanCategory[]).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormCategory(cat)}
                        className={`min-h-[44px] px-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                          formCategory === cat
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {cat === 'Home Strength/Prehab' ? 'Strength/Prehab' : cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="plan-title"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Session Title
                </label>
                <input
                  id="plan-title"
                  type="text"
                  required
                  placeholder="e.g. 5K Threshold Intervals"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="plan-dist"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Target km
                  </label>
                  <input
                    id="plan-dist"
                    type="number"
                    step="0.5"
                    min="0"
                    inputMode="decimal"
                    placeholder="Optional"
                    value={formDistKm}
                    onChange={(e) => setFormDistKm(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="plan-dur"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Est. min
                  </label>
                  <input
                    id="plan-dur"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="45"
                    value={formDurationMin}
                    onChange={(e) => setFormDurationMin(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="plan-pace"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Pace / Cue
                  </label>
                  <input
                    id="plan-pace"
                    type="text"
                    placeholder="4:30 /km"
                    value={formPaceLabel}
                    onChange={(e) => setFormPaceLabel(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="plan-checklist"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Checklist Steps (one per line)
                </label>
                <textarea
                  id="plan-checklist"
                  rows={3}
                  value={formChecklistText}
                  onChange={(e) => setFormChecklistText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label
                  htmlFor="plan-notes"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Notes
                </label>
                <input
                  id="plan-notes"
                  type="text"
                  placeholder="Optional coaching cues or treadmill incline"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="flex-1 min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm"
                >
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
