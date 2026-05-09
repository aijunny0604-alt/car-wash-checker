// 다중 어댑터 호출 + 합의(Phase B 활성화).
// Phase A 에선 Open-Meteo 1개라도 동작하면 결과 반환.

import { fetchOpenMeteo } from './adapters/openMeteo.js';
import { fetchMetNorway } from './adapters/metNorway.js';
import { fetchSevenTimer } from './adapters/sevenTimer.js';
import { fetchOpenMeteoAir } from './adapters/openMeteoAir.js';
import { fetchClimatology } from './adapters/openMeteoClimate.js';
import { weightedConsensus, anyTrue, mergeWeatherDays, mergeAirDays } from './consensus.js';
import { isKorea } from './location.js';
import { ENABLED_DEFAULT, KEYS } from './config.js';

const WEATHER_DEFS = [
  { id: 'open-meteo',   fn: fetchOpenMeteo,   weight: 1.0, needsKey: false, koOnly: false },
  { id: 'met-norway',   fn: fetchMetNorway,   weight: 1.0, needsKey: false, koOnly: false },
  { id: '7timer',       fn: fetchSevenTimer,  weight: 0.7, needsKey: false, koOnly: false },
];

const AIR_DEFS = [
  { id: 'open-meteo-aq', fn: fetchOpenMeteoAir, weight: 1.0, needsKey: false, koOnly: false },
];

export async function aggregate({ lat, lon, enabledSources = ENABLED_DEFAULT, keys = KEYS, days = 16, extendDays = 30 }) {
  const ko = isKorea(lat, lon);
  const forecastDays = Math.min(days, 16);

  const wDefs = WEATHER_DEFS.filter(d =>
    enabledSources[d.id] !== false &&
    (!d.needsKey || keys[d.id]) &&
    (!d.koOnly || ko)
  );
  const aDefs = AIR_DEFS.filter(d =>
    enabledSources[d.id] !== false &&
    (!d.needsKey || keys[d.id]) &&
    (!d.koOnly || ko)
  );

  // forecast / air 먼저 (빠름) — climatology는 별도 promise로 분리해서 백그라운드 처리
  const [wRes, aRes] = await Promise.all([
    Promise.allSettled(wDefs.map(d => d.fn({ lat, lon, days: forecastDays, key: keys[d.id] }))),
    Promise.allSettled(aDefs.map(d => d.fn({ lat, lon, days: Math.min(forecastDays, 7), key: keys[d.id] }))),
  ]);

  const weatherSets = pickFulfilled(wRes, wDefs);
  const airSets     = pickFulfilled(aRes, aDefs);

  if (weatherSets.length === 0) {
    const errs = wRes.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
    throw new Error('모든 날씨 소스 실패: ' + errs.join(' | '));
  }

  const merged = mergeWeatherDays(weatherSets);

  // climatology promise — caller가 await하면 받고, 아니면 백그라운드로 무시 가능
  let climatePromise = null;
  if (extendDays > forecastDays) {
    const today = new Date();
    const climStart = new Date(today); climStart.setDate(today.getDate() + forecastDays);
    const climEnd   = new Date(today); climEnd.setDate(today.getDate() + extendDays - 1);
    climatePromise = fetchClimatology({
      lat, lon,
      fromDate: isoLocal(climStart),
      toDate:   isoLocal(climEnd),
    }).catch(e => {
      console.warn('[climatology] failed', e);
      return { days: [] };
    });
  }

  return {
    weather: merged,
    air:     mergeAirDays(airSets),
    sources: {
      weather: weatherSets.map(s => s.id),
      air:     airSets.map(s => s.id),
    },
    coverage: {
      weather: `${weatherSets.length}/${wDefs.length}`,
      air:     `${airSets.length}/${aDefs.length}`,
    },
    isKorea: ko,
    forecastDays,
    climatePromise, // <- 비동기로 늦게 도착
  };
}

function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickFulfilled(results, defs) {
  const out = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      const v = results[i].value;
      out.push({ id: defs[i].id, weight: defs[i].weight, days: v.days });
    } else {
      // 디버깅용 콘솔, UI엔 노출 안 함
      console.warn(`[${defs[i].id}] 실패`, results[i].reason);
    }
  }
  return out;
}
