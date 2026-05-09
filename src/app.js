// 부트스트랩 + 상태 머신 (간이).

import { aggregate } from './aggregator.js';
import { scoreDay } from './scoring.js';
import { searchPlaces } from './adapters/geocoding.js';
import { searchCarWashes, searchByKeyword, classifyCarWash } from './adapters/kakaoLocal.js';
import { KEYS } from './config.js';
import {
  renderMainCard, renderForecast, renderSources, renderError, renderLoading, setLocationLabel,
  renderHourlyChart, renderAirSection,
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
  airSection:        $('#airSection'),
  airOverallBadge:   $('#airOverallBadge'),
  airPm10:           $('#airPm10'),
  airPm25:           $('#airPm25'),
  airExtra:          $('#airExtra'),
  rangeLabel:    $('#rangeLabel'),
  rangeBtns:     document.querySelectorAll('.range-btn'),
  climateNote:   $('#climateNote'),
  indicator:     $('#selectIndicator'),
  // 세차장 섹션
  carwashSection: $('#carwashSection'),
  carwashList:    $('#carwashList'),
  carwashCount:   $('#carwashCount'),
  carwashNote:    $('#carwashNote'),
  carwashSearch:  $('#carwashSearch'),
  carwashClearBtn: $('#carwashClearBtn'),
  // 검색 UI
  placeSearch:        $('#placeSearch'),
  searchHint:         $('#searchHint'),
  searchResults:      $('#searchResults'),
  searchResultsBlock: $('#searchResultsBlock'),
  recentList:         $('#recentList'),
  recentBlock:        $('#recentBlock'),
  favoritesList:      $('#favoritesList'),
  favoritesBlock:     $('#favoritesBlock'),
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
  // 세차장 검색 입력 바인딩 (한 번만)
  bindCarwashSearch();
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
  // 1) 주요 도시 (presets) — 드릴다운 가능 (도시 → 구)
  if (!els.cityList.dataset.loaded) {
    try {
      const [cities, districts] = await Promise.all([
        loadCities(),
        loadDistricts(),
      ]);
      state.allCities = cities;
      state.allDistricts = districts;
      renderCityPresets();
      els.cityList.dataset.loaded = '1';
      // 도시/구 클릭 위임 핸들러 (드릴다운 + 선택)
      els.cityList.addEventListener('click', (ev) => {
        // 동 드릴다운
        const dongBtn = ev.target.closest('button[data-drill-dong]');
        if (dongBtn) {
          ev.preventDefault();
          renderDongList({
            districtName: dongBtn.dataset.drillDong,
            cityId: dongBtn.dataset.cityId,
            cityName: dongBtn.dataset.cityName,
            lat: Number(dongBtn.dataset.lat),
            lon: Number(dongBtn.dataset.lon),
          });
          return;
        }
        const drillBtn = ev.target.closest('button[data-drill]');
        if (drillBtn) {
          ev.preventDefault();
          const target = drillBtn.dataset.drill;
          if (target === 'back') {
            renderCityPresets();
          } else {
            renderDistrictList(target);
          }
          return;
        }
        const btn = ev.target.closest('button[data-lat]');
        if (!btn) return;
        pickPlace({
          lat: Number(btn.dataset.lat),
          lon: Number(btn.dataset.lon),
          label: btn.dataset.name,
          region: btn.dataset.region || '',
        });
      });
    } catch (e) {
      els.cityList.innerHTML = `<li class="muted">도시 목록 로드 실패</li>`;
    }
  }

  // 2) 검색 입력 - debounce 한 번만 바인딩
  if (!els.placeSearch.dataset.bound) {
    let searchTimer = null;
    els.placeSearch.addEventListener('input', (ev) => {
      const q = ev.target.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (q.length < 2) {
        els.searchResultsBlock.hidden = true;
        els.searchHint.textContent = '2글자 이상 입력하세요';
        return;
      }
      els.searchHint.textContent = '';
      els.searchResultsBlock.hidden = false;
      els.searchResults.innerHTML = `<li class="search-loading">검색 중…</li>`;
      searchTimer = setTimeout(async () => {
        try {
          const results = await searchPlaces(q, { limit: 10 });
          if (results.length === 0) {
            els.searchResults.innerHTML = `<li class="search-empty">결과 없음 — 다른 검색어를 시도해 보세요</li>`;
          } else {
            els.searchResults.innerHTML = results.map(r => placeItemHtml(r)).join('');
          }
        } catch (err) {
          els.searchResults.innerHTML = `<li class="search-empty">검색 실패: ${escapeHtml(err.message || '오류')}</li>`;
        }
      }, 320);
    });
    // 검색 결과/즐겨찾기/최근 클릭 위임
    els.searchResults.addEventListener('click', onPlaceListClick);
    els.recentList.addEventListener('click', onPlaceListClick);
    els.favoritesList.addEventListener('click', onPlaceListClick);
    els.placeSearch.dataset.bound = '1';
  }

  // 3) 즐겨찾기/최근 다시 그리기
  renderFavorites();
  renderRecents();
  // 검색 입력 초기화
  els.placeSearch.value = '';
  els.searchResultsBlock.hidden = true;
  els.searchHint.textContent = '2글자 이상 입력하세요';

  els.cityPicker.showModal();
  // 모달 떴을 때 입력창에 자동 포커스
  setTimeout(() => els.placeSearch.focus(), 50);
}

