# Design: car-wash-checker

> 세차 가능 여부 종합 판단기 — 정적 웹 설계 문서

- **Feature**: car-wash-checker
- **Level**: Starter (정적 웹)
- **PDCA Phase**: Design
- **References**: [Plan](../../01-plan/features/car-wash-checker.plan.md)
- **Created**: 2026-05-02

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                   Browser (Static Web)                  │
│                                                         │
│  ┌─────────┐    ┌──────────────────┐    ┌────────────┐  │
│  │  UI     │◄──►│  App Controller  │◄──►│  Storage   │  │
│  │ (DOM)   │    │  (state machine) │    │ (localStg) │  │
│  └─────────┘    └────────┬─────────┘    └────────────┘  │
│                          │                              │
│                  ┌───────┴───────┐                      │
│                  │  Aggregator   │                      │
│                  │ (Promise.allS)│                      │
│                  └───────┬───────┘                      │
│            ┌─────────────┼──────────────┐               │
│            ▼             ▼              ▼               │
│      ┌──────────┐  ┌──────────┐   ┌──────────┐          │
│      │ Weather  │  │ Weather  │   │ AirQual  │          │
│      │ Adapter  │  │ Adapter  │   │ Adapter  │          │
│      │ (Open-M) │  │  (OWM)   │   │ (에어코) │          │
│      └────┬─────┘  └────┬─────┘   └────┬─────┘          │
└───────────┼─────────────┼──────────────┼────────────────┘
            ▼             ▼              ▼
       open-meteo     openweather     air.korea
