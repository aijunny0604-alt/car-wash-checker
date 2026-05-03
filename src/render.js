// DOM 렌더링 — 메인 카드 + 7일 스트립 + 시간별 차트 + 출처.

import { classifyWeather } from './weatherKind.js';
import { renderWeatherAnimation } from './animations.js';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function renderMainCard(el, day, coverage, opts = {}) {
  const cls = day.verdict.grade.toLowerCase();
  const dt = new Date(day.date + 'T00:00:00');
  const dateLabel = `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW_KO[dt.getDay()]})`;
  const isToday = day.date === toIsoLocal(new Date());
  const dateTag = isToday ? '오늘' : dateLabel;

  const kind = classifyWeather(day.weather);
  el.style.setProperty('--card-from', kind.palette.from);
  el.style.setProperty('--card-to',   kind.palette.to);

  const score = day.verdict.score;
  const circumference = 2 * Math.PI * 54;
  const dash = (score / 100) * circumference;
  const w = day.weather || {};
  const a = day.air || {};

  // 첫 호출이면 스켈레톤 한 번만 만들고, 두번째부터는 텍스트/클래스만 갱신
  if (!el.dataset.scaffolded) {
    el.innerHTML = `
      <div class="date-tag" data-bind="dateTag"></div>
      <div class="best-badge" data-bind="bestBadge" hidden></div>
      <div class="climate-badge" data-bind="climateBadge" hidden></div>
      <div class="weather-stage" id="weatherStage"></div>
      <div class="weather-label" data-bind="weatherLabel"></div>
      <div class="score-gauge" role="img">
        <svg viewBox="0 0 120 120">
          <circle class="gauge-bg" cx="60" cy="60" r="54" />
          <circle class="gauge-fg" cx="60" cy="60" r="54" />
        </svg>
        <div class="gauge-text">
          <div class="gauge-num" data-bind="gaugeNum"></div>
          <div class="gauge-label" data-bind="gaugeLabel"></div>
        </div>
      </div>
      <div class="reasons" data-bind="reasons"></div>
      <div class="metric-row" aria-label="기상 메트릭">
        <div class="metric"><div class="icon">🌡</div><div class="v" data-bind="mTemp"></div><div class="lbl">기온</div></div>
        <div class="metric"><div class="icon">💧</div><div class="v" data-bind="mHum"></div><div class="lbl">습도</div></div>
        <div class="metric"><div class="icon">💨</div><div class="v" data-bind="mWind"></div><div class="lbl">바람</div></div>
        <div class="metric"><div class="icon">🌫</div><div class="v" data-bind="mPm"></div><div class="lbl">PM10/2.5</div></div>
      </div>
      <div class="coverage" data-bind="coverage"></div>
    `;
    el.dataset.scaffolded = '1';
  }

  // 데이터만 갱신
  const $b = (name) => el.querySelector(`[data-bind="${name}"]`);

  $b('dateTag').textContent = dateTag;
  const bb = $b('bestBadge');
  bb.hidden = !opts.isBest;
  bb.textContent = '🏆 이번 주 최적일';
  const cb = $b('climateBadge');
  if (day.confidence === 'low') {
    cb.hidden = false;
    cb.innerHTML = '📊 과거 30년 평균 <strong>참고치</strong> · 정확한 예보 아님';
  } else {
    cb.hidden = true;
  }

  $b('weatherLabel').textContent = kind.label;

  // 게이지 호 길이 (CSS transition: stroke-dasharray)
  const fg = el.querySelector('.gauge-fg');
  fg.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${circumference.toFixed(1)}`);
  $b('gaugeNum').textContent = score;
  $b('gaugeLabel').textContent = labelOf(day.verdict.grade);
  // 등급별 색깔 텍스트 변경
  const gradeText = el.querySelector('.gauge-text');
  gradeText.classList.remove('grade-ok', 'grade-hold', 'grade-avoid');
  gradeText.classList.add(`grade-${cls}`);

  // 사유 칩
  $b('reasons').innerHTML = day.verdict.reasons.map(r => `<span>${escapeHtml(r)}</span>`).join('');

  // 메트릭
  $b('mTemp').textContent = fmtTemp(w.tempMin, w.tempMax);
  $b('mHum').textContent  = fmtHumidity(w.humidityAvg);
  $b('mWind').textContent = fmtWind(w.windSpeedMax);
  $b('mPm').textContent   = fmtPm(a.pm10, a.pm25);

  $b('coverage').textContent = `데이터 종합: 날씨 ${coverage.weather}, 대기질 ${coverage.air}`;

  // 애니메이션 (kind 같으면 재생성 안 함)
  const stage = el.querySelector('#weatherStage');
  if (stage) renderWeatherAnimation(stage, kind.kind);
}

function metric(icon, value, lbl) {
  return `
    <div class="metric">
      <div class="icon" aria-hidden="true">${icon}</div>
      <div class="v">${escapeHtml(value)}</div>
      <div class="lbl">${escapeHtml(lbl)}</div>
    </div>`;
}
function fmtTemp(mn, mx) {
  if (!Number.isFinite(mn) && !Number.isFinite(mx)) return '–';
  if (!Number.isFinite(mn)) return `${Math.round(mx)}℃`;
  if (!Number.isFinite(mx)) return `${Math.round(mn)}℃`;
  return `${Math.round(mn)}~${Math.round(mx)}℃`;
}
function fmtHumidity(h) { return Number.isFinite(h) ? `${h}%` : '–'; }
function fmtWind(w) { return Number.isFinite(w) ? `${w.toFixed(1)} m/s` : '–'; }
function fmtPm(pm10, pm25) {
  if (!Number.isFinite(pm10) && !Number.isFinite(pm25)) return '–';
  const a = Number.isFinite(pm10) ? pm10 : '–';
  const b = Number.isFinite(pm25) ? pm25 : '–';
  return `${a} / ${b}`;
}

// ──────────────────────────────────────
// 시간별 sparkline (강수확률 채우기 + 기온 라인)
// ──────────────────────────────────────
export function renderHourlyChart(svgEl, sectionEl, hourly) {
  if (!hourly || !hourly.time?.length) {
    sectionEl.hidden = true;
    return;
  }
  sectionEl.hidden = false;

  // SVG 좌표계: viewBox 600x140, 좌(강수%) / 우(기온℃) 라벨 영역 확보
  const W = 600, H = 140;
  const PAD_L = 30;   // 좌측 강수확률 라벨
  const PAD_R = 32;   // 우측 기온 라벨
  const PAD_T = 14;
  const PAD_B = 22;

  const N = Math.min(24, hourly.time.length);
  const times = hourly.time.slice(0, N);
  const probs = (hourly.precipProb || []).slice(0, N).map(v => Number.isFinite(v) ? v : 0);
  const temps = (hourly.temp || []).slice(0, N).map(v => Number.isFinite(v) ? v : null);

  const tValid = temps.filter(v => v != null);
  const tMin = tValid.length ? Math.floor(Math.min(...tValid) - 1) : 0;
  const tMax = tValid.length ? Math.ceil(Math.max(...tValid) + 1)  : 1;
  const tRange = (tMax - tMin) || 1;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xAt   = (i) => PAD_L + (i / (N - 1)) * innerW;
  const yProb = (p) => PAD_T + innerH - (p / 100) * innerH;
  const yTemp = (t) => t == null ? null : PAD_T + innerH - ((t - tMin) / tRange) * innerH;

  // 첫 렌더 시 컨테이너 그룹 생성
  if (!svgEl.querySelector('.chart-bars')) {
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.innerHTML = `
      <defs>
        <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="#3884e2" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#3884e2" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      <g class="chart-grid"></g>
      <g class="chart-y-left"></g>
      <g class="chart-y-right"></g>
      <g class="chart-bars"></g>
      <path class="spark-precip-fill" d=""/>
      <path class="spark-precip-line" d=""/>
      <path class="spark-temp-line"   d=""/>
      <g class="chart-temp-dots"></g>
      <g class="spark-x-labels"></g>
    `;
  }

  // 그리드 + Y축 라벨 (강수 0/50/100, 기온 min/mid/max)
  const gridLevels = [0, 25, 50, 75, 100];
  const grid = gridLevels.map(p => {
    const y = yProb(p);
    return `<line class="chart-grid-line" x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" />`;
  }).join('');
  svgEl.querySelector('.chart-grid').innerHTML = grid;

  const yLeft = gridLevels.map(p => {
    const y = yProb(p);
    return `<text class="chart-axis-label chart-axis-precip" x="${PAD_L - 4}" y="${y + 3}" text-anchor="end">${p}</text>`;
  }).join('') + `<text class="chart-axis-unit chart-axis-precip" x="${PAD_L - 4}" y="${PAD_T - 4}" text-anchor="end">%</text>`;
  svgEl.querySelector('.chart-y-left').innerHTML = yLeft;

  const tLevels = [tMin, Math.round((tMin + tMax) / 2), tMax];
  const yRight = tLevels.map(t => {
    const y = yTemp(t);
    return `<text class="chart-axis-label chart-axis-temp" x="${W - PAD_R + 4}" y="${y + 3}" text-anchor="start">${Math.round(t)}°</text>`;
  }).join('') + `<text class="chart-axis-unit chart-axis-temp" x="${W - PAD_R + 4}" y="${PAD_T - 4}" text-anchor="start">℃</text>`;
  svgEl.querySelector('.chart-y-right').innerHTML = yRight;

  // 강수확률 막대 (얇은 막대) + area + line 결합
  const barW = Math.max(2, innerW / N - 2);
  const bars = probs.map((p, i) => {
    const x = xAt(i) - barW / 2;
    const y = yProb(p);
    const h = (PAD_T + innerH) - y;
    if (h <= 0) return '';
    return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" />`;
  }).join('');
  svgEl.querySelector('.chart-bars').innerHTML = bars;

  // 강수확률 area + line
  let probPath = `M ${xAt(0)} ${yProb(probs[0])}`;
  for (let i = 1; i < N; i++) probPath += ` L ${xAt(i)} ${yProb(probs[i])}`;
  const fillPath = probPath + ` L ${xAt(N - 1)} ${PAD_T + innerH} L ${xAt(0)} ${PAD_T + innerH} Z`;

  // 기온 라인 + 점
  let tempPath = '';
  let started = false;
  const dots = [];
  for (let i = 0; i < N; i++) {
    const y = yTemp(temps[i]);
    if (y == null) continue;
    tempPath += `${started ? 'L' : 'M'} ${xAt(i)} ${y} `;
    started = true;
    if (i % 3 === 0) {
      dots.push(`<circle class="chart-temp-dot" cx="${xAt(i)}" cy="${y}" r="3"/>`);
      dots.push(`<text class="chart-temp-label" x="${xAt(i)}" y="${y - 6}" text-anchor="middle">${Math.round(temps[i])}°</text>`);
    }
  }

  svgEl.querySelector('.spark-precip-fill').setAttribute('d', fillPath);
  svgEl.querySelector('.spark-precip-line').setAttribute('d', probPath);
  svgEl.querySelector('.spark-temp-line').setAttribute('d', tempPath || '');
  svgEl.querySelector('.chart-temp-dots').innerHTML = dots.join('');

  // X축 시간 라벨
  const labels = [];
  for (let i = 0; i < N; i += 3) {
    const dt = new Date(times[i]);
    const hh = dt.getHours();
    labels.push(`<text class="spark-label" x="${xAt(i)}" y="${H - 6}" text-anchor="middle">${hh}시</text>`);
  }
  const labelsG = svgEl.querySelector('.spark-x-labels');
  if (labelsG) labelsG.innerHTML = labels.join('');
}