function onPlaceListClick(ev) {
  const btn = ev.target.closest('button[data-lat]');
  if (!btn) return;
  // 즐겨찾기 별 버튼이면 토글
  if (ev.target.closest('.place-fav-btn')) {
    ev.preventDefault();
    ev.stopPropagation();
    toggleFavorite({
      lat:   Number(btn.dataset.lat),
      lon:   Number(btn.dataset.lon),
      label: btn.dataset.name,
      region: btn.dataset.region || '',
    });
    return;
  }
  pickPlace({
    lat:   Number(btn.dataset.lat),
    lon:   Number(btn.dataset.lon),
    label: btn.dataset.name,
    region: btn.dataset.region || '',
  });
}

// ───── 도시 → 구 드릴다운 ─────
async function loadDistricts() {
  try {
    const res = await fetch('./data/districts.json');
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

function renderCityPresets() {
  const cities = state.allCities || [];
  const districts = state.allDistricts || {};
  els.cityList.dataset.mode = 'cities';
  els.cityList.innerHTML = cities.map(c => {
    const hasDistricts = districts[c.id] && districts[c.id].districts?.length > 0;
    if (hasDistricts) {
      return `
        <li class="city-with-drill">
          <button type="button"
              data-lat="${c.lat}" data-lon="${c.lon}" data-name="${escapeAttr(c.name)}">
            <span class="place-name">${escapeHtml(c.name)}</span>
          </button>
          <button type="button" class="city-drill-btn" data-drill="${c.id}" aria-label="${escapeAttr(c.name)} 하위 지역">▸</button>
        </li>
      `;
    }
    return `
      <li><button type="button"
          data-lat="${c.lat}" data-lon="${c.lon}" data-name="${escapeAttr(c.name)}">
        <span class="place-name">${escapeHtml(c.name)}</span>
      </button></li>
    `;
  }).join('');
}

function renderDistrictList(cityId) {
  const districts = state.allDistricts || {};
  const data = districts[cityId];
  if (!data) {
    renderCityPresets();
    return;
  }
  els.cityList.dataset.mode = 'districts';
  state.currentCityId = cityId;
  els.cityList.innerHTML = `
    <li class="district-back-row">
      <button type="button" class="district-back-btn" data-drill="back">◂ 주요 도시로</button>
    </li>
    <li class="district-header">
      <button type="button"
          data-lat="${getCityLat(cityId)}" data-lon="${getCityLon(cityId)}"
          data-name="${escapeAttr(data.name)}">
        <span class="place-name">📍 ${escapeHtml(data.name)} 전체</span>
      </button>
    </li>
    ${data.districts.map(d => `
      <li class="district-with-drill">
        <button type="button"
            data-lat="${d.lat}" data-lon="${d.lon}"
            data-name="${escapeAttr(d.name)}"
            data-region="${escapeAttr(data.name)}">
          <span class="place-name">${escapeHtml(d.name)}</span>
          <span class="place-region">${escapeHtml(data.name)}</span>
        </button>
        <button type="button" class="city-drill-btn"
                data-drill-dong="${escapeAttr(d.name)}"
                data-city-id="${escapeAttr(cityId)}"
                data-city-name="${escapeAttr(data.name)}"
                data-lat="${d.lat}" data-lon="${d.lon}"
                aria-label="${escapeAttr(d.name)} 동 보기">▸ 동</button>
      </li>
    `).join('')}
  `;
}

// 동 단위 드릴다운 — 카카오 주소 검색 API로 실시간 조회
async function renderDongList(opts) {
  const { districtName, cityId, cityName, lat, lon } = opts;
  els.cityList.dataset.mode = 'dongs';
  els.cityList.innerHTML = `<li class="search-loading">${escapeHtml(districtName)} 동 목록 불러오는 중…</li>`;

  if (!KEYS.kakao) {
    els.cityList.innerHTML = `
      <li class="district-back-row">
        <button type="button" class="district-back-btn" data-drill="${escapeAttr(cityId)}">◂ ${escapeHtml(cityName)} 구로</button>
      </li>
      <li class="search-empty">동 단위 검색은 카카오 키가 필요합니다</li>
    `;
    return;
  }

  try {
    // 카카오 주소 API: "서울 강남구" → 동 목록
    const query = `${cityName} ${districtName}`;
    const params = new URLSearchParams({ query, size: '15' });
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?${params}`, {
      headers: { 'Authorization': `KakaoAK ${KEYS.kakao}` },
    });
    const data = await res.json();
    const docs = data.documents || [];
    // 행정동만 필터
    const dongs = [];
    const seen = new Set();
    for (const d of docs) {
      const region = d.address;
      if (!region) continue;
      const dongName = region.region_3depth_name; // 동 이름
      if (!dongName) continue;
      const k = dongName;
      if (seen.has(k)) continue;
      seen.add(k);
      dongs.push({
        name: dongName,
        full: `${region.region_1depth_name} ${region.region_2depth_name} ${dongName}`,
        lat: Number(d.y),
        lon: Number(d.x),
      });
    }

    if (dongs.length === 0) {
      // 동 데이터 없음 — 키워드 검색으로 폴백
      const kRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?` + new URLSearchParams({
        query: `${districtName} 동`,
        x: String(lon), y: String(lat), radius: '5000', sort: 'distance', size: '15',
      }), {
        headers: { 'Authorization': `KakaoAK ${KEYS.kakao}` },
      });
      const kData = await kRes.json();
      const seenK = new Set();
      for (const it of (kData.documents || [])) {
        const m = (it.address_name || '').match(/([가-힣]+동)/);
        if (m && !seenK.has(m[1])) {
          seenK.add(m[1]);
          dongs.push({ name: m[1], full: it.address_name, lat: Number(it.y), lon: Number(it.x) });
        }
      }
    }

    if (dongs.length === 0) {
      els.cityList.innerHTML = `
        <li class="district-back-row">
          <button type="button" class="district-back-btn" data-drill="${escapeAttr(cityId)}">◂ ${escapeHtml(cityName)} 구로</button>
        </li>
        <li class="search-empty">${escapeHtml(districtName)}의 동 데이터를 찾지 못했어요</li>
      `;
      return;
    }

    // 가나다순
    dongs.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    els.cityList.innerHTML = `
      <li class="district-back-row">
        <button type="button" class="district-back-btn" data-drill="${escapeAttr(cityId)}">◂ ${escapeHtml(cityName)} 구로</button>
      </li>
      <li class="district-header">
        <button type="button"
            data-lat="${lat}" data-lon="${lon}"
            data-name="${escapeAttr(districtName)}"
            data-region="${escapeAttr(cityName)}">
          <span class="place-name">📍 ${escapeHtml(districtName)} 전체</span>
        </button>
      </li>
      ${dongs.map(d => `
        <li><button type="button"
            data-lat="${d.lat}" data-lon="${d.lon}"
            data-name="${escapeAttr(d.name)}"
            data-region="${escapeAttr(cityName + ' ' + districtName)}">
          <span class="place-name">${escapeHtml(d.name)}</span>
          <span class="place-region">${escapeHtml(cityName + ' ' + districtName)}</span>
        </button></li>
      `).join('')}
    `;
  } catch (e) {
    console.warn('[dongs] 실패', e);
    els.cityList.innerHTML = `
      <li class="district-back-row">
        <button type="button" class="district-back-btn" data-drill="${escapeAttr(cityId)}">◂ ${escapeHtml(cityName)} 구로</button>
      </li>
      <li class="search-empty">동 검색 실패: ${escapeHtml(e.message || '오류')}</li>
    `;
  }
}

