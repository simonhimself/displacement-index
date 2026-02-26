export interface Env {
  DI_KV: KVNamespace;
  ASSETS: Fetcher;
  FRED_API_KEY: string;
  DATA_VERSION: string;
  REFRESH_TOKEN?: string;
}

type Obs = { date: string; value: number };

type FredSeriesMeta = {
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  unit: string;
  note?: string;
};

type FredSeries = FredSeriesMeta & {
  series_id: string;
  observations: Obs[];
  latest: Obs | null;
  count: number;
};

type FredRaw = {
  fetched_at: string;
  chain_links: Record<string, Record<string, FredSeries>>;
};

type IndeedRaw = {
  fetched_at: string;
  source: string;
  attribution: string;
  aggregate: {
    name: string;
    frequency: string;
    unit: string;
    note?: string;
    observations: Obs[];
    latest: Obs | null;
    count: number;
  };
  sectors: Record<
    string,
    {
      name: string;
      frequency: string;
      unit: string;
      observations: Obs[];
      latest: Obs | null;
      count: number;
    }
  >;
};

type RefreshSource = 'cron' | 'manual';

type RefreshContext = {
  trigger: RefreshSource;
  runId: string;
  startedAt: string;
};

type RefreshSuccess = {
  version: string;
  indicators: any;
  fred: FredRaw;
  indeed: IndeedRaw;
  warnings: string[];
  durationMs: number;
};

type RefreshResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  trigger: RefreshSource;
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  version?: string;
  warnings?: string[];
};

type RunLogEntry = {
  ts: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  trigger: RefreshSource;
  run_id: string;
  duration_ms: number;
  version?: string;
  warnings_count?: number;
};

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const KV_KEYS = {
  latestVersion: 'latest:version',
  lastUpdated: 'meta:last_updated',
  lastAttempt: 'meta:last_attempt',
  lastSuccess: 'meta:last_success',
  lastError: 'meta:last_error',
  consecutiveFailures: 'meta:consecutive_failures',
  lastDurationMs: 'meta:last_duration_ms',
  runLog: 'meta:run_log',
  refreshLock: 'lock:refresh',
} as const;

const RUN_LOG_MAX = 50;
const REFRESH_LOCK_TTL_SEC = 15 * 60;

const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const DEFAULT_FETCH_RETRIES = 3;

// ---- Series configuration (mirrors Python pipeline) ----

const FRED_SERIES: Record<string, Record<string, FredSeriesMeta>> = {
  displacement: {
    LNU04032239: {
      name: 'Unemployment Rate: Professional & Business Services',
      frequency: 'monthly',
      unit: 'percent',
    },
    LNU04032237: {
      name: 'Unemployment Rate: Information Industry',
      frequency: 'monthly',
      unit: 'percent',
    },
    CES6054000001: {
      name: 'Employees: Professional, Scientific & Technical Services',
      frequency: 'monthly',
      unit: 'thousands',
    },
    UNRATE: {
      name: 'Overall Unemployment Rate',
      frequency: 'monthly',
      unit: 'percent',
      note: 'Baseline comparator for white-collar vs overall',
    },
  },
  spending: {
    PCEC96: {
      name: 'Real Personal Consumption Expenditures',
      frequency: 'monthly',
      unit: 'billions_2017_dollars',
    },
    UMCSENT: {
      name: 'Consumer Sentiment (UMich)',
      frequency: 'monthly',
      unit: 'index_1966q1_100',
    },
    RSAFS: {
      name: 'Advance Retail Sales: Retail and Food Services',
      frequency: 'monthly',
      unit: 'millions_dollars',
    },
  },
  ghost_gdp: {
    OPHNFB: {
      name: 'Nonfarm Business Sector: Real Output Per Hour',
      frequency: 'quarterly',
      unit: 'index_2017_100',
    },
    LES1252881600Q: {
      name: 'Median Usual Weekly Real Earnings',
      frequency: 'quarterly',
      unit: '2025_dollars',
    },
    M2V: {
      name: 'Velocity of M2 Money Stock',
      frequency: 'quarterly',
      unit: 'ratio',
    },
  },
  credit_stress: {
    BAMLH0A0HYM2: {
      name: 'ICE BofA US High Yield Index OAS',
      frequency: 'daily',
      unit: 'percent',
    },
    BAMLH0A3HYC: {
      name: 'ICE BofA CCC & Lower US High Yield Index OAS',
      frequency: 'daily',
      unit: 'percent',
    },
    DRCLACBS: {
      name: 'Delinquency Rate on Consumer Loans',
      frequency: 'quarterly',
      unit: 'percent',
    },
  },
  mortgage_stress: {
    DRSFRMACBS: {
      name: 'Delinquency Rate: Single-Family Residential Mortgages',
      frequency: 'quarterly',
      unit: 'percent',
    },
  },
  context: {
    BABATOTALSAUS: {
      name: 'New Business Applications (Total)',
      frequency: 'monthly',
      unit: 'applications',
      note: 'Rising = entrepreneurial dynamism. Falling = creative destruction failing.',
    },
    USCONS: {
      name: 'Construction Employment',
      frequency: 'monthly',
      unit: 'thousands',
      note: 'AI capex is driving data center construction hiring. Tracks whether AI creates offsetting jobs.',
    },
    JTSJOL: {
      name: 'Job Openings (JOLTS)',
      frequency: 'monthly',
      unit: 'thousands',
      note: 'Total labor demand. Falling openings = weakening demand for workers.',
    },
  },
};

