// 세차 가능 점수 산출 (순수 함수).
// 입력: weatherDay, airDay(optional), opts.nextDayPp
// 출력: { score, grade, emoji, reasons }
//
// 가중치:
//   강수확률 40 + 대기질 25 + 기온 15 + 습도 10 + 풍속 10 = 100
// 대기질 데이터가 없으면 25점을 무효 처리하고 75점을 100으로 정규화.

export function scoreDay(weather, air, opts = {}) {
  let score = 100;
  const reasons = [];

  const pp = numOr(weather?.precipitationProbability, 0);
  if (pp >= 70) {
    score -= 40;
    reasons.push(`강수확률 ${Math.round(pp)}%`);
  } else if (pp >= 40) {
    score -= 20;
    reasons.push(`강수확률 ${Math.round(pp)}%`);
  } else if (pp >= 20) {
    score -= 10;
  }

  const nextPp = numOr(opts.nextDayPp, 0);
  if (nextPp >= 70) {
    score -= 20;
    reasons.push(`내일 비 ${Math.round(nextPp)}%`);
  } else if (nextPp >= 50) {
    score -= 10;
    reasons.push(`내일 강수 가능 ${Math.round(nextPp)}%`);
  }

  // 대기질
  const hasAir = air && (Number.isFinite(air.pm10) || Number.isFinite(air.pm25) || air.yellowDustWarning);
  if (hasAir) {
    const pm10 = numOr(air.pm10, null);
    if (pm10 != null) {
      if (pm10 >= 150) { score -= 25; reasons.push(`PM10 ${Math.round(pm10)}㎍/㎥`); }
      else if (pm10 >= 80) { score -= 12; reasons.push('미세먼지 나쁨'); }
    }
    if (air.yellowDustWarning) {
      score -= 25;
      if (!reasons.some(r => r.includes('황사'))) reasons.push('황사 경보');
    }
  }

  // 기온 (결빙)
  const tMin = numOr(weather?.tempMin, null);
  if (tMin != null && tMin <= -2) {
    score -= 15;
    reasons.push(`최저 ${Math.round(tMin)}℃ 결빙`);
  }

  // 습도
  const h = numOr(weather?.humidityAvg, null);
  if (h != null && h >= 85) {
    score -= 10;
    reasons.push('고습도');
  }

  // 풍속
  const w = numOr(weather?.windSpeedMax, null);
  if (w != null && w >= 8) {
    score -= 10;
    reasons.push(`강풍 ${w.toFixed(1)}m/s`);
  }

  // 대기질 데이터가 전혀 없으면 75점 만점을 100으로 정규화
  if (!hasAir) {
    score = Math.max(0, Math.min(75, score));
    score = Math.round((score / 75) * 100);
  } else {
    score = Math.max(0, Math.min(100, Math.round(score)));
  }

  const grade = score >= 80 ? 'OK' : score >= 50 ? 'HOLD' : 'AVOID';
  const emoji = grade === 'OK' ? '🟢' : grade === 'HOLD' ? '🟡' : '🔴';

  // 좋은 날엔 사유가 비어있으니 한 줄 채워줌
  if (reasons.length === 0 && grade === 'OK') {
    reasons.push('맑고 건조');
  }

  return { score, grade, emoji, reasons };
}

function numOr(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}