function getCityLat(id) {
  return (state.allCities || []).find(c => c.id === id)?.lat || 0;
}
function getCityLon(id) {
  return (state.allCities || []).find(c => c.id === id)?.lon || 0;
}

function pickPlace(loc) {
  state.location = { ...loc, source: 'manual' };
  saveLocation(state.location);
  const labelText = loc.label || loc.name || '선택한 위치';
  setLocationLabel(els.location, loc.region ? `${labelText} · ${loc.region}` : labelText);
  // name과 label 둘 다 저장 — 어느 키로 호출해도 표시되도록
  addRecent({
    name: labelText,
    label: labelText,
    region: loc.region || '',
    lat: loc.lat,
    lon: loc.lon,
  });
  els.cityPicker.close();
  loadAndRender();
}

function placeItemHtml(r) {
  const fav = isFavorite(r) ? 'is-fav' : '';
  const star = isFavorite(r) ? '⭐' : '☆';
  // 옛 저장 데이터엔 name이 없을 수 있음 → label / region 폴백
  const displayName = r.name || r.label || (r.region ? r.region.split(' ').pop() : '저장된 위치');
  const region = r.region || '';
  return `
    <li>
      <button type="button"
          data-lat="${r.lat}" data-lon="${r.lon}"
          data-name="${escapeAttr(displayName)}" data-region="${escapeAttr(region)}">
        <span>
          <span class="place-name">${escapeHtml(displayName)}</span>
          <span class="place-region">${escapeHtml(region)}</span>
        </span>
        <span class="place-fav-btn ${fav}" title="즐겨찾기">${star}</span>
      </button>
    </li>
  `;
}

