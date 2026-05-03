// Open-Meteo: 키 없음, 무제한(비상업).
// 시간별 -> 일별로 집계 (강수확률 max, 강수량 합, 기온 min/max, 습도 평균, 풍속 max).

import { httpJson, toIsoDate } from './_base.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export async function fetchOpenMeteo({ lat, lon, days = 16 }) {
  // Open-Meteo는 최대 16일까지 무료 (forecast_days)
  const safeDays = Math.min(Math.max(days, 1), 16);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    forecast_days: String(safeDays),
    hourly: [
      'precipitation_probability',
      'precipitation',
      'temperature_2m',
      'relative_humidity_2m',
      'wind_speed_10m',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
    ].join(','),
    wind_speed_unit: 'ms',
  });

  const data = await httpJson(`${ENDPOINT}?${params.toString()}`);
  const daily = data.daily ?? {};
  const hourly = data.hourly ?? {};

  // 시간별을 날짜로 그룹핑 (sparkline / 상세용)
  const hourlyByDate = {};
  const len = hourly.time?.length || 0;
  for (let i = 0; i < len; i++) {
    const ts = hourly.time[i];
    const date = toIsoDate(ts);
    const b = (hourlyByDate[date] ||= {
      time: [], precipProb: [], precip: [], temp: [], humidity: [], wind: [],
    });
    b.time.push(ts);
    b.precipProb.push(numOrNull(hourly.precipitation_probability?.[i]));
    b.precip.push(numOrNull(hourly.precipitation?.[i]));
    b.temp.push(numOrNull(hourly.temperature_2m?.[i]));
    b.humidity.push(numOrNull(hourly.relative_humidity_2m?.[i]));
    b.wind.push(numOrNull(hourly.wind_speed_10m?.[i]));
  }

  const out = [];
  const dates = daily.time ?? [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const h = hourlyByDate[date] || { humidity: [] };
    const humidityAvg = avg(h.humidity);
    out.push({
      date,
      source: 'open-meteo',
      precipitationProbability: numOrNull(daily.precipitation_probability_max?.[i]),
      precipitationAmountMm:    numOrNull(daily.precipitation_sum?.[i]),
      tempMin: numOrNull(daily.temperature_2m_min?.[i]),
      tempMax: numOrNull(daily.temperature_2m_max?.[i]),
      humidityAvg: numOrNull(humidityAvg),
      windSpeedMax: numOrNull(daily.wind_speed_10m_max?.[i]),
      // 시간별 raw (24개 정도) — sparkline / 애니메이션용
      hourly: {
        time: h.time,
        precipProb: h.precipProb,
        precip: h.precip,
        temp: h.temp,
        humidity: h.humidity,
        wind: h.wind,
      },
    });
  }
  return { meta: { source: 'open-meteo', kind: 'weather' }, days: out };
}

function avg(arr) {
  if (!arr) return null;
  const valid = arr.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function numOrNull(v) {
  return Number.isFinite(v) ? v : null;
}
