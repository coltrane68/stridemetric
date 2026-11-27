import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bluetooth, BluetoothConnected, Play, Square, Check, AlertCircle, Battery } from 'lucide-react';
import { formatDurationMMSS, getHrZone } from '../utils/metrics';

// Minimal Web Bluetooth typings for TypeScript without extra global dependencies
interface BleCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BleCharacteristic>;
  stopNotifications(): Promise<BleCharacteristic>;
  readValue(): Promise<DataView>;
}

interface BleService {
  getCharacteristic(uuid: string | number): Promise<BleCharacteristic>;
}

interface BleRemoteGattServer {
  connected: boolean;
  connect(): Promise<BleRemoteGattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string | number): Promise<BleService>;
}

interface BleDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BleRemoteGattServer;
}

interface WebBluetoothApi {
  requestDevice(options: {
    filters: Array<{ services?: Array<string | number>; namePrefix?: string }>;
    optionalServices?: Array<string | number>;
  }): Promise<BleDevice>;
}

export interface GarminHrmResult {
  avgHr: number;
  maxHr: number;
  durationSec?: number;
  deviceName: string;
  samples: number[];
}

interface GarminHrmPanelProps {
  maxHrSetting: number;
  onApplyHrmData: (result: GarminHrmResult, applyDuration: boolean) => void;
}

/**
 * Decodes standard Bluetooth SIG Heart Rate Measurement characteristic (0x2A37)
 * used by Garmin HRM-Pro, HRM-Pro Plus, and standard BLE chest straps.
 */
function parseHeartRateMeasurement(value: DataView): {
  bpm: number;
  contactDetected: boolean | null;
} {
  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected = contactSupported ? (flags & 0x02) !== 0 : null;

  const bpm = is16Bit ? value.getUint16(1, true) : value.getUint8(1);
  return { bpm, contactDetected };
}

function downsample(values: number[], targetLen = 60): number[] {
  if (values.length <= targetLen) return values;
  const result: number[] = [];
  const step = values.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    const slice = values.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(Math.round(avg));
  }
  return result;
}

