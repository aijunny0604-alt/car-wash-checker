// 위치 처리: GPS 시도 -> 실패 시 도시 폴백 / 한국 박스 판정.

const KOREA_BOX = { latMin: 33.0, latMax: 38.7, lonMin: 124.5, lonMax: 132.0 };

export function isKorea(lat, lon) {
  return lat >= KOREA_BOX.latMin && lat <= KOREA_BOX.latMax
      && lon >= KOREA_BOX.lonMin && lon <= KOREA_BOX.lonMax;
}

export function getStoredLocation() {
  try {
    const raw = localStorage.getItem('cwc.location');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveLocation(loc) {
  try { localStorage.setItem('cwc.location', JSON.stringify(loc)); } catch {}
}

// GPS 1회 조회. 실패/거부 시 reject.
export function requestGps({ timeoutMs = 8000, maxAgeMs = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation 미지원'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        source: 'gps',
        label: 'GPS',
      }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: maxAgeMs },
    );
  });
}

export async function loadCities() {
  const res = await fetch('./data/cities.json');
  if (!res.ok) throw new Error('cities.json 로드 실패');
  return await res.json();
}
