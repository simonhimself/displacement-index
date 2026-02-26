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

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

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

// ---- Fetchers ----

async function fetchFredSeries(env: Env, seriesId: string, observationStart: string): Promise<Obs[]> {
  const url = new URL(FRED_BASE);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', env.FRED_API_KEY);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('observation_start', observationStart);

  const resp = await fetch(url.toString(), {
    headers: { 'user-agent': 'DisplacementIndex/1.0' },
  });
  if (!resp.ok) {
    throw new Error(`FRED fetch failed for ${seriesId}: ${resp.status}`);
  }
  const data: any = await resp.json();
  const obs = (data.observations || []) as { date: string; value: string }[];

  const cleaned: Obs[] = [];
  for (const o of obs) {
    if (!o.value || o.value === '.') continue;
    const v = Number(o.value);
    if (Number.isFinite(v)) cleaned.push({ date: o.date, value: v });
  }
  return cleaned;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Minimal CSV parse: this dataset has no quoted commas
    const cols = line.split(',');
    if (cols.length !== header.length) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cols[j];
    rows.push(row);
  }
  return rows;
}

async function fetchIndeed(): Promise<IndeedRaw> {
  const [aggResp, secResp] = await Promise.all([fetch(INDEED_AGG_URL), fetch(INDEED_SECTOR_URL)]);
  if (!aggResp.ok) throw new Error(`Indeed agg fetch failed: ${aggResp.status}`);
  if (!secResp.ok) throw new Error(`Indeed sector fetch failed: ${secResp.status}`);

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

async function refreshAll(env: Env) {
  assertEnv(env);

  // 5 years of history
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 365 * 5);
  const observationStart = start.toISOString().slice(0, 10);

  const fred: FredRaw = {
    fetched_at: isoNow(),
    chain_links: {},
  };

  // Fetch all FRED series
  for (const [linkId, seriesMap] of Object.entries(FRED_SERIES)) {
    fred.chain_links[linkId] = {};
    for (const [seriesId, meta] of Object.entries(seriesMap)) {
      const observations = await fetchFredSeries(env, seriesId, observationStart);
      const series: FredSeries = {
        ...meta,
        series_id: seriesId,
        observations,
        latest: observations.length ? observations[observations.length - 1] : null,
        count: observations.length,
      };
      fred.chain_links[linkId][seriesId] = series;
    }
  }

  const indeed = await fetchIndeed();

  const derived = {
    ghost_gdp: computeGhostGDP(fred),
    displacement_velocity: computeDisplacementVelocity(fred),
  };

  const chainLinks = computeChainLinks(fred);
  const composite = computeComposite(chainLinks);

  const indicators = {
    generated_at: isoNow(),
    fred_fetched_at: fred.fetched_at,
    composite_index: composite,
    derived_indicators: derived,
    chain_links: chainLinks,
    indeed_fetched_at: indeed.fetched_at,
  };

  // Store: latest snapshot keys
  await env.DI_KV.put('latest:indicators', JSON.stringify(indicators));
  await env.DI_KV.put('latest:fred_raw', JSON.stringify(fred));
  await env.DI_KV.put('latest:indeed_raw', JSON.stringify(indeed));
  await env.DI_KV.put('meta:last_updated', indicators.generated_at);

  return { indicators, fred, indeed };
}

// ---- Request routing ----

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    const last = await env.DI_KV.get('meta:last_updated');
    return jsonResponse({ ok: true, last_updated: last });
  }

  if (url.pathname === '/api/indicators') {
    const data = await env.DI_KV.get('latest:indicators', 'json');
    if (!data) return jsonResponse({ error: 'No data yet. Cron has not run.' }, { status: 503 });
    return jsonResponse(data);
  }

  if (url.pathname === '/api/fred_raw') {
    const data = await env.DI_KV.get('latest:fred_raw', 'json');
    if (!data) return jsonResponse({ error: 'No data yet.' }, { status: 503 });
    return jsonResponse(data);
  }

  if (url.pathname === '/api/indeed_raw') {
    const data = await env.DI_KV.get('latest:indeed_raw', 'json');
    if (!data) return jsonResponse({ error: 'No data yet.' }, { status: 503 });
    return jsonResponse(data);
  }

  if (url.pathname === '/api/refresh' && request.method === 'POST') {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!env.REFRESH_TOKEN || token !== env.REFRESH_TOKEN) {
      return jsonResponse({ error: 'unauthorized' }, { status: 401 });
    }
    const out = await refreshAll(env);
    return jsonResponse({ ok: true, generated_at: out.indicators.generated_at });
  }

  return jsonResponse({ error: 'not_found' }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          await refreshAll(env);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log('Refresh failed:', (e as Error).message);
          throw e;
        }
      })(),
    );
  },
};