```

**핵심 원칙**
- 모든 외부 호출은 **Adapter 인터페이스** 통과 → 표준 `WeatherDay` / `AirQualityDay` 형태로 정규화
- Aggregator는 어댑터들을 병렬 실행, 한쪽 실패해도 살아 있는 데이터만으로 점수 산출
- Scoring 로직은 순수 함수 (`pure`) → 단위 테스트·재계산 용이
- UI는 상태 변경 시 한 번에 렌더 (가벼운 직접 DOM 조작, 프레임워크 없음)

## 2. 파일 구조

```
car-wash-checker/
├── index.html                  # 진입점, 시멘틱 마크업 + 컨테이너
├── style.css                   # CSS 변수 + 모바일 우선 + 다크모드(prefers-color-scheme)
├── manifest.json               # PWA 메타 (옵션, v1.1)
├── src/
│   ├── app.js                  # 부트스트랩, 이벤트 바인딩, 상태 머신
│   ├── config.js               # API 키/엔드포인트 (window 환경 분기)
│   ├── location.js             # GPS + 도시 폴백 + 한국 박스 판정
│   ├── adapters/
│   │   ├── _base.js            # 공통 fetch 래퍼 (timeout 5s, AbortController)
│   │   ├── openMeteo.js        # 키 없음, 1순위
│   │   ├── metNorway.js        # 키 없음, User-Agent 필수
│   │   ├── kma.js              # 기상청 단기예보 (한국)
│   │   ├── openWeather.js      # OWM One Call 3.0
│   │   ├── weatherbit.js       # 일 50 호출 보조
│   │   ├── sevenTimer.js       # 키 없음, 폴백
│   │   ├── airKorea.js         # 한국 대기질
│   │   ├── openMeteoAir.js     # 키 없음, 글로벌 대기질
│   │   ├── waqi.js             # 글로벌 AQI
│   │   └── iqAir.js            # IQAir AirVisual
│   ├── aggregator.js           # Promise.allSettled, 가중 합의 + 이상치 제거
│   ├── consensus.js            # 가중 평균/IQR/OR 결합 등 합의 함수 모음
│   ├── scoring.js              # 점수 알고리즘 (순수 함수)
│   ├── render.js               # DOM 렌더, 카드/타임라인
│   └── i18n.js                 # 한/영 라벨 (옵션)
├── data/
│   └── cities.json             # 폴백 도시 위경도 (서울/부산 등 8개)
└── docs/                       # PDCA 문서 (이미 존재)
```

## 3. 데이터 모델 (정규화 스키마)

### 3.1 `WeatherDay`
```ts
{
  date: string;              // YYYY-MM-DD (로컬)
  source: 'open-meteo' | 'openweather' | 'kma';
  precipitationProbability: number;   // 0–100 (%, 일중 최대값)
  precipitationAmountMm: number;      // 강수량 합
  tempMin: number;                    // °C
  tempMax: number;                    // °C
  humidityAvg: number;                // 0–100 (%)
  windSpeedMax: number;               // m/s
  weatherCode?: number;               // WMO/OWM 등 원본
}
```

### 3.2 `AirQualityDay`
```ts
{
  date: string;
  source: 'air-korea' | 'waqi';
  pm10: number | null;                // µg/m³
  pm25: number | null;                // µg/m³
  yellowDustWarning: boolean;         // 황사 경보
  aqi?: number;                       // 0–500 (참고)
}
```

### 3.3 `DailyVerdict` (UI에 직접 바인딩)
```ts
{
  date: string;
  score: number;             // 0–100
  grade: 'OK' | 'HOLD' | 'AVOID';
  emoji: '🟢' | '🟡' | '🔴';
  reasons: string[];         // ["내일 강수확률 80%", "황사 경보"]
  sources: string[];         // 사용된 소스 ID 목록
  raw: { weather: WeatherDay[]; air: AirQualityDay[] };
}
```

## 4. Adapter 인터페이스

모든 adapter는 동일한 시그니처:

```js
// adapters/openMeteo.js
export async function fetchOpenMeteo({ lat, lon, days = 7 }) {
  // 호출 → 정규화 → WeatherDay[] 반환
  // 실패 시 throw (caller 에서 allSettled로 흡수)
}
```

| Adapter | 함수명 | 출력 타입 | 키 | 가중치 | 비고 |
|---------|--------|-----------|----|--------|------|
| Open-Meteo | `fetchOpenMeteo` | `WeatherDay[]` | ❌ | 1.0 | 1순위, 키 없음 |
| MET Norway | `fetchMetNorway` | `WeatherDay[]` | ❌ | 1.0 | UA 헤더 필수 |
| 기상청 | `fetchKma` | `WeatherDay[]` | ✅ | 1.2 (한국) | 격자 변환 필요 |
| OpenWeather | `fetchOpenWeather` | `WeatherDay[]` | ✅ | 0.9 | One Call 3.0 |
| Weatherbit | `fetchWeatherbit` | `WeatherDay[]` | ✅ | 0.8 | 일 50 한도 |
| 7Timer! | `fetchSevenTimer` | `WeatherDay[]` | ❌ | 0.7 | 단순 폴백 |
| AirKorea | `fetchAirKorea` | `AirQualityDay[]` | ✅ | 1.5 (한국) | 공식 데이터 |
| Open-Meteo AQ | `fetchOpenMeteoAir` | `AirQualityDay[]` | ❌ | 1.0 | CAMS 기반 |
| WAQI | `fetchWaqi` | `AirQualityDay[]` | ✅ | 0.9 | 글로벌 |
| IQAir | `fetchIqAir` | `AirQualityDay[]` | ✅ | 0.9 | 보조 |

**API 키 관리**
- `src/config.js` 에서 `window.CWC_KEYS` 같은 전역 객체로 주입 (배포 시 환경별 치환 또는 별도 `keys.local.js` git-ignore)
- 키 없으면 해당 어댑터 자동 비활성화 → `aggregator`가 알아서 건너뜀

## 5. Aggregator: 다중 소스 합의 로직

```js
// aggregator.js
import * as W from './adapters/index.js';
import { weightedConsensus, removeOutliers, anyTrue } from './consensus.js';

const WEATHER_TASKS = [
  { fn: W.fetchOpenMeteo,   id: 'open-meteo',  weight: 1.0, needsKey: false },
  { fn: W.fetchMetNorway,   id: 'met-norway',  weight: 1.0, needsKey: false },
  { fn: W.fetchKma,         id: 'kma',         weight: 1.2, needsKey: true,  koOnly: true },
  { fn: W.fetchOpenWeather, id: 'openweather', weight: 0.9, needsKey: true  },
  { fn: W.fetchWeatherbit,  id: 'weatherbit',  weight: 0.8, needsKey: true  },
  { fn: W.fetchSevenTimer,  id: '7timer',      weight: 0.7, needsKey: false },
];

const AIR_TASKS = [
  { fn: W.fetchAirKorea,    id: 'air-korea',     weight: 1.5, needsKey: true,  koOnly: true },
  { fn: W.fetchOpenMeteoAir,id: 'open-meteo-aq', weight: 1.0, needsKey: false },
  { fn: W.fetchWaqi,        id: 'waqi',          weight: 0.9, needsKey: true  },
  { fn: W.fetchIqAir,       id: 'iqair',         weight: 0.9, needsKey: true  },
];