// Indeed Hiring Lab sources
const INDEED_AGG_URL =
  'https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/US/aggregate_job_postings_US.csv';
const INDEED_SECTOR_URL =
  'https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/US/job_postings_by_sector_US.csv';

const INDEED_TARGET_SECTORS = new Set([
  'Software Development',
  'Marketing',
  'Media & Communications',
  'Banking & Finance',
  'Accounting',
]);

// ---- Utils ----

function isoNow(): string {
  return new Date().toISOString();
}

function snapshotKey(version: string, suffix: 'indicators' | 'fred_raw' | 'indeed_raw'): string {
  return `snap:${version}:${suffix}`;
}

function jsonResponse(obj: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(obj), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      ...(init?.headers || {}),
    },
  });
}

function assertEnv(env: Env) {
  if (!env.FRED_API_KEY) throw new Error('Missing FRED_API_KEY secret');
  if (!env.DI_KV) throw new Error('Missing DI_KV binding');
}

function pctChange(series: Obs[], periods: number): number | null {
  if (series.length < periods + 1) return null;
  const current = series[series.length - 1].value;
  const prev = series[series.length - (periods + 1)].value;
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function yoyChange(series: Obs[], frequency: string): number | null {
  const periods: Record<string, number> = {
    monthly: 12,
    quarterly: 4,
    weekly: 52,
    daily: 252,
  };
  return pctChange(series, periods[frequency] ?? 12);
}

function zScoreVsHistory(series: Obs[], lookback = 60): number | null {
  const n = Math.min(series.length, lookback);
  if (n < 5) return null;
  const slice = series.slice(series.length - n);
  const values = slice.map((o) => o.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const current = values[values.length - 1];
  return (current - mean) / std;
}

function classifyStatus(z: number | null, inverted = false):
  | 'normal'
  | 'elevated'
  | 'warning'
  | 'critical'
  | 'unknown' {
  if (z === null || Number.isNaN(z)) return 'unknown';
  const score = inverted ? -z : z;
  if (score >= 2.0) return 'critical';
  if (score >= 1.0) return 'warning';
  if (score >= 0.5) return 'elevated';
  return 'normal';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumberOr(value: string | null, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

type FetchRetryOptions = {
  label: string;
  timeoutMs?: number;
  retries?: number;
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  const base = 300;
  const exp = base * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(2500, exp + jitter);
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  opts: FetchRetryOptions,
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_FETCH_RETRIES;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) return resp;

      if (!isRetryableStatus(resp.status) || attempt === retries) {
        throw new Error(`${opts.label} failed: HTTP ${resp.status}`);
      }

      await sleep(backoffMs(attempt));
      continue;
    } catch (e) {
      clearTimeout(timeout);
      const err = e as Error;
      lastError = err;

      if (attempt === retries) break;
      await sleep(backoffMs(attempt));
    }
  }

  throw lastError ?? new Error(`${opts.label} failed after retries`);
}

async function getLatestVersion(env: Env): Promise<string | null> {
  return env.DI_KV.get(KV_KEYS.latestVersion);
}

async function getLatestSnapshot<T>(
  env: Env,
  suffix: 'indicators' | 'fred_raw' | 'indeed_raw',
): Promise<T | null> {
  const version = await getLatestVersion(env);
  if (version) {
    const snap = (await env.DI_KV.get(snapshotKey(version, suffix), 'json')) as T | null;
    if (snap) return snap;
  }

  // Backward-compatible fallback for pre-versioned snapshots.
  return (await env.DI_KV.get(`latest:${suffix}`, 'json')) as T | null;
}

async function appendRunLog(env: Env, entry: RunLogEntry): Promise<void> {
  const existing = ((await env.DI_KV.get(KV_KEYS.runLog, 'json')) as RunLogEntry[] | null) || [];
  const next = [entry, ...existing].slice(0, RUN_LOG_MAX);
  await env.DI_KV.put(KV_KEYS.runLog, JSON.stringify(next));
}

type RefreshLock = {
  owner: string;
  acquired_at: string;
  expires_at_ms: number;
};

async function acquireRefreshLock(env: Env, owner: string): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  const current = (await env.DI_KV.get(KV_KEYS.refreshLock, 'json')) as RefreshLock | null;

  if (current && current.expires_at_ms > now) {
    return { ok: false, reason: `refresh locked by ${current.owner}` };
  }

  const lock: RefreshLock = {
    owner,
    acquired_at: isoNow(),
    expires_at_ms: now + REFRESH_LOCK_TTL_SEC * 1000,
  };

  await env.DI_KV.put(KV_KEYS.refreshLock, JSON.stringify(lock), {
    expirationTtl: REFRESH_LOCK_TTL_SEC,
  });

  // Best-effort verification (KV is eventually consistent).
  const verify = (await env.DI_KV.get(KV_KEYS.refreshLock, 'json')) as RefreshLock | null;
  if (!verify || verify.owner !== owner) {
    return { ok: false, reason: 'refresh lock verification failed' };
  }

  return { ok: true };
}

