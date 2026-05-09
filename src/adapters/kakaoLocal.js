// 카카오 로컬 API — 키워드로 장소 검색
// 공식 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide
// 무료: 일 100,000건 (개인 사용에 충분)
// 인증: Authorization: KakaoAK {REST_API_KEY}
//
// 주의: 브라우저에서 직접 호출 시 CORS 차단되지 않음 (REST API 자체는 CORS 허용).
//      단, 도메인 제한이 카카오 콘솔 [플랫폼] 설정에 있어야 정상 동작.

import { httpJson } from './_base.js';
import { KEYS } from '../config.js';

const ENDPOINT_KEYWORD = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const ENDPOINT_ADDRESS = 'https://dapi.kakao.com/v2/local/search/address.json';

// 카카오 raw 에러 → 사용자 친화 메시지로 변환
function friendlyKakaoError(e) {
  const msg = String(e?.message || e || '');
  if (/HTTP 401/.test(msg)) return new Error('카카오 API 키가 유효하지 않습니다 (관리자 문의)');
  if (/HTTP 403/.test(msg)) return new Error('카카오 API 권한 오류 — 도메인 등록 필요');
  if (/HTTP 429/.test(msg)) return new Error('카카오 API 호출 제한 도달, 잠시 후 다시 시도해 주세요');
  if (/HTTP 5\d\d/.test(msg)) return new Error('카카오 서버 일시 오류 — 잠시 후 다시 시도해 주세요');
  if (/Failed to fetch|NetworkError|aborted/i.test(msg)) return new Error('네트워크 연결을 확인해 주세요');
  return e instanceof Error ? e : new Error(msg);
}

/**
 * 키워드로 장소 검색
 * @param {Object} opts
 * @param {string} opts.query - 검색어 (예: "세차장")
 * @param {number} opts.lat - 중심 위도
 * @param {number} opts.lon - 중심 경도
 * @param {number} [opts.radius=3000] - 반경(m), 0~20000
 * @param {string} [opts.sort='distance'] - 'distance' | 'accuracy'
 * @param {number} [opts.size=15] - 한 페이지 결과 수, 1~15
 */
export async function searchByKeyword({ query, lat, lon, radius = 3000, sort = 'distance', size = 15 }) {
  const key = KEYS.kakao;
  if (!key) {
    throw new Error('카카오 REST API 키가 설정되지 않았습니다');
  }

  const params = new URLSearchParams({
    query: String(query),
    x: String(lon),         // 카카오는 x=경도, y=위도
    y: String(lat),
    radius: String(Math.max(0, Math.min(20000, radius))),
    sort,
    size: String(Math.max(1, Math.min(15, size))),
  });

  let data;
  try {
    data = await httpJson(`${ENDPOINT_KEYWORD}?${params}`, {
      headers: { 'Authorization': `KakaoAK ${key}` },
    });
  } catch (e) {
    throw friendlyKakaoError(e);
  }

  const docs = Array.isArray(data?.documents) ? data.documents : [];
  return docs.map(d => ({
    id:       d.id,
    name:     d.place_name || '',
    category: d.category_name || '',
    address:  d.address_name || '',
    roadAddress: d.road_address_name || '',
    phone:    d.phone || '',
    placeUrl: d.place_url || '',
    lat:      Number(d.y),
    lon:      Number(d.x),
    distance: Number(d.distance), // 미터, sort=distance일 때만 의미 있음
  }));
}

/**
 * 세차장 전용 헬퍼 — 다양한 키워드로 검색하여 합집합 반환
 * @param {Object} opts
 * @param {number} opts.lat
 * @param {number} opts.lon
 * @param {number} [opts.radius=3000]
 */
export async function searchCarWashes({ lat, lon, radius = 3000 }) {
  // "세차장" 키워드만으로도 셀프/일반/자동 다 잡히지만, 좀 더 넓게
  const queries = ['세차장', '셀프세차'];
  const results = await Promise.allSettled(
    queries.map(q => searchByKeyword({ query: q, lat, lon, radius, sort: 'distance', size: 15 }))
  );

  const all = [];
  const seen = new Set();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
    }
  }
  // 거리순 정렬 (NaN/undefined는 맨 뒤)
  all.sort((a, b) =>
    (Number.isFinite(a.distance) ? a.distance : Infinity) -
    (Number.isFinite(b.distance) ? b.distance : Infinity)
  );
  return all.slice(0, 20);
}