export async function aggregate({ lat, lon, isKorea, enabledSources, keys }) {
  const runnable = (defs) => defs.filter(d =>
    enabledSources[d.id] !== false &&
    (!d.needsKey || keys[d.id]) &&
    (!d.koOnly || isKorea)
  );

  const wDefs = runnable(WEATHER_TASKS);
  const aDefs = runnable(AIR_TASKS);

  const [wRes, aRes] = await Promise.all([
    Promise.allSettled(wDefs.map(d => d.fn({ lat, lon, key: keys[d.id] }))),
    Promise.allSettled(aDefs.map(d => d.fn({ lat, lon, key: keys[d.id] }))),
  ]);

  const weatherSets = pickFulfilled(wRes, wDefs); // [{ days, weight, id }]
  const airSets     = pickFulfilled(aRes, aDefs);

  if (weatherSets.length === 0) throw new Error('모든 날씨 소스 실패');
  // 대기질 0개여도 점수는 강수/온도만으로 산출 가능 → 계속 진행

  return {
    weather: mergeWeather(weatherSets), // 일자별 합의
    air:     mergeAir(airSets),
    sources: {
      weather: weatherSets.map(s => s.id),
      air:     airSets.map(s => s.id),
    },
    coverage: {
      weather: `${weatherSets.length}/${wDefs.length}`,
      air:     `${airSets.length}/${aDefs.length}`,
    },
  };
}
```

### 5.1 일자별 병합 (`mergeWeather` / `mergeAir`)

각 소스가 7일치 배열을 반환 → **날짜 기준으로 그룹핑** → 필드별 합의 함수 적용:

```js
// consensus.js
export function weightedConsensus(values, weights, { trimOutliers = true } = {}) {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  let pairs = values.map((v, i) => ({ v, w: weights[i] }));
  if (trimOutliers && pairs.length >= 4) {
    // ±1.5 IQR 밖 제거
    const sorted = [...pairs].sort((a, b) => a.v - b.v).map(p => p.v);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    pairs = pairs.filter(p => p.v >= q1 - 1.5 * iqr && p.v <= q3 + 1.5 * iqr);
  }
  const sumW = pairs.reduce((s, p) => s + p.w, 0);
  return pairs.reduce((s, p) => s + p.v * p.w, 0) / sumW;
}
```

### 5.2 필드별 합의 규칙

| 필드 | 합의 방식 | 이유 |
|------|-----------|------|
| `precipitationProbability` | 가중 평균 + IQR 트리밍 → **반올림**, 추가로 `precipMax` 별도 노출 | 평균은 합리적, max는 보수적 알림 |
| `precipitationAmountMm` | 가중 평균 후 max도 보존 | 약한 비도 누락 방지 |
| `tempMin` / `tempMax` | 가중 평균 (이상치 제거) | 안정 |
| `humidityAvg` | 가중 평균 | 안정 |
| `windSpeedMax` | 가중 평균 후 max도 보존 | 강풍 누락 방지 |
| `pm10` / `pm25` | 한국 좌표면 AirKorea 가중 1.5, 그 외 동일 가중 평균 + IQR | 공식 데이터 우선 |
| `yellowDustWarning` | **OR 결합** (`anyTrue`) | 안전 우선 |
| `aqi` | 가중 평균 (참고용) | UI 표시용 |

### 5.3 부분 가용성 정책

| 가용 소스 | 동작 |
|-----------|------|
| 날씨 ≥ 1 + 대기질 ≥ 1 | 정상 (점수 100점 만점) |
| 날씨 ≥ 1 + 대기질 = 0 | 점수 산출하되 대기질 가중치 25점은 **무효(점수 정규화 75 → 100 스케일)**, UI에 "대기질 데이터 없음" 배지 |
| 날씨 = 0 | ErrorState |

### 5.4 사용자 제어

설정 모달에서 소스별 ON/OFF 가능 → `enabledSources` 객체 `localStorage`에 영속화.
기본값: 모든 소스 ON (키가 있고 가능하면).

## 6. Scoring 알고리즘 (순수 함수)

```js
// scoring.js
export function scoreDay(weather, air, opts = {}) {
  let score = 100;
  const reasons = [];

  // 강수
  const pp = weather.precipitationProbability ?? 0;
  if (pp >= 70)      { score -= 40; reasons.push(`강수확률 ${pp}%`); }
  else if (pp >= 40) { score -= 20; reasons.push(`강수확률 ${pp}%`); }
  else if (pp >= 20) { score -= 10; }

  // 익일 비 (caller가 nextDay 정보 제공)
  if (opts.nextDayPp >= 70) { score -= 20; reasons.push(`내일 비 ${opts.nextDayPp}%`); }

  // 대기질
  if (air?.pm10 != null) {
    if (air.pm10 >= 150) { score -= 25; reasons.push(`PM10 ${air.pm10}㎍/㎥`); }
    else if (air.pm10 >= 80) { score -= 12; reasons.push('미세먼지 나쁨'); }
  }
  if (air?.yellowDustWarning) { score -= 25; reasons.push('황사 경보'); }

  // 결빙
  if (weather.tempMin <= -2) { score -= 15; reasons.push(`최저 ${weather.tempMin}℃ 결빙`); }

  // 습도
  if (weather.humidityAvg >= 85) { score -= 10; reasons.push('고습도'); }

  // 풍속
  if (weather.windSpeedMax >= 8) { score -= 10; reasons.push(`강풍 ${weather.windSpeedMax}m/s`); }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? 'OK' : score >= 50 ? 'HOLD' : 'AVOID';
  const emoji = grade === 'OK' ? '🟢' : grade === 'HOLD' ? '🟡' : '🔴';

  return { score, grade, emoji, reasons };
}
```

> Plan의 가중치(40/25/15/10/10)를 그대로 따르되 **단계 감점**으로 부드럽게 적용.

## 7. 상태 머신 (App Controller)

```
[ Idle ]
    │ user opens page
    ▼
