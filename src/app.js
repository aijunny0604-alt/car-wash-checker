// 부트스트랩 + 상태 머신 (간이).

import { aggregate } from './aggregator.js';
import { scoreDay } from './scoring.js';
import {
  renderMainCard, renderForecast, renderSources, renderError, renderLoading, setLocationLabel,
  renderHourlyChart,
} from './render.js';
import { requestGps, loadCities, getStoredLocation, saveLocation } from './location.js';
import { CACHE_TTL_MS, ENABLED_DEFAULT } from './config.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  todayCard: $('#todayCard'),
  forecast:  $('#forecastStrip'),
  location:  $('#locationLabel'),
  changeBtn: $('#changeLocationBtn'),
  cityPicker: $('#cityPicker'),
  cityList:   $('#cityList'),
  sourcesLine: $('#sourcesLine'),
  settingsBtn: $('#settingsBtn'),
  settingsModal: $('#settingsModal'),
  sourceToggles: $('#sourceToggles'),
  targetDate: $('#targetDate'),
  todayBtn:   $('#todayBtn'),
  bestDayBtn: $('#bestDayBtn'),
  hourlySection: $('#hourlySection'),
  sparkline:     $('#sparkline'),
  rangeLabel:    $('#rangeLabel'),
  rangeBtns:     document.querySelectorAll('.range-btn'),
  climateNote:   $('#climateNote'),
  indicator:     $('#selectIndicator'),
};

const state = {
  location: null,
  enabledSources: loadEnabled(),
  allDaily: [],       // 전체(최대 16일) 일별 verdict
  daily: [],          // 표시 범위 (7/14/16)
  selectedDate: null,
  bestDate: null,
  rangeDays: loadRange(), // 7 | 14 | 16
};

main();

async function main() {
  bindEvents();
  await initLocation();
  await loadAndRender();
}

function bindEvents() {
  els.changeBtn.addEventListener('click', async () => {
    await openCityPicker();
  });
  els.settingsBtn.addEventListener('click', () => {
    renderSourceToggles();
    els.settingsModal.showModal();
    els.settingsModal.addEventListener('close', onSettingsClose, { once: true });
  });
  els.targetDate.addEventListener('change', () => {
    if (!els.targetDate.value) return;
    selectDate(els.targetDate.value);
  });
  els.todayBtn.addEventListener('click', () => {
    const today = isoLocal(new Date());
    selectDate(today);
  });
  els.bestDayBtn.addEventListener('click', () => {
    if (state.bestDate) selectDate(state.bestDate);
  });
  els.rangeBtns.forEach(b => b.addEventListener('click', () => {
    state.rangeDays = Number(b.dataset.range) || 7;
    saveRange(state.rangeDays);
    applyRange();
  }));
  // 초기 활성 버튼 표시 (저장된 값과 맞춤)
  syncRangeButtons();
}

function syncRangeButtons() {
  els.rangeBtns.forEach(b => {
    b.classList.toggle('is-active', Number(b.dataset.range) === state.rangeDays);
  });
  if (els.rangeLabel) els.rangeLabel.textContent = `${state.rangeDays}일`;
}

function onSettingsClose() {
  saveEnabled(state.enabledSources);
  loadAndRender();
}

async function initLocation() {
  const stored = getStoredLocation();
  if (stored) {
    state.location = stored;
    setLocationLabel(els.location, stored.label);
    return;
  }
  try {
    const gps = await requestGps();
    state.location = gps;
    saveLocation(gps);
    setLocationLabel(els.location, '현재 위치 (GPS)');
  } catch (e) {
    setLocationLabel(els.location, '위치 없음 — 도시를 선택하세요');
    await openCityPicker();
  }
}

async function openCityPicker() {
  if (!els.cityList.dataset.loaded) {
    try {
      const cities = await loadCities();
      els.cityList.innerHTML = cities.map(c => `
        <li><button type="button" data-id="${c.id}" data-lat="${c.lat}" data-lon="${c.lon}" data-name="${c.name}">${c.name}</button></li>
      `).join('');
      els.cityList.dataset.loaded = '1';
      els.cityList.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-id]');
        if (!btn) return;
        const loc = {
          lat: Number(btn.dataset.lat),
          lon: Number(btn.dataset.lon),
          label: btn.dataset.name,
          source: 'manual',
        };
        state.location = loc;
        saveLocation(loc);
        setLocationLabel(els.location, loc.label);
        els.cityPicker.close();
        loadAndRender();
      });
    } catch (e) {
      els.cityList.innerHTML = `<li class="muted">도시 목록 로드 실패</li>`;
    }
  }
  els.cityPicker.showModal();
}

