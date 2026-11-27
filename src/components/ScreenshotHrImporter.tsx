import React, { useRef, useState, useEffect } from 'react';
import { Upload, Check, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { ActivityType } from '../types';
import { formatDurationMMSS } from '../utils/metrics';

export interface ScreenshotExtraction {
  sourceApp: string;
  activityType: ActivityType | null;
  date: string | null;
  distanceKm: number | null;
  durationSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  notes: string;
}

interface ScreenshotHrImporterProps {
  onApplyExtraction: (data: ScreenshotExtraction, includeFullSession: boolean) => void;
}

/**
 * Normalizes and caps large mobile screenshots to <= 1600px width JPEG/PNG
 * so uploads stay fast and cleanly under the server payload cap.
 */
async function prepareImagePayload(file: File): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const previewUrl = URL.createObjectURL(file);

  // If image is already reasonably sized and standard web format, read directly
  const isWebImage = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type.toLowerCase());
  if (isWebImage && file.size <= 2.5 * 1024 * 1024) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        resolve(result.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''));
      };
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });
    return { base64, mimeType: file.type.toLowerCase(), previewUrl };
  }

  // Downscale oversized screenshots via canvas
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    return { base64, mimeType: 'image/jpeg', previewUrl };
  } catch {
    // Fallback to raw base64 (e.g. HEIC handled by server)
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        resolve(result.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''));
      };
      reader.onerror = () => reject(new Error('Could not read screenshot file.'));
      reader.readAsDataURL(file);
    });
    return { base64, mimeType: file.type || 'image/jpeg', previewUrl };
  }
}

export const ScreenshotHrImporter: React.FC<ScreenshotHrImporterProps> = ({
  onApplyExtraction,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ScreenshotExtraction | null>(null);
  const [appliedText, setAppliedText] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const processFile = async (file: File) => {
    setError(null);
    setExtracted(null);
    setAppliedText(null);
    setLoading(true);

    try {
      const { base64, mimeType, previewUrl: nextPreview } = await prepareImagePayload(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(nextPreview);

      const response = await fetch('/api/extract-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Extraction failed (${response.status}).`);
      }

      const result = body as ScreenshotExtraction;
      setExtracted(result);

      if (result.avgHr === null && result.maxHr === null && result.distanceKm === null) {
        setError('No heart rate or workout stats were clearly visible in this screenshot.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not analyze screenshot.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    e.target.value = '';
  };

  const hasHr = extracted && (extracted.avgHr !== null || extracted.maxHr !== null);
  const hasOtherStats =
    extracted &&
    (extracted.distanceKm !== null ||
      extracted.durationSec !== null ||
      extracted.date !== null ||
      extracted.activityType !== null);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Import from Workout Screenshot
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Supports Garmin Connect, Strava, and Google Health screenshots.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {loading ? 'Reading...' : previewUrl ? 'Change Image' : 'Upload Screenshot'}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload workout screenshot"
        />
      </div>

      {!previewUrl && !loading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-[76px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-400 bg-white/60 dark:bg-[#111827]/60 flex flex-col items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 transition-colors"
        >
          <ImageIcon className="w-5 h-5 text-slate-400" />
          <span>Tap to choose a Garmin, Strava, or Google Health screenshot</span>
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-3 px-3.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-orange-600 dark:text-orange-400 shrink-0" />
          <span>Reading heart rate, distance, and duration from screenshot...</span>
        </div>
      )}

      {extracted && !loading && (
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Uploaded workout screenshot preview"
                className="w-16 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {extracted.sourceApp}
                </span>
                {extracted.activityType && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{extracted.activityType}</span>
                  </>
                )}
                {extracted.date && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{extracted.date}</span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                    Avg HR
                  </span>
                  <strong className="text-sm text-rose-600 dark:text-rose-400">
                    {extracted.avgHr !== null ? `${extracted.avgHr} bpm` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                    Max HR
                  </span>
                  <strong className="text-sm text-slate-900 dark:text-slate-100">
                    {extracted.maxHr !== null ? `${extracted.maxHr} bpm` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                    Distance
                  </span>
                  <strong className="text-sm text-slate-900 dark:text-slate-100">
                    {extracted.distanceKm !== null ? `${extracted.distanceKm.toFixed(2)} km` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block font-sans text-[11px]">
                    Duration
                  </span>
                  <strong className="text-sm text-slate-900 dark:text-slate-100">
                    {extracted.durationSec !== null ? formatDurationMMSS(extracted.durationSec) : '—'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {hasHr && (
              <button
                type="button"
                onClick={() => {
                  onApplyExtraction(extracted, false);
                  setAppliedText(`Applied HR from ${extracted.sourceApp}`);
                }}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 text-xs font-semibold whitespace-nowrap"
              >
                Apply HR Only
              </button>
            )}

            {(hasHr || hasOtherStats) && (
              <button
                type="button"
                onClick={() => {
                  onApplyExtraction(extracted, true);
                  setAppliedText(`Applied all metrics from ${extracted.sourceApp}`);
                }}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                Apply All Extracted Metrics
              </button>
            )}
          </div>
        </div>
      )}

      {appliedText && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <Check className="w-4 h-4 shrink-0" />
          {appliedText}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