async function releaseRefreshLock(env: Env, owner: string): Promise<void> {
  const current = (await env.DI_KV.get(KV_KEYS.refreshLock, 'json')) as RefreshLock | null;
  if (!current || current.owner !== owner) return;
  await env.DI_KV.delete(KV_KEYS.refreshLock);
}

// ---- Fetchers ----

async function fetchFredSeries(env: Env, seriesId: string, observationStart: string): Promise<Obs[]> {
  const url = new URL(FRED_BASE);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', env.FRED_API_KEY);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('observation_start', observationStart);

  const resp = await fetchWithRetry(
    url.toString(),
    {
      headers: { 'user-agent': 'DisplacementIndex/1.0' },
    },
    {
      label: `FRED ${seriesId}`,
      timeoutMs: 12000,
      retries: 3,
    },
  );

  const data: any = await resp.json();
  const obs = (data.observations || []) as { date: string; value: string }[];

  const cleaned: Obs[] = [];
  for (const o of obs) {
    if (!o.value || o.value === '.') continue;
    const v = Number(o.value);
    if (Number.isFinite(v)) cleaned.push({ date: o.date, value: v });
  }

  if (!cleaned.length) {
    throw new Error(`FRED ${seriesId} returned no usable observations`);
  }

  return cleaned;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const header = lines[0].split(',');
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Minimal parser: current datasets do not contain quoted commas.
    const cols = line.split(',');
    if (cols.length !== header.length) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cols[j];
    rows.push(row);
  }

  return rows;
}

