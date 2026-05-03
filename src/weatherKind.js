// 날씨 분류 — 카드 배경/애니메이션/이모지 결정용.
// 입력: weatherDay (병합된 오늘 데이터)
// 출력: { kind, label, emoji, palette: { from, to } }

export function classifyWeather(w) {
  const pp = numOr(w?.precipitationProbability, 0);
  const amt = numOr(w?.precipitationAmountMm, 0);
  const tMin = numOr(w?.tempMin, 10);
  const tMax = numOr(w?.tempMax, 20);
  const wind = numOr(w?.windSpeedMax, 0);
  const hum = numOr(w?.humidityAvg, 50);

  const willPrecip = pp >= 50 || amt >= 1;
  const isFreezing = tMax <= 1;       // 종일 영하 ~ 영도
  const isHotSunny = tMax >= 28 && pp < 30 && wind < 6;
  const isCloudy   = !willPrecip && (hum >= 75 || pp >= 20);

  if (willPrecip && isFreezing) {
    return wrap('snow', '❄ 눈', '❄️', { from: '#cfd9df', to: '#e2ebf0' });
  }
  if (willPrecip) {
    if (pp >= 80 || amt >= 5) return wrap('rain-heavy', '☔ 폭우', '🌧️', { from: '#3a4663', to: '#5b6f8a' });
    return wrap('rain', '🌧 비', '🌦️', { from: '#5d7eaa', to: '#88a4c2' });
  }
  if (wind >= 8) {
    return wrap('windy', '💨 강풍', '🌬️', { from: '#7393a8', to: '#a3bdcb' });
  }
  if (isHotSunny) {
    return wrap('sunny-hot', '☀ 더움', '🌞', { from: '#f6b365', to: '#ffd58e' });
  }
  if (isCloudy) {
    return wrap('cloudy', '☁ 흐림', '⛅', { from: '#94a4b6', to: '#c2cdd9' });
  }
  return wrap('sunny', '☀ 맑음', '🌤️', { from: '#56b4ff', to: '#a3d8ff' });
}

function wrap(kind, label, emoji, palette) {
  return { kind, label, emoji, palette };
}
function numOr(v, f) { return Number.isFinite(v) ? v : f; }
