import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  formatDurationMMSS,
  formatPaceMinPerKm,
  paceSecToSpeedKmh,
  speedKmhToPaceSec,
} from '../utils/metrics';

interface RacePreset {
  label: string;
  sublabel: string;
  distanceKm: 5 | 10;
  targetTotalSec: number;
}

const RACE_PRESETS: RacePreset[] = [
  { label: 'Sub-20 5K', sublabel: '19:59 · 4:00 /km', distanceKm: 5, targetTotalSec: 19 * 60 + 59 },
  { label: 'Sub-50 10K', sublabel: '49:59 · 5:00 /km', distanceKm: 10, targetTotalSec: 49 * 60 + 59 },
  { label: 'Sub-22 5K', sublabel: '21:59 · 4:24 /km', distanceKm: 5, targetTotalSec: 21 * 60 + 59 },
  { label: 'Sub-45 10K', sublabel: '44:59 · 4:30 /km', distanceKm: 10, targetTotalSec: 44 * 60 + 59 },
  { label: 'Sub-25 5K', sublabel: '24:59 · 5:00 /km', distanceKm: 5, targetTotalSec: 24 * 60 + 59 },
  { label: 'Sub-40 10K', sublabel: '39:59 · 4:00 /km', distanceKm: 10, targetTotalSec: 39 * 60 + 59 },
];

const TREADMILL_SPEED_STEPS = [
  10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0, 14.5, 15.0, 15.5, 16.0, 16.5, 17.0, 17.5,
];

const MIN_PACE_SEC = 180; // 3:00 /km (20.0 km/h)
const MAX_PACE_SEC = 480; // 8:00 /km (7.5 km/h)