async function fetchIndeed(): Promise<IndeedRaw> {
  const [aggResp, secResp] = await Promise.all([
    fetchWithRetry(INDEED_AGG_URL, {}, { label: 'Indeed aggregate', timeoutMs: 12000, retries: 3 }),
    fetchWithRetry(INDEED_SECTOR_URL, {}, { label: 'Indeed sectors', timeoutMs: 12000, retries: 3 }),
  ]);

  const aggText = await aggResp.text();
  const secText = await secResp.text();

  const aggRows = parseCsv(aggText);
  const secRows = parseCsv(secText);

  const aggObs: Obs[] = [];
  for (const r of aggRows) {
    const date = r.date;
    const val = r.indeed_job_postings_index_SA || r.indeed_job_postings_index;
    if (!date || !val) continue;
    const v = Number(val);
    if (Number.isFinite(v)) aggObs.push({ date, value: v });
  }
  const aggTrim = aggObs.length > 730 ? aggObs.slice(-730) : aggObs;

  const sectors: IndeedRaw['sectors'] = {};
  const tmp: Record<string, Obs[]> = {};

  for (const r of secRows) {
    const name = r.display_name;
    if (!INDEED_TARGET_SECTORS.has(name)) continue;
    if (r.variable !== 'total postings') continue;

    const date = r.date;
    const val = r.indeed_job_postings_index;
    if (!date || !val) continue;

    const v = Number(val);
    if (!Number.isFinite(v)) continue;

    (tmp[name] ||= []).push({ date, value: v });
  }

  for (const [name, obs] of Object.entries(tmp)) {
    const trimmed = obs.length > 730 ? obs.slice(-730) : obs;
    sectors[name] = {
      name: `Indeed Postings: ${name}`,
      frequency: 'daily',
      unit: 'index_feb2020_100',
      observations: trimmed,
      latest: trimmed.length ? trimmed[trimmed.length - 1] : null,
      count: trimmed.length,
    };
  }

  if (!aggTrim.length) {
    throw new Error('Indeed aggregate dataset produced no usable rows');
  }

  if (!Object.keys(sectors).length) {
    throw new Error('Indeed sector dataset produced no target-sector rows');
  }

  return {
    fetched_at: isoNow(),
    source: 'Indeed Hiring Lab (CC-BY-4.0)',
    attribution: 'Indeed Hiring Lab, https://github.com/hiring-lab/job_postings_tracker',
    aggregate: {
      name: 'Indeed Job Postings Index (SA)',
      frequency: 'daily',
      unit: 'index_feb2020_100',
      note: 'Seasonally adjusted. 100 = Feb 1, 2020 baseline.',
      observations: aggTrim,
      latest: aggTrim.length ? aggTrim[aggTrim.length - 1] : null,
      count: aggTrim.length,
    },
    sectors,
  };
}

// ---- Computation ----

function getSeries(fred: FredRaw, seriesId: string): Obs[] {
  for (const link of Object.values(fred.chain_links)) {
    if (link[seriesId]) return link[seriesId].observations || [];
  }
  return [];
}

function computeGhostGDP(fred: FredRaw) {
  const prod = getSeries(fred, 'OPHNFB');
  const wage = getSeries(fred, 'LES1252881600Q');
  const prodYoy = yoyChange(prod, 'quarterly');
  const wageYoy = yoyChange(wage, 'quarterly');
  const score = prodYoy !== null && wageYoy !== null ? prodYoy - wageYoy : null;

  // Rough scaling for status: 2pp gap ~ 1σ
  const status = classifyStatus(score !== null ? score / 2 : null);

  return {
    name: 'Ghost GDP Score',
    description:
      'Productivity growth minus real wage growth. Positive = output not reaching workers.',
    value: score !== null ? Number(score.toFixed(2)) : null,
    components: {
      productivity_yoy_pct: prodYoy !== null ? Number(prodYoy.toFixed(2)) : null,
      real_wage_yoy_pct: wageYoy !== null ? Number(wageYoy.toFixed(2)) : null,
    },
    status,
  };
}

function computeDisplacementVelocity(fred: FredRaw) {
  const prof = getSeries(fred, 'LNU04032239');
  const info = getSeries(fred, 'LNU04032237');
  const overall = getSeries(fred, 'UNRATE');

  const profCh = pctChange(prof, 3);
  const infoCh = pctChange(info, 3);
  const overallCh = pctChange(overall, 3);

  const wc = [profCh, infoCh].filter((x) => x !== null) as number[];
  const avgWc = wc.length ? wc.reduce((a, b) => a + b, 0) / wc.length : null;

  const velocity =
    avgWc !== null && overallCh !== null && overallCh !== 0
      ? avgWc / Math.abs(overallCh)
      : null;

  const status = classifyStatus(velocity !== null ? velocity - 1.0 : null);

  return {
    name: 'Displacement Velocity',
    description:
      'White-collar unemployment change relative to overall. >1 = white-collar deteriorating faster.',
    value: velocity !== null ? Number(velocity.toFixed(2)) : null,
    components: {
      prof_biz_3mo_change_pct: profCh !== null ? Number(profCh.toFixed(2)) : null,
      info_3mo_change_pct: infoCh !== null ? Number(infoCh.toFixed(2)) : null,
      overall_3mo_change_pct: overallCh !== null ? Number(overallCh.toFixed(2)) : null,
    },
    status,
  };
}

