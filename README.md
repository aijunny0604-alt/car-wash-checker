# 🚗 세차해도 될까? (car-wash-checker)

> **여러 무료 날씨 API를 동시에 호출해 가중 합의로 종합한 뒤, 오늘부터 30일치 세차 가능 점수**를 알려주고, 카카오 로컬 API로 **주변 세차장**까지 한 번에 보여주는 정적 웹 앱

날씨·미세먼지·기온/습도·풍속을 모두 보고 0–100점으로 산출, 🟢 OK / 🟡 보류 / 🔴 비추천으로 한눈에 판단합니다.

🌐 **데모**: https://aijunny0604-alt.github.io/car-wash-checker/

## ✨ 주요 기능

- 📍 **GPS 자동 감지** + 한글 위치 검색 (동/구/도시) + 도시→구→동 드릴다운 카드 그리드
- 🌐 **무료 API 다중 종합** (Open-Meteo Forecast/AQ/Climate · MET Norway · 7Timer)
- 🎯 **가중 합의 + IQR 이상치 제거**로 한 소스가 튀어도 결과 안정 (네이버급 정확도)
- 📅 **세차 예정일 직접 선택** (날짜 입력 + 14일 카드 클릭 + 🏆 최적일 자동 추천)
- 🗓 **7 / 14 / 16 / 30일 토글** (17~30일은 과거 30년 평균 기반 참고치)
- ☀️🌧❄️ **날씨별 동적 그라데이션 배경 + SVG 애니메이션** (회전 태양, 비/눈, 구름, 강풍 라인)
- 📊 **시간별 강수확률 + 기온 그래프** (Y축 라벨, 그리드, sparkline)
- 🚿 **주변 세차장 (Kakao Local)** — 반경 20km 거리순, [📍 주소로 찾기 / 🏪 세차장 이름] 탭 검색
- ⭐ **즐겨찾기 + 최근 검색** (개별 ✕ 삭제 / 안 남기기 모드 지원)
- 📱 **모바일 최적화** (가로 스크롤 차단, 인포그래픽 좌우 2분할, 4열 메트릭)
- ⚡ 부드러운 전환 애니메이션 (sparkline path morph, 인디케이터 슬라이드)

## 🚀 빠른 실행

ES module 을 쓰기 때문에 `file://`로는 안 돌아갑니다. 정적 서버 하나만 있으면 OK.

```bash
# 옵션 A) Python
python -m http.server 8080

# 옵션 B) Node
npx -y serve -l 8080 .

# 옵션 C) VSCode "Live Server" 확장
```

브라우저에서 `http://localhost:8080` 접속.

## 🚢 배포 (GitHub Pages)

`main` 브랜치에 push 하면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이 자동으로:
1. GitHub Secret `KAKAO_KEY`를 `keys.public.js`로 주입
2. 정적 파일을 GitHub Pages에 배포

`.nojekyll` 파일이 있어 `_base.js` 같은 underscore 시작 파일도 정상 서빙됩니다.

## 📊 점수 / 등급

| 등급 | 점수 | 설명 |
|------|------|------|
| 🟢 OK | 80 이상 | 세차 권장 |
| 🟡 보류 | 50–79 | 가능하지만 신중 |
| 🔴 비추천 | 49 이하 | 다른 날 추천 |

**가중치**: 강수 40 + 대기질 25 + 기온 15 + 습도 10 + 풍속 10 (총 100점)

대기질 데이터가 없으면 75점 만점을 100점으로 정규화합니다.

## 🌐 데이터 소스

| API | 용도 | 키 |
|-----|------|----|
| **Open-Meteo Forecast** | 1~16일 정확 예보 | ❌ |
| **MET Norway (Yr.no)** | 글로벌 보조 (~10일) | ❌ |
| **7Timer!** | 글로벌 보조 (~7일) | ❌ |
| **Open-Meteo Air Quality** | PM10/PM2.5 글로벌 | ❌ |
| **Open-Meteo Climate** | 17~30일 과거 30년 평균 (참고치) | ❌ |
| **Open-Meteo Geocoding** | 한글 위치 검색 | ❌ |
| **Nominatim (OpenStreetMap)** | 위치 검색 보조 | ❌ |
| **Kakao Local API** | 세차장 검색 + 주소→좌표 변환 | ✅ (선택) |

키를 추가하면 자동 활성화되는 어댑터 (구현은 일부만):
OpenWeather, Weatherbit, 기상청, 에어코리아, WAQI, IQAir.

### 🔑 카카오 키 설정 (세차장 기능)

세차장 검색은 카카오 REST API 키가 필요합니다 (개인 무료, 일 100,000건).

#### 로컬 개발
프로젝트 루트에 `keys.local.js` 생성 (gitignore 됨):
```js
window.CWC_KEYS = { kakao: 'YOUR_REST_API_KEY' };
```

#### GitHub Pages 배포
GitHub repo Settings → Secrets → Actions → `KAKAO_KEY` 등록.
배포 시 자동으로 `keys.public.js`가 생성됩니다.

#### 키 발급 방법
1. https://developers.kakao.com → 앱 추가 → REST API 키 복사
2. 앱 설정 → 플랫폼 → Web 도메인 등록 (`http://localhost:8080`, 배포 URL)
3. 카카오 로그인 OFF → "OPEN_MAP_AND_LOCAL" 서비스 활성화

## 📁 폴더 구조

```
car-wash-checker/
├── index.html
├── style.css
├── .nojekyll                      (GitHub Pages underscore 파일 허용)
├── data/
│   ├── cities.json                (12개 주요 도시 + 글로벌)
│   └── districts.json             (한국 80+ 구·시 좌표)
├── src/
│   ├── app.js                     (부트스트랩, 상태 머신, 위치/검색/세차장)
│   ├── config.js                  (키, 활성 소스, 캐시 TTL)
│   ├── location.js                (GPS, 도시 폴백, isKorea, 손상 데이터 검증)
│   ├── aggregator.js              (Promise.allSettled, 어댑터 호출)
│   ├── consensus.js               (가중 평균 + IQR + 강수 차이 보정)
│   ├── scoring.js                 (점수 산출, 강수량+확률 조합)
│   ├── weatherKind.js             (날씨 분류: rain/snow/sun/cloud/wind)
│   ├── animations.js              (날씨별 SVG 애니메이션)
│   ├── render.js                  (DOM 렌더, sparkline, 메트릭 카드)
│   ├── airQuality.js              (대기질 등급/색상 헬퍼)
│   ├── gear.js                    (날씨별 추천 장비 칩)
│   └── adapters/
│       ├── _base.js               (httpJson, timeout, 거리/날짜 헬퍼)
│       ├── openMeteo.js
│       ├── metNorway.js
│       ├── sevenTimer.js
│       ├── openMeteoAir.js
│       ├── openMeteoClimate.js
│       ├── geocoding.js           (Open-Meteo + Nominatim 위치 검색)
│       └── kakaoLocal.js          (세차장 키워드/주소 검색)
└── .github/workflows/
    └── deploy.yml                 (자동 배포 + 키 주입)
```

## 🎨 디자인 메모

- **PC/모바일 모두 라이트 고정** (다크모드 자동 전환 비활성)
- **모바일 ≤480px**: today-card 좌우 2분할 (해 SVG ↔ 점수 게이지), 메트릭 4열
- **카드 그리드 통일**: 도시(파란색) / 구(파란색) / 동(초록색) auto-fill minmax(110px)
- **글래스 효과 제거**: 14일 예보 카드도 PC에서 흰 배경 (모바일 가시성 통일)

## 📝 라이선스

MIT