export const CalculatorView: React.FC = () => {
  const [raceDistance, setRaceDistance] = useState<5 | 10>(5);
  // Default to Sub-20 5K (19:59 -> 239.8 sec/km -> 15.01 km/h)
  const [paceSecPerKm, setPaceSecPerKm] = useState<number>((19 * 60 + 59) / 5);

  const clampedPace = Math.min(MAX_PACE_SEC, Math.max(MIN_PACE_SEC, paceSecPerKm));
  const treadmillSpeedKmh = paceSecToSpeedKmh(clampedPace) ?? 12.0;
  const finish5kSec = clampedPace * 5;
  const finish10kSec = clampedPace * 10;
  const activeFinishSec = raceDistance === 5 ? finish5kSec : finish10kSec;

  const activeMins = Math.floor(Math.round(activeFinishSec) / 60);
  const activeSecs = Math.round(activeFinishSec) % 60;

  const paceMins = Math.floor(Math.round(clampedPace) / 60);
  const paceSecs = Math.round(clampedPace) % 60;

  const applyPreset = (preset: RacePreset) => {
    setRaceDistance(preset.distanceKm);
    setPaceSecPerKm(preset.targetTotalSec / preset.distanceKm);
  };

  const updateFinishTime = (newMins: number, newSecs: number) => {
    const safeMins = Math.max(10, Math.min(90, newMins));
    const safeSecs = Math.max(0, Math.min(59, newSecs));
    const total = safeMins * 60 + safeSecs;
    const nextPace = total / raceDistance;
    setPaceSecPerKm(Math.min(MAX_PACE_SEC, Math.max(MIN_PACE_SEC, nextPace)));
  };

  const stepFinishTime = (deltaSec: number) => {
    const nextTotal = Math.round(activeFinishSec) + deltaSec;
    const nextPace = nextTotal / raceDistance;
    setPaceSecPerKm(Math.min(MAX_PACE_SEC, Math.max(MIN_PACE_SEC, nextPace)));
  };

  const updatePace = (newMins: number, newSecs: number) => {
    const total = Math.max(0, newMins) * 60 + Math.max(0, Math.min(59, newSecs));
    setPaceSecPerKm(Math.min(MAX_PACE_SEC, Math.max(MIN_PACE_SEC, total)));
  };

  const stepSpeed = (deltaKmh: number) => {
    const nextSpeed = Math.round((treadmillSpeedKmh + deltaKmh) * 10) / 10;
    const clampedSpeed = Math.min(20.0, Math.max(7.5, nextSpeed));
    const nextPace = speedKmhToPaceSec(clampedSpeed);
    if (nextPace) setPaceSecPerKm(nextPace);
  };

  const setExactSpeed = (speedKmh: number) => {
    const clampedSpeed = Math.min(20.0, Math.max(7.5, speedKmh));
    const nextPace = speedKmhToPaceSec(clampedSpeed);
    if (nextPace) setPaceSecPerKm(nextPace);
  };

  const splits = Array.from({ length: raceDistance }, (_, idx) => {
    const km = idx + 1;
    return {
      km,
      cumulativeSec: clampedPace * km,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Target Pace &amp; Treadmill Calculator
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Convert instantaneously between 5K/10K finish times, min/km pace, and km/h treadmill speed.
        </p>
      </div>

      {/* Quick Presets */}
      <div>
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          Quick Race Presets
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {RACE_PRESETS.map((preset) => {
            const targetPace = preset.targetTotalSec / preset.distanceKm;
            const isSelected =
              raceDistance === preset.distanceKm && Math.abs(clampedPace - targetPace) < 0.35;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`min-h-[58px] px-3 py-2 rounded-xl border text-left transition-colors ${
                  isSelected
                    ? 'bg-orange-600 text-white border-orange-600 dark:bg-orange-500 dark:border-orange-500'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span className="block text-sm font-bold leading-tight whitespace-nowrap">
                  {preset.label}
                </span>
                <span
                  className={`block text-[11px] font-mono tabular-nums mt-0.5 whitespace-nowrap ${
                    isSelected ? 'text-orange-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {preset.sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Synced Metric Readout Strip */}
      <section className="bg-slate-900 dark:bg-[#111827] text-white border border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <span className="text-xs text-slate-400 block">Required Pace</span>
            <span className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-orange-400 mt-1 block">
              {formatPaceMinPerKm(clampedPace, false)}
              <span className="text-sm font-medium text-slate-400 ml-1">/km</span>
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Treadmill Speed</span>
            <span className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-white mt-1 block">
              {treadmillSpeedKmh.toFixed(1)}
              <span className="text-sm font-medium text-slate-400 ml-1">km/h</span>
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Projected 5K Finish</span>
            <span className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-100 mt-1 block">
              {formatDurationMMSS(finish5kSec)}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Projected 10K Finish</span>
            <span className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-100 mt-1 block">
              {formatDurationMMSS(finish10kSec)}
            </span>
          </div>
        </div>
      </section>

      {/* Main 2-Column Interactive Controls + Splits / Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Interactive Bidirectional Dials */}
        <section className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6">
          {/* 1. Target Finish Time Control */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                1. Target Finish Time
              </span>
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {([5, 10] as const).map((dist) => (
                  <button
                    key={dist}
                    type="button"
                    onClick={() => setRaceDistance(dist)}
                    className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                      raceDistance === dist
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {dist}K Race
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepFinishTime(-15)}
                aria-label="Decrease target finish time by 15 seconds"
                className="min-h-[48px] min-w-[48px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 flex items-center justify-center gap-1 min-h-[48px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                <input
                  aria-label="Target finish minutes"
                  type="number"
                  min={15}
                  max={80}
                  inputMode="numeric"
                  value={activeMins}
                  onChange={(e) => updateFinishTime(parseInt(e.target.value, 10) || 15, activeSecs)}
                  className="w-16 text-right bg-transparent font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50 focus:outline-none"
                />
                <span className="font-mono font-bold text-slate-400 text-lg">:</span>
                <input
                  aria-label="Target finish seconds"
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={activeSecs.toString().padStart(2, '0')}
                  onChange={(e) => updateFinishTime(activeMins, parseInt(e.target.value, 10) || 0)}
                  className="w-14 text-left bg-transparent font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50 focus:outline-none"
                />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">
                  mm:ss
                </span>
              </div>

              <button
                type="button"
                onClick={() => stepFinishTime(15)}
                aria-label="Increase target finish time by 15 seconds"
                className="min-h-[48px] min-w-[48px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* 2. Pace (min/km) Slider & Direct Edit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="pace-slider"
                className="text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                2. Pace (min/km)
              </label>
              <span className="font-mono tabular-nums text-base font-bold text-orange-600 dark:text-orange-400">
                {formatPaceMinPerKm(clampedPace)}
              </span>
            </div>

            <input
              id="pace-slider"
              type="range"
              min={MIN_PACE_SEC}
              max={MAX_PACE_SEC}
              step={1}
              value={Math.round(clampedPace)}
              onChange={(e) => setPaceSecPerKm(Number(e.target.value))}
              className="w-full metric-slider my-2"
            />

            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mb-3">
              <span>3:00 /km (Fast)</span>
              <span>5:30 /km</span>
              <span>8:00 /km (Easy)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaceSecPerKm(Math.max(MIN_PACE_SEC, clampedPace - 1))}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                -1 sec/km
              </button>
              <div className="flex items-center justify-center gap-0.5 px-3 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <input
                  aria-label="Pace minutes"
                  type="number"
                  min={3}
                  max={8}
                  value={paceMins}
                  onChange={(e) => updatePace(parseInt(e.target.value, 10) || 4, paceSecs)}
                  className="w-9 text-right bg-transparent font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-slate-50 focus:outline-none"
                />
                <span className="font-mono text-slate-400">:</span>
                <input
                  aria-label="Pace seconds"
                  type="number"
                  min={0}
                  max={59}
                  value={paceSecs.toString().padStart(2, '0')}
                  onChange={(e) => updatePace(paceMins, parseInt(e.target.value, 10) || 0)}
                  className="w-9 text-left bg-transparent font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-slate-50 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setPaceSecPerKm(Math.min(MAX_PACE_SEC, clampedPace + 1))}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                +1 sec/km
              </button>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* 3. Treadmill Speed (km/h) Console Stepper */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="speed-slider"
                className="text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                3. Treadmill Speed (km/h)
              </label>
              <span className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-50">
                {treadmillSpeedKmh.toFixed(1)} km/h
              </span>
            </div>

            <input
              id="speed-slider"
              type="range"
              min={7.5}
              max={20.0}
              step={0.1}
              value={Number(treadmillSpeedKmh.toFixed(1))}
              onChange={(e) => setExactSpeed(Number(e.target.value))}
              className="w-full metric-slider my-2"
            />

            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => stepSpeed(-0.5)}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                -0.5
              </button>
              <button
                type="button"
                onClick={() => stepSpeed(-0.1)}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                -0.1
              </button>
              <button
                type="button"
                onClick={() => stepSpeed(0.1)}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                +0.1
              </button>
              <button
                type="button"
                onClick={() => stepSpeed(0.5)}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                +0.5
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
              Tip: Setting treadmill incline to 1.0% closely matches outdoor road wind resistance at paces faster than 5:00 /km.
            </p>
          </div>
        </section>

        {/* RIGHT: Km Split Table & Treadmill Conversion Reference */}
        <div className="lg:col-span-6 space-y-6">
          {/* Kilometer Splits */}
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                {raceDistance}K Kilometer Splits
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Even split · {formatPaceMinPerKm(clampedPace)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {splits.map((s) => (
                <div
                  key={s.km}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
                >
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    KM {s.km}
                  </span>
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                    {formatDurationMMSS(s.cumulativeSec)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Interactive Treadmill Speed Chart */}
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                Treadmill Reference Chart
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Tap row to select
              </span>
            </div>

            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-2 font-medium">Speed</th>
                    <th className="py-2 font-medium">Pace</th>
                    <th className="py-2 font-medium text-right">5K</th>
                    <th className="py-2 font-medium text-right">10K</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums text-sm">
                  {TREADMILL_SPEED_STEPS.map((spd) => {
                    const rowPace = 3600 / spd;
                    const isClosest = Math.abs(treadmillSpeedKmh - spd) < 0.25;
                    return (
                      <tr
                        key={spd}
                        onClick={() => setExactSpeed(spd)}
                        className={`cursor-pointer transition-colors ${
                          isClosest
                            ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 font-bold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <td className="py-2.5 pr-2">{spd.toFixed(1)} km/h</td>
                        <td className="py-2.5 pr-2">{formatPaceMinPerKm(rowPace)}</td>
                        <td className="py-2.5 text-right">{formatDurationMMSS(rowPace * 5)}</td>
                        <td className="py-2.5 text-right">{formatDurationMMSS(rowPace * 10)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