export function renderForecast(listEl, daily, { selectedDate, bestDate, onSelect } = {}) {
  // 같은 daily 데이터(날짜 시퀀스 동일)면 선택 클래스만 토글 → 인디케이터 부드러움
  const dateKey = daily.map(d => d.date).join(',');
  if (listEl.dataset.dateKey === dateKey) {
    for (const li of listEl.querySelectorAll('li.forecast-day')) {
      li.classList.toggle('selected', li.dataset.date === selectedDate);
    }
    if (typeof onSelect === 'function') listEl._onSelect = onSelect;
    return;
  }
  listEl.dataset.dateKey = dateKey;

  listEl.innerHTML = daily.map(d => {
    const cls = d.verdict.grade.toLowerCase();
    const dt = new Date(d.date + 'T00:00:00');
    const dow = DOW_KO[dt.getDay()];
    const md = `${dt.getMonth() + 1}/${dt.getDate()}`;
    const sel = d.date === selectedDate ? ' selected' : '';
    const best = d.date === bestDate ? ' best' : '';
    const kind = classifyWeather(d.weather);
    const score = d.verdict.score;
    const scoreColors = scoreGradient(score);
    const tHi = Number.isFinite(d.weather?.tempMax) ? `${Math.round(d.weather.tempMax)}°` : '';
    const tLo = Number.isFinite(d.weather?.tempMin) ? `${Math.round(d.weather.tempMin)}°` : '';
    const styleVars = [
      `--day-from:${kind.palette.from}`,
      `--day-to:${kind.palette.to}`,
      `--score-from:${scoreColors.from}`,
      `--score-to:${scoreColors.to}`,
    ].join(';');
    const lowConf = d.confidence === 'low' ? ' is-climate' : '';
    return `
      <li class="forecast-day ${cls}${sel}${best}${lowConf}" data-date="${d.date}"
          style="${styleVars}" tabindex="0" role="button"
          aria-label="${md} ${d.verdict.grade} ${score}점${lowConf ? ' 참고치' : ''}">
        <div class="dow">${dow}</div>
        <div class="md">${md}</div>
        <div class="mini-icon" aria-hidden="true">${miniWeatherIcon(kind.kind)}</div>
        <div class="score-num">${score}</div>
        <div class="score-bar"><span class="score-bar-fill" style="width:${score}%"></span></div>
        <div class="meta">${tLo && tHi ? `<span>${tLo}/${tHi}</span>` : ''}</div>
        ${lowConf ? '<div class="climate-tag" aria-hidden="true">참고치</div>' : ''}
      </li>`;
  }).join('');

  // 핸들러는 한 번만 — 매 호출마다 누적 등록되는 버그 방지
  if (typeof onSelect === 'function' && !listEl.dataset.bound) {
    listEl.addEventListener('click', (ev) => {
      const li = ev.target.closest('li.forecast-day');
      if (li?.dataset.date) listEl._onSelect?.(li.dataset.date);
    });
    listEl.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const li = ev.target.closest('li.forecast-day');
      if (li?.dataset.date) { ev.preventDefault(); listEl._onSelect?.(li.dataset.date); }
    });
    listEl.dataset.bound = '1';
  }
  if (typeof onSelect === 'function') listEl._onSelect = onSelect;
}

