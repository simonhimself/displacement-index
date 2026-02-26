/**
 * The Displacement Index — Frontend App
 * Reads indicators.json + fred_raw.json and renders the dashboard.
 */

// Data is served by the Worker API (cron-refreshed + stored in KV)
const DATA_PATH = '/api/indicators';
const FRED_PATH = '/api/fred_raw';
const INDEED_PATH = '/api/indeed_raw';

// Chain link metadata (static)
const CHAIN_LINKS = {
  displacement: {
    num: 1,
    name: 'White-Collar Displacement',
    desc: 'Professional & technical sector unemployment',
    headline_series: 'LNU04032239',
    headline_label: 'Prof/Biz UE',
    headline_unit: '%',
  },
  spending: {
    num: 2,
    name: 'Consumer Spending',
    desc: 'Real consumption, sentiment & retail',
    headline_series: 'UMCSENT',
    headline_label: 'UMich Sent.',
    headline_unit: '',
  },
  ghost_gdp: {
    num: 3,
    name: 'Ghost GDP',
    desc: 'Productivity vs wage growth divergence',
    headline_series: null, // Uses derived indicator
    headline_label: 'Ghost Score',
    headline_unit: '',
  },
  credit_stress: {
    num: 4,
    name: 'Credit Stress',
    desc: 'High-yield spreads & delinquencies',
    headline_series: 'BAMLH0A0HYM2',
    headline_label: 'HY OAS',
    headline_unit: '%',
  },
  mortgage_stress: {
    num: 5,
    name: 'Mortgage Stress',
    desc: 'Residential mortgage delinquencies',
    headline_series: 'DRSFRMACBS',
    headline_label: 'Delinq. Rate',
    headline_unit: '%',
  },
};

// Human-readable indicator names
const INDICATOR_NAMES = {
  LNU04032239: 'Prof & Biz Services UE',
  LNU04032237: 'Information Industry UE',
  CES6054000001: 'Prof/Sci/Tech Employment',
  UNRATE: 'Overall Unemployment Rate',
  PCEC96: 'Real PCE',
  UMCSENT: 'Consumer Sentiment',
  RSAFS: 'Retail Sales',
  OPHNFB: 'Nonfarm Productivity',
  LES1252881600Q: 'Real Median Weekly Earnings',
  M2V: 'M2 Money Velocity',
  BAMLH0A0HYM2: 'HY Credit Spreads',
  BAMLH0A3HYC: 'CCC & Lower Spreads',
  DRCLACBS: 'Consumer Loan Delinq.',
  DRSFRMACBS: 'SF Mortgage Delinquency',
};

const VALUE_FORMATTERS = {
  LNU04032239: v => v.toFixed(1) + '%',
  LNU04032237: v => v.toFixed(1) + '%',
  CES6054000001: v => Math.round(v).toLocaleString() + 'K',
  UNRATE: v => v.toFixed(1) + '%',
  PCEC96: v => '$' + (v / 1000).toFixed(1) + 'T',
  UMCSENT: v => v.toFixed(1),
  RSAFS: v => '$' + Math.round(v).toLocaleString(),
  BAMLH0A0HYM2: v => v.toFixed(2) + '%',
  BAMLH0A3HYC: v => v.toFixed(2) + '%',
  DRCLACBS: v => v.toFixed(2) + '%',
  DRSFRMACBS: v => v.toFixed(2) + '%',
  M2V: v => v.toFixed(3),
  OPHNFB: v => v.toFixed(1),
  LES1252881600Q: v => '$' + v.toFixed(0),
};

// ---- HELPERS ----

