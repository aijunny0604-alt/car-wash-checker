// Open-Meteo Air Quality — 키 없음. PM10/PM2.5 시간별 -> 일별 평균.

import { httpJson, toIsoDate } from './_base.js';

const ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export async function fetchOpenMeteoAir({ lat, lon, days = 7 }) {
  // 대기질은 신뢰도 5일 정도가 한계 — 최대 7일로 제한
  const safeDays = Math.min(Math.max(days, 1), 7);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    forecast_days: String(safeDays),
    hourly: ['pm10', 'pm2_5', 'european_aqi'].join(','),
  });
  const data = await httpJson(`${ENDPOINT}?${params.toString()}`);
  const h = data.hourly || {};
  const buckets = {};
  if (h.time) {
    for (let i = 0; i < h.time.length; i++) {
      const date = toIsoDate(h.time[i]);
      const b = (buckets[date] ||= { pm10: [], pm25: [], aqi: [] });
      if (Number.isFinite(h.pm10?.[i]))           b.pm10.push(h.pm10[i]);
      if (Number.isFinite(h.pm2_5?.[i]))          b.pm25.push(h.pm2_5[i]);
      if (Number.isFinite(h.european_aqi?.[i]))   b.aqi.push(h.european_aqi[i]);
    }
  }
  const dates = Object.keys(buckets).sort().slice(0, days);
  const out = dates.map(date => {
    const b = buckets[date];
    return {
      date,
      source: 'open-meteo-aq',
      pm10: avg(b.pm10),
      pm25: avg(b.pm25),
      yellowDustWarning: false,
      aqi: avg(b.aqi),
    };
  });
  return { meta: { source: 'open-meteo-aq', kind: 'air' }, days: out };
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