/**
 * 이름 검색 — 핵심 변형 1차 호출 후 결과 부족 시만 fallback
 * 1차: "{k} 세차장" 단일 호출 → 보통 충분
 * 2차 (결과 < 5건): "{k} 워시" + "{k}" (세차 키워드 없는 브랜드 캐치)
 *
 * @param {Object} opts
 * @param {string} opts.keyword
 * @param {number} opts.lat
 * @param {number} opts.lon
 * @param {number} [opts.radius=20000]
 */
const isCarWashName = (item) =>
  /세차|워시|디테일링|wash/i.test(`${item.name || ''} ${item.category || ''}`);

export async function searchCarWashesByName({ keyword, lat, lon, radius = 20000 }) {
  const k = String(keyword || '').trim();
  if (!k) return [];

  const collect = (items, all, seen) => {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      if (!isCarWashName(item)) continue;
      if (Number.isFinite(item.distance) && item.distance > radius) continue;
      seen.add(item.id);
      all.push(item);
    }
  };

  const all = [];
  const seen = new Set();

  // 1차: 단일 키워드 (대부분 케이스 커버)
  try {
    const primary = await searchByKeyword({
      query: `${k} 세차장`, lat, lon, radius, sort: 'distance', size: 15,
    });
    collect(primary, all, seen);
  } catch {/* 무시 — fallback 시도 */}

  // 2차: 결과 < 5건이면 변형 2개 추가 (브랜드명/워시존 캐치)
  if (all.length < 5) {
    const fallbackQueries = [`${k} 워시`, k];
    const results = await Promise.allSettled(
      fallbackQueries.map(q => searchByKeyword({ query: q, lat, lon, radius, sort: 'distance', size: 15 }))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') collect(r.value, all, seen);
    }
  }

  all.sort((a, b) =>
    (Number.isFinite(a.distance) ? a.distance : Infinity) -
    (Number.isFinite(b.distance) ? b.distance : Infinity)
  );
  return all.slice(0, 25);
}

/**
 * 주소 → 좌표 변환 (카카오 주소 API)
 * "강남구", "해운대동", "서울 종로구" 등 입력 → 그 좌표 반환
 * @param {string} query - 주소 키워드
 */
export async function searchByAddress(query) {
  const key = KEYS.kakao;
  if (!key) throw new Error('카카오 REST API 키가 설정되지 않았습니다');
  const params = new URLSearchParams({ query: String(query), size: '10' });
  let data;
  try {
    data = await httpJson(`${ENDPOINT_ADDRESS}?${params}`, {
      headers: { 'Authorization': `KakaoAK ${key}` },
    });
  } catch (e) {
    throw friendlyKakaoError(e);
  }
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  return docs.map(d => {
    const addr = d.address || d.road_address || {};
    const name = d.address_name || addr.address_name || '';
    return {
      name,
      lat: Number(d.y),
      lon: Number(d.x),
      region1: addr.region_1depth_name || '',
      region2: addr.region_2depth_name || '',
      region3: addr.region_3depth_name || '',
    };
  });
}

/**
 * 주소 키워드 → 그 위치 주변 세차장 검색
 * 1) 주소를 좌표로 변환 → 2) 그 좌표 주변 세차장 키워드 검색
 */
export async function searchCarWashesByAddress({ query, radius = 3000 }) {
  const addresses = await searchByAddress(query);
  if (!addresses.length) {
    return { matched: null, items: [] };
  }
  const a = addresses[0];
  const items = await searchCarWashes({ lat: a.lat, lon: a.lon, radius });
  return { matched: a, items };
}

/**
 * 카테고리 분류 (이름에서 추론)
 * @returns 'self' | 'auto' | 'general'
 */
export function classifyCarWash(name) {
  const n = String(name || '');
  if (/셀프/i.test(n)) return 'self';
  if (/자동|기계|드라이브\s*스루/i.test(n)) return 'auto';
  return 'general';
}
