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
  // 정확 예보는 forecastDays까지 (16일), 그 이후는 climatology
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

  // climatology range: 16일 다음날부터 extendDays까지
  const today = new Date();
  const climStart = new Date(today); climStart.setDate(today.getDate() + forecastDays);
  const climEnd   = new Date(today); climEnd.setDate(today.getDate() + Math.max(forecastDays, extendDays) - 1);
  const useClimatology = extendDays > forecastDays;

  const tasks = [
    Promise.allSettled(wDefs.map(d => d.fn({ lat, lon, days: forecastDays, key: keys[d.id] }))),
    Promise.allSettled(aDefs.map(d => d.fn({ lat, lon, days: Math.min(forecastDays, 7), key: keys[d.id] }))),
  ];
  if (useClimatology) {
    tasks.push(fetchClimatology({
      lat, lon,
      fromDate: isoLocal(climStart),
      toDate:   isoLocal(climEnd),
    }).catch(e => {
      console.warn('[climatology] failed', e);
      return { days: [] };
    }));
  }
  const [wRes, aRes, climRes] = await Promise.all(tasks);

  const weatherSets = pickFulfilled(wRes, wDefs);
  const airSets     = pickFulfilled(aRes, aDefs);

  if (weatherSets.length === 0) {
    const errs = wRes.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
    throw new Error('모든 날씨 소스 실패: ' + errs.join(' | '));
  }

  // 정확 예보 기간 합의
  const merged = mergeWeatherDays(weatherSets);

  // climatology 추가 (각 날에 confidence: 'low')
  if (useClimatology && climRes?.days?.length) {
    for (const d of climRes.days) {
      merged.push({
        ...d,
        sources: ['open-meteo-climate'],
        confidence: 'low',
      });
    }
  }

  return {
    weather: merged,
    air:     mergeAirDays(airSets),
    sources: {
      weather: weatherSets.map(s => s.id).concat(useClimatology && climRes?.days?.length ? ['climate-30y'] : []),
      air:     airSets.map(s => s.id),
    },
    coverage: {
      weather: `${weatherSets.length}/${wDefs.length}`,
      air:     `${airSets.length}/${aDefs.length}`,
    },
    isKorea: ko,
    forecastDays,
    hasClimatology: useClimatology && Boolean(climRes?.days?.length),
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