async function loadAndRender() {
  if (!state.location) return;
  renderLoading(els.todayCard);
  els.forecast.innerHTML = '';

  const cached = readCache(state.location);
  let agg = cached;
  if (!agg) {
    try {
      agg = await aggregate({
        lat: state.location.lat,
        lon: state.location.lon,
        enabledSources: state.enabledSources,
        days: 16,
        extendDays: 30, // 항상 30일 climatology 동시 fetch (캐시되니 가벼움)
      });
      writeCache(state.location, agg);
    } catch (e) {
      renderError(els.todayCard, e.message || '데이터를 가져올 수 없습니다.', () => loadAndRender());
      return;
    }
  }

  // 일별 verdict 계산
  const daily = agg.weather.map((w, i) => {
    const air = agg.air.find(a => a.date === w.date) || null;
    const nextW = agg.weather[i + 1];
    const verdict = scoreDay(w, air, { nextDayPp: nextW?.precipitationProbability });
    return {
      date: w.date,
      verdict,
      weather: w,
      air,
      confidence: w.confidence || (i < (agg.forecastDays || 16) ? 'high' : 'low'),
    };
  });

  if (daily.length === 0) {
    renderError(els.todayCard, '예보 데이터가 비어 있습니다.', () => loadAndRender());
    return;
  }

  state.allDaily = daily; // 전체 보존
  state.coverage = agg.coverage;
  state.sources  = agg.sources;
  applyRange();
  renderSources(els.sourcesLine, agg.sources);
}

function applyRange() {
  if (!state.allDaily?.length) return;
  state.daily = state.allDaily.slice(0, state.rangeDays);
  // 점수 최고일은 표시 범위 내에서 결정
  state.bestDate = state.daily.reduce((best, d) =>
    !best || d.verdict.score > best.verdict.score ? d : best, null
  )?.date || null;

  // 날짜 선택기 범위 = 표시 범위
  const first = state.daily[0].date;
  const last  = state.daily[state.daily.length - 1].date;
  els.targetDate.min = first;
  els.targetDate.max = last;

  // 선택일이 새 범위 밖이면 오늘 또는 첫 날로
  const today = isoLocal(new Date());
  const inRange = state.daily.some(d => d.date === state.selectedDate);
  const initial = inRange ? state.selectedDate
                : state.daily.some(d => d.date === today) ? today
                : first;
  syncRangeButtons();
  els.forecast.dataset.count = String(state.rangeDays);
  if (els.climateNote) els.climateNote.hidden = state.rangeDays !== 30;
  selectDate(initial);
}

function selectDate(date) {
  if (!state.daily.length) return;
  const found = state.daily.find(d => d.date === date) || state.daily[0];
  state.selectedDate = found.date;
  els.targetDate.value = found.date;
  renderMainCard(els.todayCard, found, state.coverage, { isBest: found.date === state.bestDate });
  renderForecast(els.forecast, state.daily, {
    selectedDate: state.selectedDate,
    bestDate: state.bestDate,
    onSelect: (d) => selectDate(d),
  });
  renderHourlyChart(els.sparkline, els.hourlySection, found.weather?.hourly);
  // 선택 인디케이터 위치 갱신 — 더블 RAF로 layout 안정 후 측정
  requestAnimationFrame(() => requestAnimationFrame(() => moveSelectIndicator()));
}

function moveSelectIndicator() {
  if (!els.indicator || !els.forecast) return;
  const target = els.forecast.querySelector(`li.forecast-day[data-date="${state.selectedDate}"]`);
  if (!target) {
    els.indicator.classList.remove('is-visible');
    return;
  }
  const wrapRect = els.forecast.parentElement.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const x = tRect.left - wrapRect.left;
  const y = tRect.top  - wrapRect.top;
  els.indicator.style.transform = `translate(${x}px, ${y}px)`;
  els.indicator.style.width  = `${tRect.width}px`;
  els.indicator.style.height = `${tRect.height}px`;
  els.indicator.classList.add('is-visible');
}

// 창 크기 변경되면 인디케이터 재배치
window.addEventListener('resize', () => moveSelectIndicator());

function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadRange() {
  try {
    const raw = localStorage.getItem('cwc.rangeDays');
    const v = Number(raw);
    return [7, 14, 16, 30].includes(v) ? v : 14;
  } catch { return 14; }
}
function saveRange(v) {
  try { localStorage.setItem('cwc.rangeDays', String(v)); } catch {}
}

function loadEnabled() {
  try {
    const raw = localStorage.getItem('cwc.enabledSources');
    if (!raw) return { ...ENABLED_DEFAULT };
    return { ...ENABLED_DEFAULT, ...JSON.parse(raw) };
  } catch { return { ...ENABLED_DEFAULT }; }
}
function saveEnabled(obj) {
  try { localStorage.setItem('cwc.enabledSources', JSON.stringify(obj)); } catch {}
}

function renderSourceToggles() {
  const ids = Object.keys(state.enabledSources);
  els.sourceToggles.innerHTML = ids.map(id => `
    <li>
      <label>
        <input type="checkbox" data-id="${id}" ${state.enabledSources[id] ? 'checked' : ''} />
        ${id}
      </label>
    </li>
  `).join('');
  els.sourceToggles.addEventListener('change', (ev) => {
    const cb = ev.target.closest('input[type="checkbox"]');
    if (!cb) return;
    state.enabledSources[cb.dataset.id] = cb.checked;
  }, { once: true });
}

function cacheKey(loc) {
  const round = (v) => Math.round(v * 100) / 100; // ~1km 정밀도
  return `cwc.cache.${round(loc.lat)},${round(loc.lon)}`;
}
function readCache(loc) {
  try {
    const raw = localStorage.getItem(cacheKey(loc));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.t > CACHE_TTL_MS) return null;
    return obj.v;
  } catch { return null; }
}
function writeCache(loc, value) {
  try { localStorage.setItem(cacheKey(loc), JSON.stringify({ t: Date.now(), v: value })); } catch {}
}
