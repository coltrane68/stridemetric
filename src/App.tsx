import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck,
  ClipboardPlus,
  Gauge,
  BarChart3,
  Sun,
  Moon,
} from 'lucide-react';
import { AppData, LogPrefill, PlannedSession, Shoe, TabId, WorkoutLog } from './types';
import {
  createDefaultData,
  loadAppData,
  MAX_WEEKLY_PLAN_DAYS,
  saveAppData,
  THEME_KEY,
  validateAndNormalizeData,
} from './utils/storage';
import { getWeekKey, parseISODateLocal } from './utils/metrics';
import { TodayView } from './components/TodayView';
import { LogView } from './components/LogView';
import { CalculatorView } from './components/CalculatorView';
import { StatsView } from './components/StatsView';
import { ShoeModal } from './components/ShoeModal';

const NAV_TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'today', label: 'Today', icon: CalendarCheck },
  { id: 'log', label: 'Log', icon: ClipboardPlus },
  { id: 'calculator', label: 'Calculator', icon: Gauge },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
];

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData());
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const [logPrefill, setLogPrefill] = useState<LogPrefill | null>(null);
  const [shoeModalOpen, setShoeModalOpen] = useState(false);
  const [editingShoe, setEditingShoe] = useState<Shoe | null>(null);

  // Persist app data cleanly to localStorage
  useEffect(() => {
    saveAppData(data);
  }, [data]);

  // Sync light/dark theme class on <html>
  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  // Plan & Checklist Handlers
  const handleTogglePlanComplete = useCallback((weekKey: string, sessionId: string) => {
    const key = `${weekKey}_${sessionId}`;
    setData((prev) => ({
      ...prev,
      completedPlanSessions: {
        ...prev.completedPlanSessions,
        [key]: !prev.completedPlanSessions[key],
      },
    }));
  }, []);

  const handleToggleChecklistStep = useCallback(
    (weekKey: string, sessionId: string, stepIndex: number) => {
      const key = `${weekKey}_${sessionId}_${stepIndex}`;
      setData((prev) => ({
        ...prev,
        completedChecklistSteps: {
          ...prev.completedChecklistSteps,
          [key]: !prev.completedChecklistSteps[key],
        },
      }));
    },
    []
  );

  const handleSavePlanSession = useCallback((session: PlannedSession) => {
    setData((prev) => {
      const exists = prev.weeklyPlan.some((s) => s.id === session.id);
      if (exists) {
        return {
          ...prev,
          weeklyPlan: prev.weeklyPlan.map((s) => (s.id === session.id ? session : s)),
        };
      }
      if (prev.weeklyPlan.length >= MAX_WEEKLY_PLAN_DAYS) {
        return prev;
      }
      return {
        ...prev,
        weeklyPlan: [...prev.weeklyPlan, session],
      };
    });
  }, []);

  const handleDeletePlanSession = useCallback((sessionId: string) => {
    setData((prev) => ({
      ...prev,
      weeklyPlan: prev.weeklyPlan.filter((s) => s.id !== sessionId),
    }));
  }, []);

  const handleQuickLog = useCallback((prefill: LogPrefill) => {
    setLogPrefill(prefill);
    setActiveTab('log');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClearPrefill = useCallback(() => {
    setLogPrefill(null);
  }, []);

  // Workout Handlers
  const handleSaveWorkout = useCallback((workout: WorkoutLog) => {
    setData((prev) => {
      const exists = prev.workouts.some((w) => w.id === workout.id);
      const nextWorkouts = exists
        ? prev.workouts.map((w) => (w.id === workout.id ? workout : w))
        : [workout, ...prev.workouts];

      // Auto-mark matching weekly plan session complete if linked
      let nextCompleted = prev.completedPlanSessions;
      if (workout.planSessionId) {
        const wk = getWeekKey(parseISODateLocal(workout.date));
        nextCompleted = {
          ...prev.completedPlanSessions,
          [`${wk}_${workout.planSessionId}`]: true,
        };
      }

      return {
        ...prev,
        workouts: nextWorkouts,
        completedPlanSessions: nextCompleted,
      };
    });
  }, []);

  const handleDeleteWorkout = useCallback((workoutId: string) => {
    setData((prev) => ({
      ...prev,
      workouts: prev.workouts.filter((w) => w.id !== workoutId),
    }));
  }, []);

  // Shoe Handlers
  const handleOpenShoeModal = useCallback((shoe: Shoe | null) => {
    setEditingShoe(shoe);
    setShoeModalOpen(true);
  }, []);

  const handleSaveShoe = useCallback((shoe: Shoe) => {
    setData((prev) => {
      const exists = prev.shoes.some((s) => s.id === shoe.id);
      return {
        ...prev,
        shoes: exists
          ? prev.shoes.map((s) => (s.id === shoe.id ? shoe : s))
          : [...prev.shoes, shoe],
      };
    });
  }, []);

  const handleDeleteShoe = useCallback((shoeId: string) => {
    setData((prev) => ({
      ...prev,
      shoes: prev.shoes.filter((s) => s.id !== shoeId),
      workouts: prev.workouts.map((w) => (w.shoeId === shoeId ? { ...w, shoeId: undefined } : w)),
    }));
  }, []);

  // Goal & Backup Handlers
  const handleUpdateWeeklyGoal = useCallback((km: number) => {
    setData((prev) => ({
      ...prev,
      weeklyDistanceGoalKm: km,
    }));
  }, []);

  const handleUpdateMaxHrSetting = useCallback((bpm: number) => {
    setData((prev) => ({
      ...prev,
      maxHrSetting: bpm,
    }));
  }, []);

  const handleImportJson = useCallback((rawJson: string): { ok: boolean; message: string } => {
    try {
      const parsed = JSON.parse(rawJson);
      const normalized = validateAndNormalizeData(parsed);
      setData(normalized);
      return {
        ok: true,
        message: `Imported ${normalized.workouts.length} workouts, ${normalized.shoes.length} shoes, and ${normalized.weeklyPlan.length} planned days.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Invalid JSON backup file.',
      };
    }
  }, []);

  const handleResetDefaultData = useCallback(() => {
    setData(createDefaultData());
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-50 flex flex-col">
      {/* Top Bar: Static on mobile (keeps fixed sticky chrome < 10% viewport height), sticky on desktop */}
      <header className="md:sticky md:top-0 z-30 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-md"
          >
            StrideMetric
          </button>

          {/* Zone 2: Clean Desktop Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-7 text-sm font-medium"
            aria-label="Primary navigation"
          >
            {NAV_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1.5 border-b-2 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'border-orange-600 dark:border-orange-400 text-slate-900 dark:text-white font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: High-Contrast Light / Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 pb-24 md:pb-12">
        {activeTab === 'today' && (
          <TodayView
            weeklyPlan={data.weeklyPlan}
            completedPlanSessions={data.completedPlanSessions}
            completedChecklistSteps={data.completedChecklistSteps}
            workouts={data.workouts}
            weeklyDistanceGoalKm={data.weeklyDistanceGoalKm}
            onTogglePlanComplete={handleTogglePlanComplete}
            onToggleChecklistStep={handleToggleChecklistStep}
            onSavePlanSession={handleSavePlanSession}
            onDeletePlanSession={handleDeletePlanSession}
            onQuickLog={handleQuickLog}
          />
        )}

        {activeTab === 'log' && (
          <LogView
            workouts={data.workouts}
            shoes={data.shoes}
            maxHrSetting={data.maxHrSetting || 190}
            prefill={logPrefill}
            onClearPrefill={handleClearPrefill}
            onSaveWorkout={handleSaveWorkout}
            onDeleteWorkout={handleDeleteWorkout}
            onOpenShoeModal={handleOpenShoeModal}
          />
        )}

        {activeTab === 'calculator' && <CalculatorView />}

        {activeTab === 'stats' && (
          <StatsView
            data={data}
            onUpdateWeeklyGoal={handleUpdateWeeklyGoal}
            onUpdateMaxHrSetting={handleUpdateMaxHrSetting}
            onOpenShoeModal={handleOpenShoeModal}
            onImportJson={handleImportJson}
            onResetDefaultData={handleResetDefaultData}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb Navigation Anchor) */}
      <nav
        aria-label="Bottom tab navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-4 h-16">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${
                  active
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-[22px] h-[22px] ${active ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
                <span className="text-[11px] font-semibold tracking-tight leading-none whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Shared Shoe Rotation Add/Edit Modal */}
      <ShoeModal
        isOpen={shoeModalOpen}
        shoe={editingShoe}
        workouts={data.workouts}
        onClose={() => setShoeModalOpen(false)}
        onSave={handleSaveShoe}
        onDelete={data.shoes.length > 1 ? handleDeleteShoe : undefined}
      />
    </div>
  );
}