function scoreGradient(score) {
  if (score >= 80) return { from: '#16a34a', to: '#4ade80' };
  if (score >= 50) return { from: '#eab308', to: '#fcd34d' };
  return { from: '#dc2626', to: '#f87171' };
}

// 미니 SVG 아이콘 — 7일 카드용 (이모지보다 일관된 비주얼)
function miniWeatherIcon(kind) {
  const sun = `
    <radialGradient id="msun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff7c2"/>
      <stop offset="60%" stop-color="#ffd96a"/>
      <stop offset="100%" stop-color="#ff9d3b"/>
    </radialGradient>`;
  const cloud = `<g fill="#fff" stroke="#cbd5e1" stroke-width="1">
    <ellipse cx="22" cy="34" rx="12" ry="8"/>
    <ellipse cx="32" cy="30" rx="14" ry="9"/>
    <ellipse cx="42" cy="34" rx="11" ry="8"/>
  </g>`;
  switch (kind) {
    case 'sunny':
    case 'sunny-hot':
      return svg(`
        <defs>${sun}</defs>
        <g class="mini-rays" style="transform-origin:32px 32px;animation:spin 14s linear infinite">
          ${[0,45,90,135,180,225,270,315].map(a => `<line x1="32" y1="14" x2="32" y2="6" stroke="#ffcd55" stroke-width="3" stroke-linecap="round" transform="rotate(${a} 32 32)"/>`).join('')}
        </g>
        <circle cx="32" cy="32" r="14" fill="url(#msun)"/>
      `);
    case 'cloudy':
      return svg(cloud);
    case 'rain':
      return svg(`
        ${cloud}
        ${[0,1,2].map(i => `<line x1="${22 + i*8}" y1="44" x2="${20 + i*8}" y2="54" stroke="#3884e2" stroke-width="2.5" stroke-linecap="round"/>`).join('')}
      `);
    case 'rain-heavy':
      return svg(`
        ${cloud}
        ${[0,1,2,3,4].map(i => `<line x1="${18 + i*6}" y1="44" x2="${16 + i*6}" y2="56" stroke="#3884e2" stroke-width="2.5" stroke-linecap="round"/>`).join('')}
      `);
    case 'snow':
      return svg(`
        ${cloud}
        <text x="22" y="52" font-size="10" fill="#94a3b8">❄</text>
        <text x="30" y="56" font-size="10" fill="#94a3b8">❄</text>
        <text x="40" y="52" font-size="10" fill="#94a3b8">❄</text>
      `);
    case 'windy':
      return svg(`
        ${cloud}
        <path d="M10 46 Q 30 42, 50 46" stroke="#7393a8" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M10 52 Q 28 48, 46 52" stroke="#7393a8" stroke-width="2" fill="none" stroke-linecap="round"/>
      `);
    default:
      return svg(cloud);
  }
}
function svg(inner) {
  return `<svg viewBox="0 0 64 64">${inner}</svg>`;
}

function toIsoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function renderSources(el, sources) {
  const all = [...(sources.weather || []), ...(sources.air || [])];
  if (!all.length) { el.textContent = ''; return; }
  el.textContent = '출처: ' + all.map(prettySource).join(' · ');
}

export function renderError(el, message, onRetry) {
  el.innerHTML = `
    <div class="error">${escapeHtml(message)}</div>
    <button class="retry-btn" id="retryBtn">다시 시도</button>
  `;
  el.querySelector('#retryBtn')?.addEventListener('click', onRetry);
}

export function renderLoading(el) {
  el.innerHTML = `<div class="loading">불러오는 중…</div>`;
}

export function setLocationLabel(el, label) {
  el.textContent = `📍 ${label}`;
}

function labelOf(grade) {
  return grade === 'OK' ? '세차 OK' : grade === 'HOLD' ? '보류' : '비추천';
}

function prettySource(id) {
  return ({
    'open-meteo':    'Open-Meteo',
    'met-norway':    'MET Norway',
    '7timer':        '7Timer!',
    'open-meteo-aq': 'Open-Meteo AQ',
    'openweather':   'OpenWeather',
    'weatherbit':    'Weatherbit',
    'kma':           '기상청',
    'air-korea':     '에어코리아',
    'waqi':          'WAQI',
    'iqair':         'IQAir',
  })[id] || id;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}