function computeChainLinks(fred: FredRaw) {
  // Link 1: displacement
  const profZ = zScoreVsHistory(getSeries(fred, 'LNU04032239'));
  const infoZ = zScoreVsHistory(getSeries(fred, 'LNU04032237'));
  const empZ = zScoreVsHistory(getSeries(fred, 'CES6054000001'));

  const z1: number[] = [];
  if (profZ !== null) z1.push(profZ);
  if (infoZ !== null) z1.push(infoZ);
  if (empZ !== null) z1.push(-empZ); // inverted
  const avg1 = z1.length ? z1.reduce((a, b) => a + b, 0) / z1.length : null;

  const displacement = {
    name: 'White-Collar Displacement',
    status: classifyStatus(avg1),
    z_score: avg1 !== null ? Number(avg1.toFixed(2)) : null,
    indicators: {
      LNU04032239: { z: profZ !== null ? Number(profZ.toFixed(2)) : null, status: classifyStatus(profZ) },
      LNU04032237: { z: infoZ !== null ? Number(infoZ.toFixed(2)) : null, status: classifyStatus(infoZ) },
      CES6054000001: {
        z: empZ !== null ? Number(empZ.toFixed(2)) : null,
        status: classifyStatus(empZ, true),
      },
    },
  };

  // Link 2: spending (inverted)
  const pceZ = zScoreVsHistory(getSeries(fred, 'PCEC96'));
  const sentZ = zScoreVsHistory(getSeries(fred, 'UMCSENT'));
  const retailZ = zScoreVsHistory(getSeries(fred, 'RSAFS'));
  const z2raw = [pceZ, sentZ, retailZ].filter((x) => x !== null) as number[];
  const avg2 = z2raw.length ? -(z2raw.reduce((a, b) => a + b, 0) / z2raw.length) : null;

  const spending = {
    name: 'Consumer Spending',
    status: classifyStatus(avg2),
    z_score: avg2 !== null ? Number(avg2.toFixed(2)) : null,
    indicators: {
      PCEC96: { z: pceZ !== null ? Number(pceZ.toFixed(2)) : null, status: classifyStatus(pceZ, true) },
      UMCSENT: {
        z: sentZ !== null ? Number(sentZ.toFixed(2)) : null,
        status: classifyStatus(sentZ, true),
      },
      RSAFS: {
        z: retailZ !== null ? Number(retailZ.toFixed(2)) : null,
        status: classifyStatus(retailZ, true),
      },
    },
  };

  // Link 3: Ghost GDP uses M2V inverted
  const m2vZ = zScoreVsHistory(getSeries(fred, 'M2V'));
  const ghost_gdp = {
    name: 'Ghost GDP',
    status: classifyStatus(m2vZ !== null ? -m2vZ : null),
    z_score: m2vZ !== null ? Number((-m2vZ).toFixed(2)) : null,
    indicators: {
      M2V: { z: m2vZ !== null ? Number(m2vZ.toFixed(2)) : null, status: classifyStatus(m2vZ, true) },
    },
  };

  // Link 4: credit stress
  const hyZ = zScoreVsHistory(getSeries(fred, 'BAMLH0A0HYM2'));
  const cccZ = zScoreVsHistory(getSeries(fred, 'BAMLH0A3HYC'));
  const delZ = zScoreVsHistory(getSeries(fred, 'DRCLACBS'));
  const z4 = [hyZ, cccZ, delZ].filter((x) => x !== null) as number[];
  const avg4 = z4.length ? z4.reduce((a, b) => a + b, 0) / z4.length : null;

  const credit_stress = {
    name: 'Credit Stress',
    status: classifyStatus(avg4),
    z_score: avg4 !== null ? Number(avg4.toFixed(2)) : null,
    indicators: {
      BAMLH0A0HYM2: { z: hyZ !== null ? Number(hyZ.toFixed(2)) : null, status: classifyStatus(hyZ) },
      BAMLH0A3HYC: { z: cccZ !== null ? Number(cccZ.toFixed(2)) : null, status: classifyStatus(cccZ) },
      DRCLACBS: { z: delZ !== null ? Number(delZ.toFixed(2)) : null, status: classifyStatus(delZ) },
    },
  };

  // Link 5: mortgage
  const mortZ = zScoreVsHistory(getSeries(fred, 'DRSFRMACBS'));
  const mortgage_stress = {
    name: 'Mortgage & Housing Stress',
    status: classifyStatus(mortZ),
    z_score: mortZ !== null ? Number(mortZ.toFixed(2)) : null,
    indicators: {
      DRSFRMACBS: { z: mortZ !== null ? Number(mortZ.toFixed(2)) : null, status: classifyStatus(mortZ) },
    },
  };

  return { displacement, spending, ghost_gdp, credit_stress, mortgage_stress };
}

