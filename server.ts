import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const MAX_BASE64_CHARS = 14 * 1024 * 1024; // ~10 MB decoded image cap

const VALID_ACTIVITIES = new Set([
  'Outdoor Run',
  'Treadmill',
  'Indoor Bike',
  'Strength/Prehab',
  'Padel',
]);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampNumber(val: unknown, min: number, max: number): number | null {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));

  // Health check route
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Extract heart rate and metric workout summary from Garmin / Strava / Google Health screenshots
  app.post('/api/extract-screenshot', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body ?? {};

      if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
        res.status(400).json({ error: 'Missing imageBase64 or mimeType in request body.' });
        return;
      }

      const normalizedMime = mimeType.toLowerCase().trim();
      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        res.status(400).json({
          error: 'Unsupported image format. Please upload a PNG, JPEG, WEBP, or HEIC screenshot.',
        });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
      if (!cleanBase64 || cleanBase64.length > MAX_BASE64_CHARS) {
        res.status(400).json({ error: 'Screenshot is empty or exceeds the 10 MB size limit.' });
        return;
      }

      if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
        res.status(400).json({ error: 'Invalid base64 image payload.' });
        return;
      }

      const ai = getGeminiClient();

      const prompt = [
        'Analyze this fitness app workout screenshot (such as Garmin Connect, Strava, Google Health / Health Connect, or Google Fit).',
        'Extract the workout heart rate and session metrics accurately.',
        'Rules:',
        '- All distances MUST be converted to kilometers (km). If the screenshot shows miles (mi), multiply by 1.60934 and round to 2 decimal places.',
        '- Convert duration to total integer seconds.',
        '- avgHr and maxHr must be integer beats per minute (bpm) if visible, otherwise null.',
        '- Map activityType to one of: "Outdoor Run", "Treadmill", "Indoor Bike", "Strength/Prehab", "Padel", or null if unclear.',
        '- If date is visible, format as YYYY-MM-DD, otherwise null.',
        '- Identify sourceApp as "Garmin Connect", "Strava", "Google Health", or "Other".',
        '- Never invent numbers that are not visible in the screenshot; use null for any metric not shown.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sourceApp: {
                type: Type.STRING,
                description: 'Detected app: Garmin Connect, Strava, Google Health, or Other',
              },
              activityType: {
                type: Type.STRING,
                nullable: true,
                description:
                  'One of Outdoor Run, Treadmill, Indoor Bike, Strength/Prehab, Padel, or null',
              },
              date: {
                type: Type.STRING,
                nullable: true,
                description: 'Workout date in YYYY-MM-DD format if visible, else null',
              },
              distanceKm: {
                type: Type.NUMBER,
                nullable: true,
                description: 'Distance in kilometers (converted from miles if needed), else null',
              },
              durationSec: {
                type: Type.INTEGER,
                nullable: true,
                description: 'Total elapsed or moving duration in seconds, else null',
              },
              avgHr: {
                type: Type.INTEGER,
                nullable: true,
                description: 'Average heart rate in bpm, else null',
              },
              maxHr: {
                type: Type.INTEGER,
                nullable: true,
                description: 'Maximum heart rate in bpm, else null',
              },
              notes: {
                type: Type.STRING,
                nullable: true,
                description: 'Brief 1-sentence summary of workout title or extra visible details',
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Could not extract data from this screenshot.' });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(502).json({ error: 'Received malformed extraction output from vision service.' });
        return;
      }

      const avgHr = clampNumber(parsed.avgHr, 30, 240);
      const maxHr = clampNumber(parsed.maxHr, 30, 245);
      const distanceKm = clampNumber(parsed.distanceKm, 0, 500);
      const durationSec = clampNumber(parsed.durationSec, 1, 86400);

      const rawDate = typeof parsed.date === 'string' ? parsed.date.trim() : '';
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

      const rawActivity = typeof parsed.activityType === 'string' ? parsed.activityType.trim() : '';
      const safeActivity = VALID_ACTIVITIES.has(rawActivity) ? rawActivity : null;

      const rawSource = typeof parsed.sourceApp === 'string' ? parsed.sourceApp.trim() : 'Other';
      const safeSource = ['Garmin Connect', 'Strava', 'Google Health', 'Other'].includes(rawSource)
        ? rawSource
        : 'Other';

      const safeNotes =
        typeof parsed.notes === 'string' ? parsed.notes.trim().slice(0, 240) : '';

      res.json({
        sourceApp: safeSource,
        activityType: safeActivity,
        date: safeDate,
        distanceKm: distanceKm !== null ? Math.round(distanceKm * 100) / 100 : null,
        durationSec: durationSec !== null ? Math.round(durationSec) : null,
        avgHr: avgHr !== null ? Math.round(avgHr) : null,
        maxHr: maxHr !== null ? Math.round(maxHr) : null,
        notes: safeNotes,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Screenshot extraction failed.';
      const status =
        msg.includes('GEMINI_API_KEY')
          ? 503
          : msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')
          ? 403
          : msg.includes('RESOURCE_EXHAUSTED')
          ? 429
          : 500;
      res.status(status).json({ error: msg });
    }
  });

  // Mount Vite in dev, or serve static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StrideMetric server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