// ───── 즐겨찾기 ─────
function loadFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem('cwc.favorites') || '[]');
    return list.map(r => ({
      ...r,
      name: r.name || r.label || (r.region ? r.region.split(' ').pop() : '즐겨찾기'),
    }));
  } catch { return []; }
}
function saveFavorites(list) {
  try { localStorage.setItem('cwc.favorites', JSON.stringify(list.slice(0, 10))); } catch {}
}
function favKey(loc) {
  return `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
}
function isFavorite(loc) {
  return loadFavorites().some(f => favKey(f) === favKey(loc));
}
function toggleFavorite(loc) {
  const list = loadFavorites();
  const k = favKey(loc);
  const idx = list.findIndex(f => favKey(f) === k);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(loc);
  saveFavorites(list);
  renderFavorites();
}
function renderFavorites() {
  const favs = loadFavorites();
  els.favoritesBlock.hidden = favs.length === 0;
  if (!favs.length) return;
  els.favoritesList.innerHTML = favs.map(f => placeItemHtml({ ...f, region: f.region || '' })).join('');
}

// ───── 최근 검색 ─────
function loadRecents() {
  try {
    const list = JSON.parse(localStorage.getItem('cwc.recents') || '[]');
    // 옛 데이터 마이그레이션 — name 누락 항목에 폴백 채움
    return list.map(r => ({
      ...r,
      name: r.name || r.label || (r.region ? r.region.split(' ').pop() : '저장된 위치'),
    }));
  } catch { return []; }
}
function saveRecents(list) {
  try { localStorage.setItem('cwc.recents', JSON.stringify(list.slice(0, 8))); } catch {}
}
function addRecent(loc) {
  const list = loadRecents();
  const k = favKey(loc);
  const filtered = list.filter(r => favKey(r) !== k);
  filtered.unshift(loc);
  saveRecents(filtered);
}
function renderRecents() {
  const list = loadRecents();
  els.recentBlock.hidden = list.length === 0;
  if (!list.length) return;
  els.recentList.innerHTML = list.map(r => placeItemHtml({ ...r, region: r.region || '' })).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ───── 주변 세차장 검색 ─────
// ───── 주변 세차장 (반경 20km, 거리순) ─────
const CARWASH_RADIUS = 20000; // 카카오 API 최대 (20km)

async function loadCarWashes(token) {
  if (!els.carwashSection) return;
  if (!KEYS.kakao) { els.carwashSection.hidden = true; return; }
  if (!state.location) return;

  els.carwashSection.hidden = false;
  els.carwashList.innerHTML = `<li class="carwash-loading">주변 세차장 찾는 중…</li>`;
  els.carwashCount.textContent = '';
  els.carwashNote.hidden = true;

  try {
    const items = await searchCarWashes({
      lat: state.location.lat,
      lon: state.location.lon,
      radius: CARWASH_RADIUS,
    });
    if (token !== state.loadToken) return;
    state.carwashAll = items; // 검색 필터링용 캐시
    renderCarWashes(items, { mode: 'nearby' });
  } catch (e) {
    if (token !== state.loadToken) return;
    console.warn('[carwash] 실패', e);
    els.carwashList.innerHTML = `<li class="carwash-empty">세차장 정보를 가져올 수 없습니다</li>`;
    els.carwashNote.hidden = false;
    els.carwashNote.textContent = `오류: ${e.message || '카카오 API 호출 실패'}`;
  }
}

// 검색어로 카카오에 직접 키워드 + 위치 검색
async function searchCarWashesByKeyword(keyword) {
  if (!KEYS.kakao || !state.location) return;
  if (!keyword || keyword.trim().length < 1) {
    // 빈 검색 → 주변 세차장으로 복귀
    if (state.carwashAll) renderCarWashes(state.carwashAll, { mode: 'nearby' });
    return;
  }
  els.carwashList.innerHTML = `<li class="carwash-loading">"${escapeHtml(keyword)}" 검색 중…</li>`;
  els.carwashCount.textContent = '';
  try {
    const items = await searchByKeyword({
      query: keyword + ' 세차장',
      lat: state.location.lat,
      lon: state.location.lon,
      radius: CARWASH_RADIUS,
      sort: 'distance',
      size: 15,
    });
    // 거리순으로 한 번 더 명시 정렬
    items.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    renderCarWashes(items, { mode: 'search', keyword });
  } catch (e) {
    console.warn('[carwash search] 실패', e);
    els.carwashList.innerHTML = `<li class="carwash-empty">검색 실패: ${escapeHtml(e.message || '오류')}</li>`;
  }
}

function renderCarWashes(items, opts = {}) {
  const { mode = 'nearby', keyword = '' } = opts;
  // 거리순으로 정렬 (이미 정렬돼 있더라도 안전하게 한 번 더)
  const sorted = [...(items || [])].sort((a, b) => (a.distance || 0) - (b.distance || 0));

  if (!sorted.length) {
    if (mode === 'search') {
      els.carwashList.innerHTML = `<li class="carwash-empty">"${escapeHtml(keyword)}" 결과가 없어요. 다른 검색어를 시도해 보세요 🔎</li>`;
    } else {
      els.carwashList.innerHTML = `<li class="carwash-empty">반경 ${CARWASH_RADIUS/1000}km 안에 세차장이 없어요 🥺</li>`;
    }
    els.carwashCount.textContent = '';
    return;
  }

  // 카운트 라벨
  if (mode === 'search') {
    els.carwashCount.textContent = `검색 "${keyword}" · ${sorted.length}곳`;
  } else {
    els.carwashCount.textContent = `반경 ${CARWASH_RADIUS/1000}km · ${sorted.length}곳`;
  }

  els.carwashList.innerHTML = sorted.slice(0, 15).map(item => {
    const kind = classifyCarWash(item.name);
    const tag = kind === 'self' ? '<span class="carwash-item-tag tag-self">셀프</span>'
              : kind === 'auto' ? '<span class="carwash-item-tag tag-auto">자동</span>'
              : '<span class="carwash-item-tag">일반</span>';
    const distance = Number.isFinite(item.distance) && item.distance > 0
      ? (item.distance >= 1000 ? `${(item.distance / 1000).toFixed(1)}km` : `${Math.round(item.distance)}m`)
      : '거리 미표시';
    const phone = item.phone ? `<span class="carwash-item-phone">☎ ${escapeHtml(item.phone)}</span>` : '';
    const url = item.placeUrl || `https://map.kakao.com/link/map/${encodeURIComponent(item.name)},${item.lat},${item.lon}`;
    return `
      <li>
        <a class="carwash-item" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
          <div class="carwash-item-head">
            <span class="carwash-item-icon" aria-hidden="true">🚿</span>
            <span class="carwash-item-name">${escapeHtml(item.name)}</span>
            <span class="carwash-item-distance">📍 ${distance}</span>
          </div>
          <div class="carwash-item-address">${escapeHtml(item.roadAddress || item.address)}</div>
          <div class="carwash-item-meta">
            ${tag}
            ${phone}
          </div>
        </a>
      </li>
    `;
  }).join('');
}

