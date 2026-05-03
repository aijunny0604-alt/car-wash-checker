// MET Norway (Yr.no) Locationforecast 2.0 — 키 없음, User-Agent 식별 헤더 필요.
// 시간별 -> 일별 집계.

import { httpJson, toIsoDate } from './_base.js';
import { APP_USER_AGENT } from '../config.js';

const ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

export async function fetchMetNorway({ lat, lon, days = 7 }) {
  const url = `${ENDPOINT}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const data = await httpJson(url, {
    headers: { 'User-Agent': APP_USER_AGENT, 'Accept': 'application/json' },
  });

  const series = data?.properties?.timeseries || [];
  const buckets = {}; // date -> {temps, hums, winds, precipProbs, precipAmts}

  for (const e of series) {
    const date = toIsoDate(e.time);
    const inst = e.data?.instant?.details || {};
    const next1 = e.data?.next_1_hours?.details || {};
    const next6 = e.data?.next_6_hours?.details || {};
    const b = (buckets[date] ||= { temps: [], hums: [], winds: [], probs: [], amts: [] });
    if (Number.isFinite(inst.air_temperature))      b.temps.push(inst.air_temperature);
    if (Number.isFinite(inst.relative_humidity))    b.hums.push(inst.relative_humidity);
    if (Number.isFinite(inst.wind_speed))           b.winds.push(inst.wind_speed);
    const prob = next1.probability_of_precipitation ?? next6.probability_of_precipitation;
    if (Number.isFinite(prob)) b.probs.push(prob);
    const amt = next1.precipitation_amount ?? next6.precipitation_amount;
    if (Number.isFinite(amt)) b.amts.push(amt);
  }

  const dates = Object.keys(buckets).sort().slice(0, days);
  const out = dates.map(date => {
    const b = buckets[date];
    return {
      date,
      source: 'met-norway',
      precipitationProbability: b.probs.length ? Math.max(...b.probs) : null,
      precipitationAmountMm: sum(b.amts),
      tempMin: b.temps.length ? Math.min(...b.temps) : null,
      tempMax: b.temps.length ? Math.max(...b.temps) : null,
      humidityAvg: avg(b.hums),
      windSpeedMax: b.winds.length ? Math.max(...b.winds) : null,
    };
  });

  return { meta: { source: 'met-norway', kind: 'weather' }, days: out };
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sum(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0);
}
