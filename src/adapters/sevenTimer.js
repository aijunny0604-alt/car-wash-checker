// 7Timer! civillight (8일치 일별) — 키 없음, 폴백.
// 강수확률 직접 제공이 없어 weather 코드와 강수타입에서 근사 추정.

import { httpJson } from './_base.js';

const ENDPOINT = 'https://www.7timer.info/bin/api.pl';

const RAIN_BY_WEATHER = {
  // 7Timer 'weather' 키워드를 강수확률 근사값(%)으로 매핑
  'clear':        5,
  'pcloudy':      10,
  'mcloudy':      20,
  'cloudy':       30,
  'humid':        20,
  'lightrain':    70,
  'oshower':      55,
  'ishower':      55,
  'lightsnow':    70,
  'rain':         85,
  'snow':         85,
  'rainsnow':     85,
  'ts':           70,
  'tsrain':       85,
};

export async function fetchSevenTimer({ lat, lon, days = 7 }) {
  const url = `${ENDPOINT}?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&product=civillight&output=json`;
  const data = await httpJson(url);
  const init = String(data?.init || ''); // YYYYMMDDHH
  const baseY = Number(init.slice(0, 4));
  const baseM = Number(init.slice(4, 6)) - 1;
  const baseD = Number(init.slice(6, 8));
  const baseDate = new Date(Date.UTC(baseY, baseM, baseD));

  const series = data?.dataseries || [];
  const out = series.slice(0, days).map((row, idx) => {
    const dt = new Date(baseDate);
    dt.setUTCDate(baseDate.getUTCDate() + (row.date ? 0 : idx));
    // 7Timer 'date' 가 YYYYMMDD 정수로 옴
    const ymd = String(row.date || '');
    const date = ymd.length === 8
      ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
      : isoUtc(dt);
    const w = String(row.weather || '').toLowerCase();
    const probKey = Object.keys(RAIN_BY_WEATHER).find(k => w.includes(k));
    const pp = probKey ? RAIN_BY_WEATHER[probKey] : null;
    return {
      date,
      source: '7timer',
      precipitationProbability: pp,
      precipitationAmountMm: null,
      tempMin: numOrNull(row.temp2m?.min),
      tempMax: numOrNull(row.temp2m?.max),
      humidityAvg: null,
      windSpeedMax: null,
    };
  });

  return { meta: { source: '7timer', kind: 'weather' }, days: out };
}

function numOrNull(v) { return Number.isFinite(v) ? v : null; }

function isoUtc(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