function computeComposite(chainLinks: Record<string, any>) {
  const scores: Record<string, number> = {
    normal: 0,
    elevated: 25,
    warning: 50,
    critical: 100,
    unknown: 0,
  };
  const linkScores = Object.values(chainLinks).map((l: any) => scores[l.status] ?? 0);
  const composite = linkScores.length
    ? linkScores.reduce((a, b) => a + b, 0) / linkScores.length
    : 0;

  const counts: Record<string, number> = {};
  for (const l of Object.values(chainLinks) as any[]) {
    counts[l.status] = (counts[l.status] || 0) + 1;
  }

  const interpretation =
    composite >= 75
      ? 'Critical: Multiple chain links showing severe stress'
      : composite >= 50
        ? 'Warning: Significant stress in the displacement chain'
        : composite >= 25
          ? 'Elevated: Early signals present in some chain links'
          : 'Normal: No significant displacement signals detected';

  return {
    value: Number(composite.toFixed(1)),
    scale: '0-100 (0=all normal, 100=all critical)',
    chain_link_statuses: counts,
    interpretation,
  };
}

async function refreshAll(env: Env, ctx: RefreshContext): Promise<RefreshSuccess> {
  assertEnv(env);
  const started = Date.now();
  const warnings: string[] = [];

  // 5 years of history
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 365 * 5);
  const observationStart = start.toISOString().slice(0, 10);

  const previousFred = await getLatestSnapshot<FredRaw>(env, 'fred_raw');
  const previousIndeed = await getLatestSnapshot<IndeedRaw>(env, 'indeed_raw');

  const fred: FredRaw = {
    fetched_at: isoNow(),
    chain_links: {},
  };

  const seriesTasks: Array<Promise<{ linkId: string; seriesId: string; meta: FredSeriesMeta; observations: Obs[] }>> = [];

  for (const [linkId, seriesMap] of Object.entries(FRED_SERIES)) {
    fred.chain_links[linkId] = {};
    for (const [seriesId, meta] of Object.entries(seriesMap)) {
      seriesTasks.push(
        (async () => {
          const observations = await fetchFredSeries(env, seriesId, observationStart);
          return { linkId, seriesId, meta, observations };
        })(),
      );
    }
  }

  const fredResults = await Promise.allSettled(seriesTasks);
  const missingSeries: string[] = [];
  let fredFallbackCount = 0;

  for (const r of fredResults) {
    if (r.status === 'fulfilled') {
      const { linkId, seriesId, meta, observations } = r.value;
      fred.chain_links[linkId][seriesId] = {
        ...meta,
        series_id: seriesId,
        observations,
        latest: observations.length ? observations[observations.length - 1] : null,
        count: observations.length,
      };
      continue;
    }

    const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
    const match = /FRED\s+([A-Z0-9]+)/.exec(message);
    const seriesId = match?.[1] || 'UNKNOWN_SERIES';

    // Try to fallback to previous snapshot for this series.
    let filled = false;
    if (previousFred) {
      for (const [prevLinkId, prevSeriesMap] of Object.entries(previousFred.chain_links || {})) {
        const prevSeries = (prevSeriesMap as Record<string, FredSeries>)[seriesId];
        if (prevSeries) {
          fred.chain_links[prevLinkId] ||= {};
          fred.chain_links[prevLinkId][seriesId] = prevSeries;
          filled = true;
          fredFallbackCount += 1;
          warnings.push(`FRED ${seriesId} fallback to previous snapshot`);
          break;
        }
      }
    }

    if (!filled) {
      missingSeries.push(`${seriesId}: ${message}`);
    }
  }

  if (missingSeries.length) {
    throw new Error(`Critical FRED fetch failures (no fallback): ${missingSeries.join(' | ')}`);
  }

  let indeed: IndeedRaw;
  let indeedStatus: 'fresh' | 'stale' = 'fresh';

  try {
    indeed = await fetchIndeed();
  } catch (e) {
    if (!previousIndeed) throw e;
    indeed = previousIndeed;
    indeedStatus = 'stale';
    warnings.push(`Indeed fallback to previous snapshot: ${(e as Error).message}`);
  }

  const derived = {
    ghost_gdp: computeGhostGDP(fred),
    displacement_velocity: computeDisplacementVelocity(fred),
  };

  const chainLinks = computeChainLinks(fred);
  const composite = computeComposite(chainLinks);

  const version = `${Date.now()}-${ctx.runId.slice(0, 8)}`;

  const indicators = {
    generated_at: isoNow(),
    fred_fetched_at: fred.fetched_at,
    composite_index: composite,
    derived_indicators: derived,
    chain_links: chainLinks,
    indeed_fetched_at: indeed.fetched_at,
    pipeline: {
      version,
      trigger: ctx.trigger,
      run_id: ctx.runId,
      source_status: {
        fred: fredFallbackCount > 0 ? 'stale' : 'fresh',
        indeed: indeedStatus,
      },
      fallback_counts: {
        fred_series: fredFallbackCount,
        indeed: indeedStatus === 'stale' ? 1 : 0,
      },
      warnings,
    },
  };

  // Versioned snapshots first, pointer flip last (atomic publish model).
  await Promise.all([
    env.DI_KV.put(snapshotKey(version, 'indicators'), JSON.stringify(indicators)),
    env.DI_KV.put(snapshotKey(version, 'fred_raw'), JSON.stringify(fred)),
    env.DI_KV.put(snapshotKey(version, 'indeed_raw'), JSON.stringify(indeed)),
  ]);

  await env.DI_KV.put(KV_KEYS.latestVersion, version);

  // Keep legacy keys updated for backwards compatibility.
  await Promise.all([
    env.DI_KV.put('latest:indicators', JSON.stringify(indicators)),
    env.DI_KV.put('latest:fred_raw', JSON.stringify(fred)),
    env.DI_KV.put('latest:indeed_raw', JSON.stringify(indeed)),
  ]);

  return {
    version,
    indicators,
    fred,
    indeed,
    warnings,
    durationMs: Date.now() - started,
  };
}