function makeBadge(status, size = '') {
  const cls = `badge badge-${status} ${size}`;
  return `<span class="${cls}"><span class="badge-dot"></span> ${capitalize(status)}</span>`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatValue(seriesId, value) {
  const fmt = VALUE_FORMATTERS[seriesId];
  return fmt ? fmt(value) : value;
}

function statusColor(status) {
  const colors = {
    normal: '#22C55E',
    elevated: '#F59E0B',
    warning: '#F97316',
    critical: '#EF4444',
  };
  return colors[status] || '#A8A29E';
}

function meterColor(status) {
  return `var(--${status}-dot, var(--normal-dot))`;
}

// ---- RENDERING ----

function renderComposite(data) {
  const { composite_index } = data;
  const score = composite_index.value;
  const status = score >= 75 ? 'critical' : score >= 50 ? 'warning' : score >= 25 ? 'elevated' : 'normal';

  document.getElementById('composite-score').textContent = Math.round(score);

  const meter = document.getElementById('composite-meter');
  meter.style.background = `var(--${status}-dot)`;
  // Animate after a tick
  requestAnimationFrame(() => {
    meter.style.width = Math.max(score, 2) + '%';
  });

  // Score block top bar color
  const scoreBlock = document.querySelector('.score-block');
  scoreBlock.className = `score-block ${status}`;

  document.getElementById('composite-badge').innerHTML = makeBadge(status);

  document.getElementById('score-updated').innerHTML =
    `Sources: FRED, BLS<br>Last data: ${formatDate(data.fred_fetched_at)}`;

  document.getElementById('hero-date').textContent = formatDate(data.generated_at);
}

function renderChainOverview(data) {
  const container = document.getElementById('chain-overview');
  container.innerHTML = '';

  for (const [linkId, meta] of Object.entries(CHAIN_LINKS)) {
    const linkData = data.chain_links[linkId];
    if (!linkData) continue;

    // Get headline value
    let headlineValue = '—';
    if (linkId === 'ghost_gdp') {
      const ghost = data.derived_indicators.ghost_gdp;
      headlineValue = ghost.value !== null ? (ghost.value > 0 ? '+' : '') + ghost.value.toFixed(2) : '—';
    } else if (meta.headline_series) {
      // Find the latest value from chain_links indicators
      const indicator = linkData.indicators[meta.headline_series];
      // We need fred_raw for the actual values — for now show z-score context
      headlineValue = `z: ${linkData.z_score !== null ? (linkData.z_score > 0 ? '+' : '') + linkData.z_score.toFixed(2) : '—'}`;
    }

    const item = document.createElement('div');
    item.className = 'chain-item';
    item.innerHTML = `
      <div class="chain-num">${meta.num}</div>
      <div class="chain-label">
        <h3>${meta.name}</h3>
        <p>${meta.desc}</p>
      </div>
      <div class="chain-value">
        <span id="chain-val-${linkId}">—</span>
        <small>${meta.headline_label}</small>
      </div>
      ${makeBadge(linkData.status, 'badge-sm')}
    `;
    container.appendChild(item);
  }
}

function populateChainValues(fredData, indicatorsData) {
  // Fill in actual latest values from FRED data
  for (const [linkId, meta] of Object.entries(CHAIN_LINKS)) {
    const el = document.getElementById(`chain-val-${linkId}`);
    if (!el) continue;

    if (linkId === 'ghost_gdp') {
      const ghost = indicatorsData.derived_indicators.ghost_gdp;
      el.textContent = ghost.value !== null ? (ghost.value > 0 ? '+' : '') + ghost.value.toFixed(2) : '—';
      continue;
    }

    if (!meta.headline_series) continue;

    // Find the series in fredData
    for (const chainData of Object.values(fredData.chain_links)) {
      if (chainData[meta.headline_series]) {
        const latest = chainData[meta.headline_series].latest;
        if (latest) {
          el.textContent = formatValue(meta.headline_series, latest.value);
        }
        break;
      }
    }
  }
}

function renderGhostGDP(data) {
  const ghost = data.derived_indicators.ghost_gdp;
  if (!ghost) return;

  const prod = ghost.components.productivity_yoy_pct;
  const wage = ghost.components.real_wage_yoy_pct;
  const gap = ghost.value;

  document.getElementById('ghost-prod-value').textContent = prod !== null ? `+${prod.toFixed(2)}%` : '—';
  document.getElementById('ghost-wage-value').textContent = wage !== null ? `+${wage.toFixed(2)}%` : '—';

  // Scale bars (max 5% = 100%)
  const maxPct = 5;
  document.getElementById('ghost-prod-bar').style.width = prod ? Math.min(prod / maxPct * 100, 100) + '%' : '0%';
  document.getElementById('ghost-wage-bar').style.width = wage ? Math.min(wage / maxPct * 100, 100) + '%' : '0%';

  const gapEl = document.getElementById('ghost-gap-value');
  gapEl.textContent = gap !== null ? gap.toFixed(2) : '—';

  const gapColor = gap > 2 ? 'var(--critical-text)' : gap > 1 ? 'var(--warning-text)' : gap > 0.5 ? 'var(--elevated-text)' : 'var(--normal-text)';
  gapEl.style.color = gapColor;

  document.getElementById('ghost-gap-desc').textContent =
    gap > 2 ? 'Critical divergence. Productivity far outpacing wages.'
    : gap > 1 ? 'Widening gap. Watch closely.'
    : 'Within normal range.\nWatch for persistent widening.';
}

function renderDetailCards(data, fredData) {
  const container = document.getElementById('details-grid');
  container.innerHTML = '';

  const detailLinks = {
    displacement: { name: 'Displacement', series: ['LNU04032239', 'LNU04032237', 'CES6054000001'] },
    spending: { name: 'Consumer Spending', series: ['PCEC96', 'UMCSENT', 'RSAFS'] },
    credit_stress: { name: 'Credit Stress', series: ['BAMLH0A0HYM2', 'BAMLH0A3HYC', 'DRCLACBS'] },
    mortgage_stress: { name: 'Mortgage Stress', series: ['DRSFRMACBS'] },
  };

  for (const [linkId, config] of Object.entries(detailLinks)) {
    const linkData = data.chain_links[linkId];
    if (!linkData) continue;

    let rows = '';
    for (const seriesId of config.series) {
      const indicator = linkData.indicators[seriesId];
      let latestValue = '—';

      // Get actual value from fredData
      for (const chainData of Object.values(fredData.chain_links)) {
        if (chainData[seriesId] && chainData[seriesId].latest) {
          latestValue = formatValue(seriesId, chainData[seriesId].latest.value);
          break;
        }
      }

      const z = indicator ? indicator.z : null;
      const zStr = z !== null ? (z > 0 ? '+' : '') + z.toFixed(2) : '—';

      rows += `
        <tr>
          <td><span class="name">${INDICATOR_NAMES[seriesId] || seriesId}</span><br><span class="series">${seriesId}</span></td>
          <td class="mono">${latestValue}</td>
          <td class="mono">${zStr}</td>
        </tr>`;
    }

    // Extra explainer for mortgage
    let extra = '';
    if (linkId === 'mortgage_stress') {
      extra = `<div style="padding:1rem 1.25rem; font-size:0.78rem; color:var(--text-secondary); line-height:1.6;">
        The final link in the displacement chain. In the scenario, this would be the last indicator to deteriorate — lagging displacement by 12–18 months.
      </div>`;
    }

    const card = document.createElement('div');
    card.className = 'detail-card';
    card.innerHTML = `
      <div class="detail-card-header">
        <h3>${config.name}</h3>
        ${makeBadge(linkData.status, 'badge-sm')}
      </div>
      <table class="detail-table">
        <tr><th>Indicator</th><th>Value</th><th>Z</th></tr>
        ${rows}
      </table>
      ${extra}
    `;
    container.appendChild(card);
  }
}

function renderCharts(fredData) {
  const container = document.getElementById('charts-grid');
  container.innerHTML = '';

  // Key series to chart (one per card)
  const chartConfigs = [
    { series: 'LNU04032239', title: 'Prof & Business Services Unemployment', chain: 'displacement' },
    { series: 'LNU04032237', title: 'Information Industry Unemployment', chain: 'displacement' },
    { series: 'UMCSENT', title: 'Consumer Sentiment (UMich)', chain: 'spending' },
    { series: 'BAMLH0A0HYM2', title: 'HY Credit Spreads (OAS)', chain: 'credit_stress' },
    { series: 'BAMLH0A3HYC', title: 'CCC & Lower Spreads', chain: 'credit_stress' },
    { series: 'DRSFRMACBS', title: 'SF Mortgage Delinquency Rate', chain: 'mortgage_stress' },
  ];

  for (const config of chartConfigs) {
    let observations = [];
    for (const chainData of Object.values(fredData.chain_links)) {
      if (chainData[config.series]) {
        observations = chainData[config.series].observations || [];
        break;
      }
    }

    if (observations.length === 0) continue;

    const card = document.createElement('div');
    card.className = 'chart-card';

    const canvasId = `chart-${config.series}`;
    card.innerHTML = `
      <h4>${config.title}</h4>
      <div class="chart-subtitle">${config.series} · ${observations.length} data points</div>
      <div class="chart-wrap"><canvas id="${canvasId}"></canvas></div>
    `;
    container.appendChild(card);

    // Render chart
    const ctx = document.getElementById(canvasId).getContext('2d');
    const labels = observations.map(o => o.date);
    const values = observations.map(o => o.value);

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#B45309',
          backgroundColor: 'rgba(180, 83, 9, 0.05)',
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1C1917',
            titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) => formatValue(config.series, ctx.parsed.y),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              color: '#A8A29E',
              maxTicksLimit: 6,
              callback: function(value, index) {
                const label = this.getLabelForValue(value);
                return label ? label.substring(0, 7) : '';
              },
            },
            border: { color: '#D6D3CD' },
          },
          y: {
            grid: { color: '#E7E5DF', lineWidth: 0.5 },
            ticks: {
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              color: '#A8A29E',
              maxTicksLimit: 5,
            },
            border: { display: false },
          },
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
      },
    });
  }
}