export const GarminHrmPanel: React.FC<GarminHrmPanelProps> = ({
  maxHrSetting,
  onApplyHrmData,
}) => {
  const bluetoothApi =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { bluetooth?: WebBluetoothApi }).bluetooth
      : undefined;

  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('Garmin HRM-Pro');
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [contactWarning, setContactWarning] = useState<boolean>(false);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [samples, setSamples] = useState<number[]>([]);
  const [applyDurationChecked, setApplyDurationChecked] = useState<boolean>(false);
  const [appliedBanner, setAppliedBanner] = useState<boolean>(false);

  const deviceRef = useRef<BleDevice | null>(null);
  const hrCharRef = useRef<BleCharacteristic | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const handleNotification = useCallback((event: Event) => {
    const target = event.target as BleCharacteristic | null;
    if (!target?.value) return;
    const { bpm, contactDetected } = parseHeartRateMeasurement(target.value);
    if (bpm >= 30 && bpm <= 245) {
      setLiveBpm(bpm);
      setContactWarning(contactDetected === false);
      if (isRecordingRef.current) {
        setSamples((prev) => [...prev, bpm]);
      }
    }
  }, []);

  const disconnectStrap = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    if (hrCharRef.current) {
      hrCharRef.current.removeEventListener('characteristicvaluechanged', handleNotification);
      hrCharRef.current.stopNotifications().catch(() => {});
      hrCharRef.current = null;
    }
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    deviceRef.current = null;
    setStatus('idle');
    setLiveBpm(null);
    setBatteryPct(null);
    setContactWarning(false);
  }, [handleNotification]);

  useEffect(() => {
    return () => {
      disconnectStrap();
    };
  }, [disconnectStrap]);

  const connectStrap = async () => {
    if (!bluetoothApi) {
      setStatus('error');
      setErrorMsg(
        'Web Bluetooth is not available in this browser. Use Chrome or Edge on Android, macOS, or Windows (outside restricted iframes), or switch to Screenshot Import / Manual Input.'
      );
      return;
    }

    setStatus('connecting');
    setErrorMsg('');
    setAppliedBanner(false);

    try {
      const device = await bluetoothApi.requestDevice({
        filters: [{ services: ['heart_rate'] }, { namePrefix: 'HRM' }, { namePrefix: 'Garmin' }],
        optionalServices: ['heart_rate', 'battery_service'],
      });

      deviceRef.current = device;
      setDeviceName(device.name || 'Garmin HRM-Pro');

      device.addEventListener('gattserverdisconnected', () => {
        setStatus('idle');
        setLiveBpm(null);
        setIsRecording(false);
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      });

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Could not open GATT connection to strap.');
      }

      const hrService = await server.getPrimaryService('heart_rate');
      const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
      hrCharRef.current = hrChar;

      hrChar.addEventListener('characteristicvaluechanged', handleNotification);
      await hrChar.startNotifications();

      // Optionally read strap battery percentage
      try {
        const battService = await server.getPrimaryService('battery_service');
        const battChar = await battService.getCharacteristic('battery_level');
        const battView = await battChar.readValue();
        setBatteryPct(battView.getUint8(0));
      } catch {
        setBatteryPct(null);
      }

      setStatus('connected');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bluetooth pairing cancelled or failed.';
      if (message.toLowerCase().includes('cancel')) {
        setStatus('idle');
        setErrorMsg('');
      } else {
        setStatus('error');
        setErrorMsg(
          message.includes('permissions policy') || message.includes('disallowed')
            ? 'Bluetooth access is blocked inside this embedded preview frame. Open the app directly in Chrome or Edge to pair your Garmin HRM-Pro strap.'
            : message
        );
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } else {
      setSamples(liveBpm ? [liveBpm] : []);
      setElapsedSec(0);
      setAppliedBanner(false);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    }
  };

  const recordedAvg =
    samples.length > 0 ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null;
  const recordedMax = samples.length > 0 ? Math.max(...samples) : null;
  const liveZone = liveBpm ? getHrZone(liveBpm, maxHrSetting) : null;

  const handleApply = () => {
    const avgToUse = recordedAvg ?? liveBpm;
    const maxToUse = recordedMax ?? liveBpm;
    if (!avgToUse || !maxToUse) return;

    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    onApplyHrmData(
      {
        avgHr: avgToUse,
        maxHr: maxToUse,
        durationSec: elapsedSec > 0 ? elapsedSec : undefined,
        deviceName,
        samples: downsample(samples.length > 0 ? samples : [avgToUse]),
      },
      applyDurationChecked && elapsedSec > 0
    );
    setAppliedBanner(true);
  };

  // Build SVG polyline points for live trace
  const traceSamples = samples.slice(-50);
  const traceMin = traceSamples.length > 1 ? Math.min(...traceSamples) - 5 : 100;
  const traceMax = traceSamples.length > 1 ? Math.max(...traceSamples) + 5 : 190;
  const traceRange = Math.max(15, traceMax - traceMin);
  const polylinePoints =
    traceSamples.length > 1
      ? traceSamples
          .map((val, idx) => {
            const x = (idx / (traceSamples.length - 1)) * 280;
            const y = 44 - ((val - traceMin) / traceRange) * 40;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Garmin HRM-Pro / BLE Chest Strap
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Wet electrodes and wear strap so it broadcasts over Bluetooth (0x180D).
          </p>
        </div>

        {status === 'connected' ? (
          <button
            type="button"
            onClick={disconnectStrap}
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={status === 'connecting'}
            onClick={connectStrap}
            className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:opacity-90 disabled:opacity-50"
          >
            <Bluetooth className="w-4 h-4" />
            {status === 'connecting' ? 'Scanning...' : 'Connect Strap'}
          </button>
        )}
      </div>

      {status === 'connected' && (
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <BluetoothConnected className="w-4 h-4" />
              {deviceName}
            </span>
            {batteryPct !== null && (
              <span className="flex items-center gap-1 font-mono tabular-nums">
                <Battery className="w-3.5 h-3.5" />
                {batteryPct}%
              </span>
            )}
          </div>

          {contactWarning && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Weak electrode contact detected — moisten the chest strap sensors.
            </p>
          )}

          {/* Live Telemetry Readout */}
          <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Live HR</span>
              <span className="font-mono tabular-nums text-xl font-bold text-rose-600 dark:text-rose-400">
                {liveBpm ?? '—'}
              </span>
              <span className="text-[11px] text-slate-500 ml-1">bpm</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Avg / Max</span>
              <span className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                {recordedAvg ?? '—'} / {recordedMax ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                {liveZone ? `Z${liveZone.zone} · ${liveZone.name}` : 'Timer'}
              </span>
              <span className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                {formatDurationMMSS(elapsedSec)}
              </span>
            </div>
          </div>

          {/* Live HR Sparkline */}
          {traceSamples.length > 1 && (
            <div className="px-2 py-1.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <svg viewBox="0 0 280 48" className="w-full h-12 overflow-visible" aria-label="Live heart rate trace">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-rose-600 dark:text-rose-400"
                  points={polylinePoints}
                />
              </svg>
            </div>
          )}

          {/* Recording Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleRecording}
              className={`flex-1 min-h-[44px] px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {samples.length > 0 ? 'Restart Recording' : 'Start Recording'}
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!recordedAvg && !liveBpm}
              onClick={handleApply}
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              Apply HR to Log
            </button>
          </div>

          {elapsedSec > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyDurationChecked}
                onChange={(e) => setApplyDurationChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-orange-600"
              />
              Also copy recorded duration ({formatDurationMMSS(elapsedSec)}) into workout form
            </label>
          )}
        </div>
      )}

      {appliedBanner && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <Check className="w-4 h-4 shrink-0" />
          Heart rate synced from {deviceName} into your workout entry.
        </p>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