async function runRefresh(env: Env, trigger: RefreshSource): Promise<RefreshResult> {
  const runId = crypto.randomUUID();
  const startedAt = isoNow();
  const startedMs = Date.now();

  await env.DI_KV.put(KV_KEYS.lastAttempt, startedAt);

  const lockOwner = `${trigger}:${runId}`;
  const lock = await acquireRefreshLock(env, lockOwner);

  if (!lock.ok) {
    const result: RefreshResult = {
      ok: false,
      skipped: true,
      reason: lock.reason || 'refresh lock active',
      trigger,
      runId,
      startedAt,
      finishedAt: isoNow(),
      durationMs: Date.now() - startedMs,
    };

    await appendRunLog(env, {
      ts: result.finishedAt,
      ok: false,
      skipped: true,
      reason: result.reason,
      trigger,
      run_id: runId,
      duration_ms: result.durationMs,
    });

    return result;
  }

  try {
    const out = await refreshAll(env, { trigger, runId, startedAt });
    const finishedAt = isoNow();

    await Promise.all([
      env.DI_KV.put(KV_KEYS.lastUpdated, out.indicators.generated_at),
      env.DI_KV.put(KV_KEYS.lastSuccess, out.indicators.generated_at),
      env.DI_KV.put(KV_KEYS.lastError, ''),
      env.DI_KV.put(KV_KEYS.consecutiveFailures, '0'),
      env.DI_KV.put(KV_KEYS.lastDurationMs, String(out.durationMs)),
    ]);

    await appendRunLog(env, {
      ts: finishedAt,
      ok: true,
      trigger,
      run_id: runId,
      duration_ms: out.durationMs,
      version: out.version,
      warnings_count: out.warnings.length,
    });

    return {
      ok: true,
      trigger,
      runId,
      startedAt,
      finishedAt,
      durationMs: out.durationMs,
      version: out.version,
      warnings: out.warnings,
    };
  } catch (e) {
    const error = e as Error;
    const finishedAt = isoNow();
    const durationMs = Date.now() - startedMs;

    const currentFailures = asNumberOr(await env.DI_KV.get(KV_KEYS.consecutiveFailures), 0);
    const nextFailures = currentFailures + 1;

    await Promise.all([
      env.DI_KV.put(KV_KEYS.lastError, error.message),
      env.DI_KV.put(KV_KEYS.consecutiveFailures, String(nextFailures)),
      env.DI_KV.put(KV_KEYS.lastDurationMs, String(durationMs)),
    ]);

    await appendRunLog(env, {
      ts: finishedAt,
      ok: false,
      error: error.message,
      trigger,
      run_id: runId,
      duration_ms: durationMs,
    });

    return {
      ok: false,
      error: error.message,
      trigger,
      runId,
      startedAt,
      finishedAt,
      durationMs,
    };
  } finally {
    await releaseRefreshLock(env, lockOwner);
  }
}