// ---- INDEED JOB POSTINGS ----

function renderIndeed(indeedData) {
  const container = document.getElementById('indeed-section');
  if (!container || !indeedData) return;

  const agg = indeedData.aggregate;
  const sectors = indeedData.sectors || {};

  // Build sector cards
  let sectorHTML = '';
  const sectorOrder = ['Software Development', 'Marketing', 'Media & Communications', 'Banking & Finance', 'Accounting'];

  for (const name of sectorOrder) {
    const data = sectors[name];
    if (!data || !data.latest) continue;

    const val = data.latest.value;
    const diff = val - 100;
    const diffStr = diff >= 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`;
    const color = val < 80 ? 'var(--warning-text)' : val < 95 ? 'var(--elevated-text)' : 'var(--normal-text)';

    sectorHTML += `
      <div class="indeed-sector-card">
        <div class="indeed-sector-name">${name}</div>
        <div class="indeed-sector-value" style="color:${color}">${val.toFixed(0)}</div>
        <div class="indeed-sector-diff" style="color:${color}">${diffStr} vs Feb 2020</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="section-header">
      <h2>Job Postings</h2>
      <span class="section-badge">Indeed Hiring Lab · Daily</span>
    </div>
    <div class="indeed-grid">
      <div class="indeed-aggregate">
        <div class="indeed-agg-label">Overall US Postings</div>
        <div class="indeed-agg-value">${agg.latest ? agg.latest.value.toFixed(1) : '—'}</div>
        <div class="indeed-agg-baseline">Index (100 = Feb 2020)</div>
        <div class="indeed-chart-wrap">
          <canvas id="chart-indeed-agg"></canvas>
        </div>
      </div>
      <div class="indeed-sectors">
        <div class="indeed-sectors-label">White-Collar Sectors</div>
        <div class="indeed-sectors-grid">${sectorHTML}</div>
      </div>
    </div>
  `;

  // Render aggregate chart
  if (agg.observations && agg.observations.length > 0) {
    const ctx = document.getElementById('chart-indeed-agg');
    if (ctx) {
      // Downsample to weekly for performance
      const weekly = agg.observations.filter((_, i) => i % 7 === 0);
      new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
          labels: weekly.map(o => o.date),
          datasets: [{
            data: weekly.map(o => o.value),
            borderColor: '#B45309',
            backgroundColor: 'rgba(180, 83, 9, 0.05)',
            borderWidth: 1.5,
            fill: true,
            pointRadius: 0,
            tension: 0.3,
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          plugins: { legend: { display: false },
            tooltip: {
              backgroundColor: '#1C1917',
              titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
              bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
              padding: 10, cornerRadius: 6,
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { family: "'JetBrains Mono'", size: 9 }, color: '#A8A29E', maxTicksLimit: 6, callback: function(v) { return this.getLabelForValue(v)?.substring(0, 7) || ''; } }, border: { color: '#D6D3CD' } },
            y: { grid: { color: '#E7E5DF', lineWidth: 0.5 }, ticks: { font: { family: "'JetBrains Mono'", size: 9 }, color: '#A8A29E', maxTicksLimit: 5 }, border: { display: false } },
          },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }
  }
}

// ---- CONTEXT INDICATORS ----

function renderContext(fredData) {
  const container = document.getElementById('context-section');
  if (!container) return;

  const contextSeries = {
    'BABATOTALSAUS': { name: 'New Business Applications', fmt: v => Math.round(v).toLocaleString() + '/mo' },
    'USCONS': { name: 'Construction Employment', fmt: v => Math.round(v).toLocaleString() + 'K' },
    'JTSJOL': { name: 'Job Openings (JOLTS)', fmt: v => Math.round(v).toLocaleString() + 'K' },
  };

  const contextData = fredData.chain_links.context || {};
  let cardsHTML = '';

  for (const [seriesId, meta] of Object.entries(contextSeries)) {
    const series = contextData[seriesId];
    if (!series || !series.latest) continue;

    const val = series.latest.value;
    const obs = series.observations || [];

    // Compute YoY change
    let yoyStr = '';
    if (obs.length >= 13) {
      const prev = obs[obs.length - 13].value;
      if (prev > 0) {
        const yoy = ((val - prev) / prev) * 100;
        yoyStr = (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '% YoY';
      }
    }

    cardsHTML += `
      <div class="context-card">
        <div class="context-card-name">${meta.name}</div>
        <div class="context-card-value">${meta.fmt(val)}</div>
        <div class="context-card-change">${yoyStr}</div>
        <div class="context-card-series">${seriesId}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="section-header">
      <h2>Economic Context</h2>
      <span class="section-badge">Counter-indicators</span>
    </div>
    <p class="context-explainer">These indicators track whether offsetting economic dynamics — new business creation, construction hiring from AI capex, and overall labor demand — are absorbing displaced workers.</p>
    <div class="context-grid">${cardsHTML}</div>
  `;
}

// ---- INIT ----

async function init() {
  try {
    let indicators, fredData, indeedData;

    if (window.__INLINE_DATA__) {
      indicators = window.__INDICATORS__;
      fredData = window.__FRED_RAW__;
      indeedData = window.__INDEED_RAW__ || null;
    } else {
      const [indicatorsRes, fredRes] = await Promise.all([
        fetch(DATA_PATH),
        fetch(FRED_PATH),
      ]);
      if (!indicatorsRes.ok || !fredRes.ok) throw new Error('Failed to load data files');
      indicators = await indicatorsRes.json();
      fredData = await fredRes.json();

      // Indeed is optional
      try {
        const indeedRes = await fetch(INDEED_PATH);
        if (indeedRes.ok) indeedData = await indeedRes.json();
      } catch (e) { /* optional */ }
    }

    renderComposite(indicators);
    renderChainOverview(indicators);
    populateChainValues(fredData, indicators);
    renderGhostGDP(indicators);
    renderDetailCards(indicators, fredData);
    renderIndeed(indeedData);
    renderContext(fredData);
    renderCharts(fredData);

  } catch (err) {
    console.error('Failed to load Displacement Index data:', err);
    document.getElementById('composite-score').textContent = '?';
    document.getElementById('hero-date').textContent = 'Data unavailable';
  }
}

document.addEventListener('DOMContentLoaded', init);
