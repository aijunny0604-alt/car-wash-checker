// API 키와 엔드포인트 설정.
// 정적 웹이라 키는 클라이언트에 노출되므로 OWN-USE 한정 + 도메인 제한 권장.
// 키가 없는 어댑터(Open-Meteo, MET Norway, 7Timer, Open-Meteo AQ)만으로도 앱은 정상 동작.
//
// 사용법: 같은 폴더에 keys.local.js 를 만들어 window.CWC_KEYS 를 채우거나
//        index.html 에서 <script>window.CWC_KEYS = {...}</script> 로 주입.

const FALLBACK_KEYS = {
  openWeather: '',     // https://openweathermap.org/api One Call 3.0
  weatherbit: '',      // https://www.weatherbit.io/
  kma: '',             // https://www.data.go.kr/data/15084084/openapi.do (단기예보)
  airKorea: '',        // https://www.data.go.kr/data/15073861/openapi.do
  waqi: '',            // https://aqicn.org/data-platform/token/
  iqAir: '',           // https://www.iqair.com/air-pollution-data-api
  kakao: '',           // https://developers.kakao.com REST API 키 (장소 검색용)
};

export const KEYS = Object.assign({}, FALLBACK_KEYS, (typeof window !== 'undefined' && window.CWC_KEYS) || {});

export const ENABLED_DEFAULT = {
  'open-meteo':     true,
  'met-norway':     true,
  // 7Timer는 CORS 헤더 미제공이라 브라우저 직접 호출 불가 → 기본 비활성.
  // Cloudflare Worker 등 프록시 경유 시에만 켤 것.
  '7timer':         false,
  'kma':            true,
  'openweather':    true,
  'weatherbit':     true,
  'open-meteo-aq':  true,
  'air-korea':      true,
  'waqi':           true,
  'iqair':          true,
};

export const FETCH_TIMEOUT_MS = 5000;
export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

export const APP_USER_AGENT = 'car-wash-checker/0.1 (https://github.com/aijunny0604)';