// ---- Request routing ----

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    const [
      lastUpdated,
      lastAttempt,
      lastSuccess,
      lastError,
      failuresRaw,
      latestVersion,
      lastDurationMs,
    ] = await Promise.all([
      env.DI_KV.get(KV_KEYS.lastUpdated),
      env.DI_KV.get(KV_KEYS.lastAttempt),
      env.DI_KV.get(KV_KEYS.lastSuccess),
      env.DI_KV.get(KV_KEYS.lastError),
      env.DI_KV.get(KV_KEYS.consecutiveFailures),
      env.DI_KV.get(KV_KEYS.latestVersion),
      env.DI_KV.get(KV_KEYS.lastDurationMs),
    ]);

    const failures = asNumberOr(failuresRaw, 0);
    const durationMs = asNumberOr(lastDurationMs, 0);

    let ageMinutes: number | null = null;
    if (lastSuccess) {
      const ageMs = Date.now() - new Date(lastSuccess).getTime();
      if (Number.isFinite(ageMs) && ageMs >= 0) {
        ageMinutes = Number((ageMs / 60000).toFixed(1));
      }
    }

    const healthy = !!lastSuccess && (ageMinutes === null ? true : ageMinutes < 12 * 60) && failures < 3;

    return jsonResponse({
      ok: true,
      healthy,
      last_updated: lastUpdated,
      last_attempt: lastAttempt,
      last_success: lastSuccess,
      last_error: lastError || null,
      consecutive_failures: failures,
      latest_version: latestVersion,
      last_duration_ms: durationMs,
      age_minutes: ageMinutes,
    });
  }

  if (url.pathname === '/api/indicators') {
    const data = await getLatestSnapshot<any>(env, 'indicators');
    if (!data) return jsonResponse({ error: 'No data yet. Cron has not run.' }, { status: 503 });
    return jsonResponse(data);
  }

  if (url.pathname === '/api/fred_raw') {
    const data = await getLatestSnapshot<any>(env, 'fred_raw');
    if (!data) return jsonResponse({ error: 'No data yet.' }, { status: 503 });
    return jsonResponse(data);
  }

  if (url.pathname === '/api/indeed_raw') {
    const data = await getLatestSnapshot<any>(env, 'indeed_raw');
    if (!data) return jsonResponse({ error: 'No data yet.' }, { status: 503 });
    return jsonResponse(data);
  }

  if (url.pathname === '/api/refresh' && request.method === 'POST') {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!env.REFRESH_TOKEN || token !== env.REFRESH_TOKEN) {
      return jsonResponse({ error: 'unauthorized' }, { status: 401 });
    }

    const result = await runRefresh(env, 'manual');

    if (result.skipped) {
      return jsonResponse(
        {
          ok: false,
          error: 'refresh_locked',
          reason: result.reason,
          run_id: result.runId,
        },
        { status: 409 },
      );
    }

    if (!result.ok) {
      return jsonResponse(
        {
          ok: false,
          error: result.error || 'refresh_failed',
          run_id: result.runId,
        },
        { status: 500 },
      );
    }

    return jsonResponse({
      ok: true,
      generated_at: result.finishedAt,
      version: result.version,
      warnings: result.warnings || [],
      run_id: result.runId,
    });
  }

  if (url.pathname === '/api/runs') {
    const runs = ((await env.DI_KV.get(KV_KEYS.runLog, 'json')) as RunLogEntry[] | null) || [];
    return jsonResponse({ ok: true, runs });
  }

  return jsonResponse({ error: 'not_found' }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    // Static assets
    const res = await env.ASSETS.fetch(request);

    // Add light caching for assets
    const headers = new Headers(res.headers);
    if (url.pathname.endsWith('.json')) {
      headers.set('cache-control', 'public, max-age=60');
    } else if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|woff2)$/)) {
      headers.set('cache-control', 'public, max-age=3600');
    }

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const result = await runRefresh(env, 'cron');
        if (!result.ok && !result.skipped) {
          // eslint-disable-next-line no-console
          console.log('Refresh failed:', result.error || 'unknown error');
          throw new Error(result.error || 'scheduled refresh failed');
        }

        if (result.skipped) {
          // eslint-disable-next-line no-console
          console.log('Refresh skipped:', result.reason || 'lock active');
        }
      })(),
    );
  },
};
