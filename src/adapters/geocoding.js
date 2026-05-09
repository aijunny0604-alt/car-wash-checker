// 주소 검색 (Geocoding) — 키 없이 동작
// 1순위: Open-Meteo Geocoding (글로벌, 한국 동/구 일부 지원)
// 폴백: Nominatim (OpenStreetMap, 한글 동/구 지원, rate limit 1초 1회)

import { httpJson } from './_base.js';
import { APP_USER_AGENT } from '../config.js';

const OPEN_METEO_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// 결과 형태:
// { name: string, region: string, lat: number, lon: number, source: 'open-meteo' | 'nominatim' }

export async function searchPlaces(query, { limit = 8 } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  // 두 소스 병렬 호출, 어느 쪽이든 결과 있으면 합쳐서 반환
  const [omRes, nomRes] = await Promise.allSettled([
    searchOpenMeteo(q, limit),
    searchNominatim(q, limit),
  ]);

  const results = [];
  if (omRes.status === 'fulfilled') results.push(...omRes.value);
  if (nomRes.status === 'fulfilled') results.push(...nomRes.value);

  // 중복 제거 (lat/lon 0.01도 이내면 같은 곳으로)
  const seen = new Set();
  const dedup = [];
  for (const r of results) {
    const key = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
  }

  return dedup.slice(0, limit);
}

async function searchOpenMeteo(query, limit) {
  const params = new URLSearchParams({
    name: query,
    count: String(limit),
    language: 'ko',
    format: 'json',
  });
  const data = await httpJson(`${OPEN_METEO_GEO}?${params}`);
  const items = data?.results || [];
  return items.map(it => ({
    name:   it.name || '',
    region: [it.admin1, it.admin2, it.admin3].filter(Boolean).join(' ') || it.country || '',
    lat:    it.latitude,
    lon:    it.longitude,
    source: 'open-meteo',
    country: it.country_code || '',
  })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

async function searchNominatim(query, limit) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    'accept-language': 'ko',
    limit: String(limit),
    countrycodes: 'kr,us,jp,cn,gb,fr,de,it,es,au', // 주요 국가 한정
    addressdetails: '1',
  });
  // Nominatim은 User-Agent 필수
  const data = await httpJson(`${NOMINATIM}?${params}`, {
    headers: { 'User-Agent': APP_USER_AGENT, 'Accept': 'application/json' },
  });
  const items = Array.isArray(data) ? data : [];
  return items.map(it => {
    const addr = it.address || {};
    // 동/리/읍 등 가장 작은 단위 우선
    const localName = addr.suburb || addr.neighbourhood || addr.quarter
                    || addr.village || addr.town || addr.city_district
                    || addr.city || it.name || '';
    const region = [
      addr.country,
      addr.state || addr.province,
      addr.city || addr.county,
    ].filter(Boolean).join(' ');
    return {
      name: localName || it.display_name?.split(',')[0] || '',
      region: region || it.display_name || '',
      lat: Number(it.lat),
      lon: Number(it.lon),
      source: 'nominatim',
      country: (addr.country_code || '').toUpperCase(),
    };
  }).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.name);
}
