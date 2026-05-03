// Open-Meteo Archive API (과거 30년 기후 평균) - 17~30일 참고치 생성용.
// 키 없음. ECMWF 재분석 데이터 기반 같은 날짜 과거 평균.
// 정확한 일별 예보가 아니므로 confidence: 'low' 표시.

import { httpJson, toIsoDate } from './_base.js';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

export async function fetchClimatology({ lat, lon, fromDate, toDate, sampleYears = 5 }) {
  // 같은 월/일 기준으로 최근 sampleYears 년의 평균을 산출
  const out = [];
  const dates = [];
  let cur = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  while (cur <= end) {
    dates.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  if (dates.length === 0) return { meta: { source: 'open-meteo-climate', kind: 'weather' }, days: [] };

  const thisYear = new Date().getFullYear();
  const yearOffsets = [];
  for (let i = 1; i <= sampleYears; i++) yearOffsets.push(thisYear - i);

  // 각 연도별 archive 호출 (날짜 범위가 같음)
  const results = await Promise.allSettled(yearOffsets.map(year => {
    const start = `${year}-${dates[0].slice(5)}`;
    const finish = `${year}-${dates[dates.length - 1].slice(5)}`;
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      timezone: 'auto',
      start_date: start,
      end_date: finish,
      daily: [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'wind_speed_10m_max',
        'relative_humidity_2m_mean',
      ].join(','),
    });
    return httpJson(`${ARCHIVE}?${params.toString()}`);
  }));

  const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  if (successful.length === 0) {
    return { meta: { source: 'open-meteo-climate', kind: 'weather' }, days: [] };
  }

  // 각 날짜마다 sampleYears 평균
  for (let i = 0; i < dates.length; i++) {
    const tMin = []; const tMax = []; const precip = []; const wind = []; const hum = [];
    let rainCount = 0, total = 0;
    for (const data of successful) {
      const d = data.daily;
      if (!d || !d.time) continue;
      const v = (arr) => Number.isFinite(arr?.[i]) ? arr[i] : null;
      pushIf(tMin,  v(d.temperature_2m_min));
      pushIf(tMax,  v(d.temperature_2m_max));
      pushIf(wind,  v(d.wind_speed_10m_max));
      pushIf(hum,   v(d.relative_humidity_2m_mean));
      const p = v(d.precipitation_sum);
      if (Number.isFinite(p)) {
        precip.push(p);
        if (p >= 1) rainCount++;
        total++;
      }
    }
    // 강수 "확률"은 과거 N년 중 비 온 비율로 근사
    const precipProb = total > 0 ? Math.round((rainCount / total) * 100) : null;
    out.push({
      date: dates[i],
      source: 'open-meteo-climate',
      confidence: 'low',
      precipitationProbability: precipProb,
      precipitationAmountMm: avg(precip),
      tempMin: avg(tMin),
      tempMax: avg(tMax),
      humidityAvg: avg(hum),
      windSpeedMax: avg(wind),
    });
  }

  return { meta: { source: 'open-meteo-climate', kind: 'weather' }, days: out };
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function pushIf(arr, v) { if (Number.isFinite(v)) arr.push(v); }
