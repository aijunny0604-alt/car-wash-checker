// 가중 합의(Weighted Consensus) + 이상치 제거 + OR 결합.

export function weightedConsensus(values, weights, { trimOutliers = true } = {}) {
  const pairs = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) pairs.push({ v: values[i], w: weights[i] });
  }
  if (pairs.length === 0) return null;
  if (pairs.length === 1) return pairs[0].v;

  let trimmed = pairs;
  if (trimOutliers && pairs.length >= 4) {
    const sorted = [...pairs].sort((a, b) => a.v - b.v).map(p => p.v);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    trimmed = pairs.filter(p => p.v >= lo && p.v <= hi);
    if (trimmed.length === 0) trimmed = pairs; // 안전장치
  }
  const sumW = trimmed.reduce((s, p) => s + p.w, 0);
  if (sumW === 0) return null;
  return trimmed.reduce((s, p) => s + p.v * p.w, 0) / sumW;
}

export function anyTrue(values) {
  return values.some(Boolean);
}

export function maxOf(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
}

// 날짜 기준으로 여러 소스의 일별 데이터를 합의
export function mergeWeatherDays(sets) {
  // sets: [{ id, weight, days: [{ date, ...fields }] }]
  if (sets.length === 0) return [];

  const byDate = {};
  for (const s of sets) {
    for (const d of s.days) {
      (byDate[d.date] ||= []).push({ ...d, _weight: s.weight });
    }
  }

  const dates = Object.keys(byDate).sort();
  return dates.map(date => {
    const rows = byDate[date];
    const weights = rows.map(r => r._weight);
    // 시간별 데이터는 첫 가용 소스(보통 Open-Meteo)에서 가져옴
    const hourly = rows.find(r => r.hourly)?.hourly || null;
    return {
      date,
      sources: rows.map(r => r.source),
      precipitationProbability: roundOrNull(weightedConsensus(rows.map(r => r.precipitationProbability), weights)),
      precipitationProbabilityMax: roundOrNull(maxOf(rows.map(r => r.precipitationProbability))),
      precipitationAmountMm: avg2(weightedConsensus(rows.map(r => r.precipitationAmountMm), weights)),
      precipitationAmountMmMax: avg2(maxOf(rows.map(r => r.precipitationAmountMm))),
      tempMin: avg1(weightedConsensus(rows.map(r => r.tempMin), weights)),
      tempMax: avg1(weightedConsensus(rows.map(r => r.tempMax), weights)),
      humidityAvg: roundOrNull(weightedConsensus(rows.map(r => r.humidityAvg), weights)),
      windSpeedMax: avg1(weightedConsensus(rows.map(r => r.windSpeedMax), weights)),
      windSpeedMaxOf: avg1(maxOf(rows.map(r => r.windSpeedMax))),
      hourly,
    };
  });
}

export function mergeAirDays(sets) {
  if (sets.length === 0) return [];
  const byDate = {};
  for (const s of sets) {
    for (const d of s.days) {
      (byDate[d.date] ||= []).push({ ...d, _weight: s.weight });
    }
  }
  const dates = Object.keys(byDate).sort();
  return dates.map(date => {
    const rows = byDate[date];
    const weights = rows.map(r => r._weight);
    return {
      date,
      sources: rows.map(r => r.source),
      pm10: roundOrNull(weightedConsensus(rows.map(r => r.pm10), weights)),
      pm25: roundOrNull(weightedConsensus(rows.map(r => r.pm25), weights)),
      yellowDustWarning: anyTrue(rows.map(r => r.yellowDustWarning)),
      aqi: roundOrNull(weightedConsensus(rows.map(r => r.aqi), weights)),
    };
  });
}

function roundOrNull(v) { return Number.isFinite(v) ? Math.round(v) : null; }
function avg1(v) { return Number.isFinite(v) ? Math.round(v * 10) / 10 : null; }
function avg2(v) { return Number.isFinite(v) ? Math.round(v * 100) / 100 : null; }
