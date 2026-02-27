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

// Chain-level tooltips (same behavior/style as the rest of the site tooltips)
const CHAIN_TOOLTIP_DEFS = {
  'chain:displacement': {
    title: 'Link 1: White-Collar Displacement',
    bodyHtml: 'The <strong>first domino</strong>. If AI tools replace knowledge workers faster than the economy can reabsorb them, unemployment in professional and technical sectors rises before it shows up in headline numbers.',
    contextHtml: '<span class="chain-emoji">🔗</span><strong>Chain position:</strong> This is the trigger. Rising white-collar unemployment → reduced household income → feeds into <strong>Link 2: Consumer Spending</strong>.',
    source: 'BLS / FRED · LNU04032239, LNU04032237, CES6054000001',
  },
  'chain:spending': {
    title: 'Link 2: Consumer Spending',
    bodyHtml: 'Household transmission layer. As displacement pressures income and confidence, <strong>aggregate consumer demand falls</strong> — connecting labor stress to broader slowdown and credit dependence.',
    contextHtml: '<span class="chain-emoji">🔗</span><strong>Chain position:</strong> Fed by <strong>Link 1</strong> (job losses → less income). Feeds into <strong>Link 3: Ghost GDP</strong> and <strong>Link 4: Credit Stress</strong>.',
    source: 'BEA, UMich, Census / FRED · PCEC96, UMCSENT, RSAFS',
  },
  'chain:ghost_gdp': {
    title: 'Link 3: Ghost GDP',
    bodyHtml: 'The <strong>smoke signal</strong>. Productivity rises while wages lag, so output can look healthy in aggregate while household purchasing power falls behind.',
    contextHtml: '<span class="chain-emoji">🔗</span><strong>Chain position:</strong> Confirms mechanism between early labor stress and later financial stress. Persistent divergence increases pressure on <strong>Link 4: Credit Stress</strong>.',
    source: 'BLS / FRED · OPHNFB, LES1252881600Q, M2V',
  },
  'chain:credit_stress': {
    title: 'Link 4: Credit Stress',
    bodyHtml: 'The <strong>amplifier</strong>. When income doesn\'t keep pace, households lean on credit. Widening spreads and rising delinquencies indicate stress transmission from labor/spending into financial conditions.',
    contextHtml: '<span class="chain-emoji">🔗</span><strong>Chain position:</strong> Downstream from <strong>Links 1–3</strong>. Sustained stress here can cascade into <strong>Link 5: Mortgage Stress</strong>.',
    source: 'ICE BofA, FDIC / FRED · BAMLH0A0HYM2, BAMLH0A3HYC, DRCLACBS',
  },
  'chain:mortgage_stress': {
    title: 'Link 5: Mortgage & Housing Stress',
    bodyHtml: 'The <strong>final link</strong>. Mortgage delinquency usually lags earlier stress by 12–18 months, so activation here suggests displacement pressure has become systemic.',
    contextHtml: '<span class="chain-emoji">🔗</span><strong>Chain position:</strong> End of chain. Typically fires only after sustained deterioration in <strong>Links 1–4</strong>.',
    source: 'FDIC / FRED · DRSFRMACBS',
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

// Tooltip definitions — one-liner explanations + source for each metric
const TOOLTIP_DEFS = {
  LNU04032239: {
    title: 'Prof & Business Services Unemployment',
    body: 'Unemployment rate for professional and business services workers — the sector most directly exposed to AI-driven automation of white-collar tasks.',
    source: 'FRED / BLS',
  },
  LNU04032237: {
    title: 'Information Industry Unemployment',
    body: 'Unemployment in information services (tech, media, telecom). Historically volatile but first to reflect structural shifts in knowledge work demand.',
    source: 'FRED / BLS',
  },
  CES6054000001: {
    title: 'Professional/Scientific/Technical Employment',
    body: 'Total employees in professional, scientific, and technical services. A declining trend here would confirm displacement beyond just unemployment claims.',
    source: 'FRED / BLS',
  },
  UNRATE: {
    title: 'Overall Unemployment Rate',
    body: 'Headline U-3 unemployment. Useful as a baseline — if sector unemployment rises while headline stays flat, it signals displacement rather than recession.',
    source: 'FRED / BLS',
  },
  PCEC96: {
    title: 'Real Personal Consumption',
    body: 'Total goods and services purchased by households, adjusted for inflation. The broadest measure of consumer spending power.',
    source: 'FRED / BEA',
  },
  UMCSENT: {
    title: 'Consumer Sentiment (UMich)',
    body: 'University of Michigan survey of household expectations. Often a leading indicator — sentiment can fall well before actual spending declines.',
    source: 'FRED / UMich',
  },
  RSAFS: {
    title: 'Retail Sales',
    body: 'Advance monthly estimate of total retail and food services sales. A direct, nominal measure of consumer spending on goods.',
    source: 'FRED / Census',
  },
  OPHNFB: {
    title: 'Nonfarm Business Productivity',
    body: 'Output per hour in the nonfarm business sector. Rising productivity with stagnant wages is the "Ghost GDP" signal.',
    source: 'FRED / BLS',
  },
  LES1252881600Q: {
    title: 'Real Median Weekly Earnings',
    body: 'Inflation-adjusted median weekly earnings for full-time workers. The wage side of the Ghost GDP equation.',
    source: 'FRED / BLS',
  },
  M2V: {
    title: 'M2 Money Velocity',
    body: 'How many times a dollar circulates through the economy per quarter. Falling velocity means money is being saved or hoarded rather than spent.',
    source: 'FRED / St. Louis Fed',
  },
  BAMLH0A0HYM2: {
    title: 'HY Credit Spreads (OAS)',
    body: 'Option-Adjusted Spread measures extra yield investors demand over Treasuries. Rising spreads imply increasing perceived default risk.',
    source: 'FRED / ICE BofA',
  },
  BAMLH0A3HYC: {
    title: 'CCC & Lower Spreads',
    body: 'Lower-quality credit tends to move first. Widening CCC spreads signal stress in the weakest borrowers even if broader markets appear stable.',
    source: 'FRED / ICE BofA',
  },
  DRCLACBS: {
    title: 'Consumer Loan Delinquency',
    body: 'Share of consumer loans at commercial banks that are delinquent. Slow-moving but confirms credit stress once it rises.',
    source: 'FRED / FDIC',
  },
  DRSFRMACBS: {
    title: 'SF Mortgage Delinquency',
    body: 'Single-family residential mortgage delinquency rate. The final link — would be the last to deteriorate, lagging displacement by 12–18 months.',
    source: 'FRED / FDIC',
  },
  BABATOTALSAUS: {
    title: 'New Business Applications',
    body: 'Monthly business applications filed with the IRS. A counter-indicator: rising applications could signal displaced workers creating new businesses.',
    source: 'FRED / Census',
  },
  USCONS: {
    title: 'Construction Employment',
    body: 'Total construction sector employment. AI infrastructure (data centers) could boost this sector even as white-collar roles decline.',
    source: 'FRED / BLS',
  },
  JTSJOL: {
    title: 'Job Openings (JOLTS)',
    body: 'Total nonfarm job openings. A broad measure of labor demand across the economy.',
    source: 'FRED / BLS',
  },
  // Indeed sectors
  'indeed:Software Development': {
    title: 'Software Development Postings',
    body: 'Job postings index relative to Feb 2020 baseline (100). The sector most exposed to AI code generation tools.',
    source: 'Indeed Hiring Lab (CC-BY-4.0)',
  },
  'indeed:Media & Communications': {
    title: 'Media & Communications Postings',
    body: 'Postings for media, journalism, and communications. One of the most impacted white-collar categories.',
    source: 'Indeed Hiring Lab (CC-BY-4.0)',
  },
  'indeed:Marketing': {
    title: 'Marketing Postings',
    body: 'Marketing role postings. Increasingly automatable via AI content generation, reducing demand for junior and mid-level positions.',
    source: 'Indeed Hiring Lab (CC-BY-4.0)',
  },
  'indeed:Banking & Finance': {
    title: 'Banking & Finance Postings',
    body: 'Financial sector postings. Exposed to AI-driven automation in analysis, compliance, and back-office operations.',
    source: 'Indeed Hiring Lab (CC-BY-4.0)',
  },
  'indeed:Accounting': {
    title: 'Accounting Postings',
    body: 'Accounting role postings. Routine bookkeeping and audit tasks are among the most automatable white-collar functions.',
    source: 'Indeed Hiring Lab (CC-BY-4.0)',
  },
  // Derived
  'ghost_gdp': {
    title: 'Ghost GDP Score',
    body: 'Productivity growth minus real wage growth. A persistent positive gap means economic output is rising faster than what workers receive.',
    source: 'FRED / BLS (derived)',
  },
};

Object.assign(TOOLTIP_DEFS, CHAIN_TOOLTIP_DEFS);

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

function renderFreshnessBanner(generatedAt) {
  const banner = document.getElementById('stale-banner');
  if (!banner || !generatedAt) return;

  const ts = new Date(generatedAt).getTime();
  if (!Number.isFinite(ts)) return;

  const ageMs = Date.now() - ts;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > 12) {
    const rounded = ageHours >= 24
      ? `${(ageHours / 24).toFixed(1)} days`
      : `${ageHours.toFixed(1)} hours`;
    banner.textContent = `Data may be stale: last successful refresh was ${rounded} ago (${formatDate(generatedAt)}).`; 
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
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

    const chainTipKey = `chain:${linkId}`;
    const hasChainTip = !!TOOLTIP_DEFS[chainTipKey];
    const chainTitle = hasChainTip
      ? `<span class="tip" tabindex="0" data-key="${chainTipKey}">${meta.name} <span class="i">i</span></span>`
      : meta.name;

    const item = document.createElement('div');
    item.className = 'chain-item';
    item.innerHTML = `
      <div class="chain-num">${meta.num}</div>
      <div class="chain-label">
        <h3>${chainTitle}</h3>
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

      const tip = TOOLTIP_DEFS[seriesId];
      const nameHtml = tip
        ? `<span class="tip" tabindex="0" data-key="${seriesId}"><span class="name">${INDICATOR_NAMES[seriesId] || seriesId}</span> <span class="i">i</span></span>`
        : `<span class="name">${INDICATOR_NAMES[seriesId] || seriesId}</span>`;

      rows += `
        <tr>
          <td>${nameHtml}<br><span class="series">${seriesId}</span></td>
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

    const tipKey = `indeed:${name}`;
    const hasTip = TOOLTIP_DEFS[tipKey];
    const nameEl = hasTip
      ? `<span class="tip" tabindex="0" data-key="${tipKey}">${name} <span class="i">i</span></span>`
      : name;

    sectorHTML += `
      <div class="indeed-sector-card">
        <div class="indeed-sector-name">${nameEl}</div>
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

    const ctxTip = TOOLTIP_DEFS[seriesId];
    const ctxNameEl = ctxTip
      ? `<span class="tip" tabindex="0" data-key="${seriesId}">${meta.name} <span class="i">i</span></span>`
      : meta.name;

    cardsHTML += `
      <div class="context-card">
        <div class="context-card-name">${ctxNameEl}</div>
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
    renderFreshnessBanner(indicators.generated_at);
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

// ---- TOOLTIP SYSTEM (V1 inline) ----

function initTooltips() {
  const pop = document.getElementById('popover');
  if (!pop) return;

  const popTitle = document.getElementById('popTitle');
  const popBody = document.getElementById('popBody');
  const popContext = document.getElementById('popContext');
  const popSource = document.getElementById('popSource');
  const popDot = document.getElementById('popDot');
  const popStatus = document.getElementById('popStatus');

  let pinned = false;
  let lastTarget = null;

  function showFor(el) {
    if (!el) return;
    lastTarget = el;

    const key = el.dataset.key;
    const def = TOOLTIP_DEFS[key];
    if (!def) return;

    popTitle.textContent = def.title || 'Details';

    const hasRichBody = !!def.bodyHtml;
    if (hasRichBody) {
      popBody.innerHTML = def.bodyHtml;
    } else {
      popBody.textContent = def.body || '';
    }

    const hasContext = !!def.contextHtml;
    if (popContext) {
      if (hasContext) {
        popContext.innerHTML = def.contextHtml;
        popContext.hidden = false;
      } else {
        popContext.hidden = true;
        popContext.innerHTML = '';
      }
    }

    pop.classList.toggle('popover-rich', hasContext || hasRichBody);
    popSource.textContent = def.source ? `Source: ${def.source}` : '';

    // Status dot — hidden for tooltips without status context
    popDot.style.display = 'none';
    popStatus.textContent = '';

    // Position below trigger, left-aligned, clamped to viewport
    const r = el.getBoundingClientRect();
    const margin = 12;
    const popW = Math.min(hasContext ? 560 : 420, window.innerWidth - 32);
    let left = r.left;
    if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
    if (left < margin) left = margin;

    // Measure content-aware height before deciding above/below
    pop.style.left = left + 'px';
    pop.style.top = '0px';
    pop.style.bottom = 'auto';
    const popH = Math.max(pop.offsetHeight || 0, hasContext ? 240 : 180);

    let top = r.bottom + 10;
    // If too close to bottom, show above
    if (top + popH > window.innerHeight - margin) {
      top = Math.max(margin, r.top - popH - 10);
    }

    pop.style.top = top + 'px';
    pop.style.bottom = 'auto';
    pop.style.left = left + 'px';

    pop.classList.add('show');
  }

  function hide() {
    pinned = false;
    pop.classList.remove('show');
  }

  // Delegate events — works for dynamically-rendered tips too
  document.addEventListener('mouseover', (e) => {
    const tip = e.target.closest('.tip');
    if (!tip || pinned) return;
    showFor(tip);
  });

  document.addEventListener('mouseout', (e) => {
    const tip = e.target.closest('.tip');
    if (!tip || pinned) return;
    // Check if we're moving to a child of the same tip
    if (tip.contains(e.relatedTarget)) return;
    pop.classList.remove('show');
  });

  document.addEventListener('click', (e) => {
    const tip = e.target.closest('.tip');
    if (tip) {
      e.preventDefault();
      if (pinned && lastTarget === tip) { hide(); return; }
      pinned = true;
      showFor(tip);
      return;
    }
    // Click outside — dismiss if pinned
    if (pinned && !pop.contains(e.target)) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  window.addEventListener('scroll', () => {
    if (lastTarget && pop.classList.contains('show')) showFor(lastTarget);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (lastTarget && pop.classList.contains('show')) showFor(lastTarget);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  initTooltips();
});
