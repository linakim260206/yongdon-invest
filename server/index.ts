import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { initialState } from '../shared/domain.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
const money = z.number().int().min(0).max(1000000000);
const stateSchema = z.object({
  profile: z.object({ nickname: z.string().max(20), initialBalance: z.number().int().min(-1000000000).max(1000000000), allowance: money, cycle: z.string().max(20), target: money, targetDate: z.string().max(10), essential: money, emergency: money, saving: money, notifications: z.boolean() }),
  transactions: z.array(z.object({ id: z.string().uuid(), type: z.enum(['income', 'expense']), amount: money.positive(), category: z.string().max(30), date: z.iso.date(), memo: z.string().max(100) })).max(5000),
  holdings: z.array(z.object({ productId: z.enum(['forest', 'tech', 'daily']), quantity: z.number().nonnegative().max(1000000000), cost: money })).max(3),
  completed: z.array(z.string().max(30)).max(11), plan: money, period: z.number().int().min(1).max(60), risk: z.string().max(20), day: z.number().int().min(0).max(3650), onboarded: z.boolean(), events: z.array(z.object({ name: z.string().max(60), at: z.string().max(30) })).max(200),
});
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined }) : null;
if (pool) await pool.query('CREATE TABLE IF NOT EXISTS allowance_states (session_hash TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
if (!pool && process.env.NODE_ENV === 'production' && !process.env.ALLOW_FILE_STORAGE) throw new Error('DATABASE_URL must be configured for production');
const directory = process.env.WEBSITE_INSTANCE_ID ? '/home/allowance-data' : path.resolve('.data');
await mkdir(directory, { recursive: true });
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', async (_request, response) => {
  try { if (pool) await pool.query('SELECT 1'); response.json({ status: 'ok', storage: pool ? 'postgresql' : 'local-file' }); }
  catch { response.status(503).json({ error: '저장소 연결을 확인하고 있어요. 잠시 후 다시 시도해주세요.' }); }
});
app.use('/api/state', (request, response, next) => {
  if (request.method !== 'GET' && request.get('sec-fetch-site') === 'cross-site') { response.status(403).json({ error: '이 화면에서 다시 저장해주세요.' }); return; }
  const origin = request.get('origin');
  if (origin && new URL(origin).host !== request.get('host')) { response.status(403).json({ error: '잘못된 저장 요청이에요.' }); return; }
  let token = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('allowance_session='))?.split('=')[1];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString('hex');
    response.cookie('allowance_session', token, { httpOnly: true, secure: request.secure, sameSite: 'strict', maxAge: 31536000000, path: '/' });
  }
  response.locals.session = createHash('sha256').update(token).digest('hex'); next();
});
app.get('/api/state', async (_request, response) => {
  const key = response.locals.session;
  try {
    if (pool) { const result = await pool.query('SELECT data FROM allowance_states WHERE session_hash=$1', [key]); response.json(result.rows[0]?.data || initialState()); }
    else { try { response.json(JSON.parse(await readFile(path.join(directory, `${key}.json`), 'utf8'))); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') response.json(initialState()); else throw error; } }
  } catch { response.status(503).json({ error: '기록을 불러오지 못했어요. 새로고침해서 다시 시도해주세요.' }); }
});
app.put('/api/state', async (request, response) => {
  const parsed = stateSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: '입력 내용을 확인한 뒤 다시 저장해주세요.' }); return; }
  try {
    const key = response.locals.session;
    if (pool) await pool.query('INSERT INTO allowance_states(session_hash,data) VALUES($1,$2) ON CONFLICT(session_hash) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()', [key, JSON.stringify(parsed.data)]);
    else { const destination = path.join(directory, `${key}.json`); const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`; await writeFile(temporary, JSON.stringify(parsed.data)); await rename(temporary, destination); }
    response.json({ saved: true });
  } catch { response.status(503).json({ error: '저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.' }); }
});
app.use(express.static(path.resolve('dist')));
app.get('/{*path}', (_request, response) => response.sendFile(path.resolve('dist/index.html')));
app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ error: '요청을 처리하지 못했어요. 입력을 확인해주세요.' }));
app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log(`Allowance app listening on ${process.env.PORT || 3001}`));