// 검색 입력 바인딩 — 실시간 자동완성 (입력 즉시 검색)
function bindCarwashSearch() {
  if (!els.carwashSearch || els.carwashSearch.dataset.bound) return;
  let timer = null;
  let lastQuery = '';
  els.carwashSearch.addEventListener('input', (ev) => {
    const q = ev.target.value;
    els.carwashClearBtn.hidden = !q;
    if (timer) clearTimeout(timer);
    // 빈 검색은 즉시 (주변 세차장 복귀)
    if (!q.trim()) {
      lastQuery = '';
      searchCarWashesByKeyword('');
      return;
    }
    // 같은 검색어 중복 호출 방지
    if (q.trim() === lastQuery) return;
    // 짧은 debounce (150ms) — 타이핑 빠르게 해도 실시간 느낌
    timer = setTimeout(() => {
      lastQuery = q.trim();
      searchCarWashesByKeyword(q);
    }, 150);
  });
  els.carwashClearBtn.addEventListener('click', () => {
    els.carwashSearch.value = '';
    els.carwashClearBtn.hidden = true;
    lastQuery = '';
    searchCarWashesByKeyword('');
    els.carwashSearch.focus();
  });
  // ESC로 클리어
  els.carwashSearch.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && els.carwashSearch.value) {
      els.carwashSearch.value = '';
      els.carwashClearBtn.hidden = true;
      lastQuery = '';
      searchCarWashesByKeyword('');
    }
  });
  els.carwashSearch.dataset.bound = '1';
}