[ AskingLocation ] ─── permission denied ──► [ ManualCity ] ──┐
    │ permission granted                                       │
    ▼                                                          │
[ Loading ] ◄─────────────────────────────────────────────────┘
    │ aggregate() resolves
    ▼
[ Rendered ] ─── refresh / change city ──► Loading
    │ aggregate() rejects (모든 소스 실패)
    ▼
[ ErrorState ] ── retry ──► Loading
```

저장: `localStorage`에 마지막 좌표/도시, 마지막 호출 시각, 캐시(15분 TTL).

## 8. 에러 / 폴백 시나리오

| 상황 | 동작 |
|------|------|
| GPS 거부 | "도시 선택" 모달 표시 (cities.json) |
| 네트워크 에러 1개 소스 | 조용히 제외, 배지에 "1/3 데이터 종합" |
| 모든 소스 실패 | ErrorState 화면 + 재시도 버튼 |
| API 키 누락 | 해당 어댑터 자동 비활성, 콘솔 경고 |
| CORS 차단 | 어댑터 내부에서 catch → 어댑터 비활성 처리 |
| 좌표가 한국 밖 | AirKorea 비활성, WAQI만 사용 (lat/lon 한국 박스 검증) |

## 9. UI 사양 (모바일 우선)

### 9.1 레이아웃 (360px 기준)
```
┌──────────────────────────────┐
│ 🚗 세차해도 될까?    ⚙ 설정 │  ← header (sticky)
├──────────────────────────────┤
│ 📍 서울 강남구       [변경] │  ← 위치 바
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │       🟢                 │ │  ← 메인 카드 (오늘)
│ │       OK                 │ │
│ │       87점               │ │
│ │  맑고 건조, 미세먼지 보통 │ │
│ │  [Open-Meteo · 에어코]   │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ 🗓 7일 예보                  │
│ ┌──┬──┬──┬──┬──┬──┬──┐       │
│ │월│화│수│목│금│토│일│       │
│ │🟢│🟡│🔴│🟢│🟢│🟡│🟢│       │
│ │87│62│30│85│90│58│80│       │
│ └──┴──┴──┴──┴──┴──┴──┘       │
├──────────────────────────────┤
│ ⓘ 판단 기준 / 데이터 출처     │
└──────────────────────────────┘
```

### 9.2 컴포넌트 (DOM 단위)
- `<header.app-header>`
- `<section.location-bar>` — 위치 표시 + 변경 버튼
- `<section.today-card>` — 큰 신호등, 사유 리스트
- `<section.forecast-strip>` — 7일 가로 스크롤 (모바일) / 그리드 (데스크탑)
- `<dialog.city-picker>` — 도시 선택 모달 (`<dialog>` 네이티브)
- `<section.criteria-info>` — 접고 펼치는 기준 설명

### 9.3 접근성
- 모든 신호등에 `aria-label="세차 가능, 87점"`
- 색만으로 의미 전달 금지 → emoji + 텍스트 등급
- 키보드 포커스 가능, `:focus-visible` 윤곽선
- Lighthouse 접근성 ≥ 90 목표

### 9.4 반응형
- 모바일 (≤ 480px): 1열, 가로 스크롤 7일
- 태블릿 (481–960px): 메인 카드 + 7일 그리드 4×2
- 데스크탑 (> 960px): 메인 카드 좌측, 7일 우측 그리드

## 10. 보안 / 키 관리 (Starter 한계 인식)

- 정적 웹은 키 노출 불가피 → **다음 완화책**:
  - OpenWeather 무료 키는 분당 60회 제한 사용
  - WAQI는 도메인 레퍼러 제한 가능
  - 에어코리아는 IP 추적 가능 → 개인용 한정
- v1.1에서 Cloudflare Worker 프록시 옵션 (Plan에 명시됨)

## 11. 구현 순서 (Do 단계 체크리스트)

### Phase A — 기본 골격 + 키 없는 소스 우선
1. [ ] `index.html` + `style.css` 뼈대
2. [ ] `data/cities.json` 8개 도시 + 한국 박스 좌표
3. [ ] `src/location.js` GPS + 도시 폴백 + `isKorea(lat, lon)`
4. [ ] `src/adapters/_base.js` (timeout 5s, AbortController)
5. [ ] `src/adapters/openMeteo.js` (키 없음, 1순위)
6. [ ] `src/scoring.js` 순수 함수
7. [ ] `src/render.js` 오늘 카드 + 7일 스트립
8. [ ] `src/aggregator.js` (Open-Meteo 단일로 E2E 동작 확인)

### Phase B — 무료/무키 소스 추가로 합의 가동
9. [ ] `src/consensus.js` (가중 평균 + IQR + OR)
10. [ ] `src/adapters/metNorway.js` (키 없음, UA 헤더)
11. [ ] `src/adapters/sevenTimer.js` (키 없음, 폴백)
12. [ ] `src/adapters/openMeteoAir.js` (키 없음, 대기질)
13. [ ] Aggregator 가중 합의 로직 활성화

### Phase C — 키 필요 소스 (선택적 강화)
14. [ ] `src/adapters/openWeather.js`
15. [ ] `src/adapters/weatherbit.js`
16. [ ] `src/adapters/kma.js` (한국 좌표일 때만)
17. [ ] `src/adapters/airKorea.js` (한국 좌표일 때만)
18. [ ] `src/adapters/waqi.js`
19. [ ] `src/adapters/iqAir.js`

### Phase D — 마감
20. [ ] 설정 모달 (소스 ON/OFF, 영속화)
21. [ ] 에러/로딩 상태 UI + 데이터 커버리지 배지
22. [ ] 캐시 (localStorage 15분 TTL)
23. [ ] `manifest.json` (옵션, PWA)
24. [ ] Lighthouse 90+ 튜닝

## 12. 검증 기준 (Check 단계가 비교할 항목)

- [ ] 10개 어댑터가 동일 인터페이스 준수 (`_base.js` 사용)
- [ ] 키 없는 소스 4종(Open-Meteo, MET Norway, 7Timer, Open-Meteo AQ)만으로도 정상 동작
- [ ] Aggregator가 부분 실패(소수 소스만 성공)에도 가중 합의로 결과 산출
- [ ] `consensus.js`가 IQR 트리밍 + 가중 평균 + OR 결합 모두 구현
- [ ] 한국 좌표일 때만 KMA/AirKorea 활성, 그 외엔 자동 비활성
- [ ] Scoring이 순수 함수 (입력만으로 출력 결정)
- [ ] 점수 → 등급/이모지 매핑이 Plan과 일치
- [ ] 대기질 0개 소스여도 점수 정규화로 동작
- [ ] GPS 거부 시 도시 선택 폴백 작동
- [ ] 7일치 카드 렌더 + 데이터 커버리지 배지 ("N/M 종합")
- [ ] 설정 모달에서 소스 ON/OFF 가능, localStorage 영속
- [ ] 모바일/데스크탑 반응형
- [ ] 모든 외부 호출 timeout (5s) + 에러 흡수

## 13. 다음 단계

→ `/pdca do car-wash-checker` 로 구현 시작
