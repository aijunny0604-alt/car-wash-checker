// 날씨 조건에 따른 추천 장비/준비물 산출 (순수 함수).
// 입력: weatherDay, airQualityDay (optional)
// 출력: [{ icon, label, reason, severity: 'high'|'medium'|'low' }, ...]

export function recommendGear(weather, air) {
  const items = [];
  if (!weather) return items;

  const pp   = numOr(weather.precipitationProbability, 0);
  const amt  = numOr(weather.precipitationAmountMm, 0);
  const tMin = numOr(weather.tempMin, 10);
  const tMax = numOr(weather.tempMax, 20);
  const hum  = numOr(weather.humidityAvg, 50);
  const wind = numOr(weather.windSpeedMax, 0);

  // 우산
  if (pp >= 70 || amt >= 5) {
    items.push({ icon: '🌂', label: '우산 필수', reason: `강수확률 ${Math.round(pp)}%`, severity: 'high' });
  } else if (pp >= 40) {
    items.push({ icon: '☂️', label: '우산 챙기기', reason: `강수확률 ${Math.round(pp)}%`, severity: 'medium' });
  }

  // 외투/방한
  if (tMin <= -2) {
    items.push({ icon: '🧥', label: '두꺼운 외투', reason: `최저 ${Math.round(tMin)}℃ 결빙`, severity: 'high' });
    items.push({ icon: '🧤', label: '장갑', reason: '한파 대비', severity: 'high' });
  } else if (tMin <= 5) {
    items.push({ icon: '🧥', label: '외투', reason: `최저 ${Math.round(tMin)}℃`, severity: 'medium' });
  } else if (tMin <= 12 && tMax <= 18) {
    items.push({ icon: '🧶', label: '얇은 겉옷', reason: '쌀쌀함', severity: 'low' });
  }

  // 햇빛 / 자외선
  if (pp < 30 && tMax >= 25) {
    items.push({ icon: '🕶️', label: '선글라스', reason: `맑고 ${Math.round(tMax)}℃`, severity: 'medium' });
    items.push({ icon: '🧴', label: '자외선 차단제', reason: '햇빛 강함', severity: 'medium' });
  } else if (pp < 30 && tMax >= 20) {
    items.push({ icon: '🕶️', label: '선글라스', reason: '맑은 날씨', severity: 'low' });
  }

  // 더위 (수분)
  if (tMax >= 30) {
    items.push({ icon: '💧', label: '수분 보충', reason: `최고 ${Math.round(tMax)}℃ 폭염`, severity: 'high' });
  } else if (tMax >= 27) {
    items.push({ icon: '💧', label: '물 챙기기', reason: '더운 날씨', severity: 'low' });
  }

  // 강풍
  if (wind >= 10) {
    items.push({ icon: '💨', label: '바람 주의', reason: `${wind.toFixed(1)}m/s 강풍`, severity: 'high' });
  } else if (wind >= 8) {
    items.push({ icon: '🧢', label: '모자 주의', reason: '바람 강함', severity: 'medium' });
  }

  // 미세먼지 / 황사
  if (air?.yellowDustWarning) {
    items.push({ icon: '😷', label: 'KF94 마스크', reason: '황사 경보', severity: 'high' });
  } else {
    const pm10 = numOr(air?.pm10, null);
    const pm25 = numOr(air?.pm25, null);
    if (pm10 != null && pm10 >= 150) {
      items.push({ icon: '😷', label: 'KF94 마스크', reason: `PM10 ${Math.round(pm10)}㎍`, severity: 'high' });
    } else if (pm10 != null && pm10 >= 80) {
      items.push({ icon: '😷', label: '마스크 권장', reason: '미세먼지 나쁨', severity: 'medium' });
    } else if (pm25 != null && pm25 >= 35) {
      items.push({ icon: '😷', label: '마스크 권장', reason: '초미세먼지', severity: 'medium' });
    }
  }

  // 고습도 (불쾌)
  if (hum >= 85 && tMax >= 25) {
    items.push({ icon: '🧴', label: '땀 흡수', reason: '고온다습', severity: 'low' });
  }

  // 너무 평범한 날엔 1~2개 정도 가벼운 추천
  if (items.length === 0) {
    items.push({ icon: '✨', label: '쾌적한 하루', reason: '특별한 준비물 없음', severity: 'low' });
  }

  return items;
}

function numOr(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}