async function loadAndRender() {
  if (!state.location) return;
  // 매 호출마다 토큰 발급 — 도시 변경 race 방지 (stale climatePromise 무시용)
  const token = (state.loadToken = (state.loadToken || 0) + 1);
  renderLoading(els.todayCard);
  els.forecast.innerHTML = '';
  els.forecast.dataset.dataKey = '';
  els.forecast.dataset.dateKey = '';
  if (els.indicator) els.indicator.classList.remove('is-visible');
  state.selectedDate = null;

  const cached = readCache(state.location);
  let agg = cached;
  if (!agg) {
    try {
      agg = await aggregate({
        lat: state.location.lat,
        lon: state.location.lon,
        enabledSources: state.enabledSources,
        days: 16,
        extendDays: 30,
      });
      // forecast만 캐시 (climatePromise는 직렬화 불가, 도착 후 별도 캐시)
      writeCache(state.location, { ...agg, climatePromise: undefined });
    } catch (e) {
      renderError(els.todayCard, e.message || '데이터를 가져올 수 없습니다.', () => loadAndRender());
      return;
    }
  }

  // 일별 verdict 계산 — forecast 부분만 우선 렌더
  const buildDaily = (weatherList) => weatherList.map((w, i) => {
    const air = agg.air.find(a => a.date === w.date) || null;
    const nextW = weatherList[i + 1];
    const verdict = scoreDay(w, air, {
      nextDayPp:  nextW?.precipitationProbability,
      nextDayAmt: nextW?.precipitationAmountMm,
    });
    return {
      date: w.date,
      verdict,
      weather: w,
      air,
      confidence: w.confidence || (i < (agg.forecastDays || 16) ? 'high' : 'low'),
    };
  });
  const daily = buildDaily(agg.weather);

  if (daily.length === 0) {
    renderError(els.todayCard, '예보 데이터가 비어 있습니다.', () => loadAndRender());
    return;
  }

  state.allDaily = daily; // 우선 forecast만
  state.coverage = agg.coverage;
  state.sources  = agg.sources;
  applyRange();
  renderSources(els.sourcesLine, agg.sources);

  // 주변 세차장 (카카오 키 있을 때만, 백그라운드)
  loadCarWashes(token);

  // climatology 백그라운드 도착 시 추가 카드 채우기 (토큰 검증으로 stale 방지)
  if (agg.climatePromise) {
    agg.climatePromise.then(climRes => {
      // 도시가 바뀌었으면 옛 도시의 climate 데이터 무시
      if (token !== state.loadToken) return;
      if (!climRes?.days?.length) return;
      const climWeather = climRes.days.map(d => ({ ...d, sources: ['open-meteo-climate'], confidence: 'low' }));
      const merged = [...agg.weather, ...climWeather];
      // 중복 날짜 제거 (forecast가 이미 있는 날짜는 스킵)
      const seen = new Set(agg.weather.map(w => w.date));
      const finalWeather = [...agg.weather, ...climWeather.filter(w => !seen.has(w.date))];
      // 새 daily 빌드 + 캐시에도 저장 (extended)
      const updatedAgg = { ...agg, weather: finalWeather };
      const updatedDaily = updatedAgg.weather.map((w, i) => {
        const air = updatedAgg.air.find(a => a.date === w.date) || null;
        const nextW = updatedAgg.weather[i + 1];
        const verdict = scoreDay(w, air, { nextDayPp: nextW?.precipitationProbability });
        return { date: w.date, verdict, weather: w, air, confidence: w.confidence || 'high' };
      });
      state.allDaily = updatedDaily;
      writeCache(state.location, { ...updatedAgg, climatePromise: undefined });
      // 현재 30일 보기 중이면 즉시 재렌더
      if (state.rangeDays >= 17) applyRange();
    });
  }
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
  renderAirSection(els.airSection, {
    badge:    els.airOverallBadge,
    pm10Card: els.airPm10,
    pm25Card: els.airPm25,
    extra:    els.airExtra,
  }, found.air);
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
  // 한 번만 등록 (모달 여러 번 열어도 누적 X). once 제거 → 여러 토글 가능
  if (!els.sourceToggles.dataset.bound) {
    els.sourceToggles.addEventListener('change', (ev) => {
      const cb = ev.target.closest('input[type="checkbox"]');
      if (!cb) return;
      state.enabledSources[cb.dataset.id] = cb.checked;
    });
    els.sourceToggles.dataset.bound = '1';
  }
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
