# 🚗 세차해도 될까? (car-wash-checker)

> **여러 무료 날씨 API를 동시에 호출해 가중 합의로 종합한 뒤, 오늘부터 30일치 세차 가능 점수**를 알려주는 정적 웹 앱

날씨·미세먼지·기온/습도·풍속을 모두 보고 0–100점으로 산출, 🟢 OK / 🟡 보류 / 🔴 비추천으로 한눈에 판단합니다.

## ✨ 주요 기능

- 📍 **GPS 자동 감지** + 도시 수동 선택 폴백
- 🌐 **무료 API 다중 종합** (Open-Meteo · MET Norway · Open-Meteo AQ + Climate API)
- 🎯 **가중 합의 + IQR 이상치 제거**로 한 소스가 튀어도 결과 안정
- 📅 **세차 예정일 직접 선택** (날짜 입력 + 7일 카드 클릭 + 🏆 최적일 자동 추천)
- 🗓 **7 / 14 / 16 / 30일 토글** (17~30일은 과거 30년 평균 기반 참고치)
- ☀️🌧❄️ **날씨별 동적 그라데이션 배경 + SVG 애니메이션** (회전 태양, 떨어지는 비/눈, 표류하는 구름, 강풍 라인)
- 📊 **시간별 강수확률 + 기온 그래프** (Y축 라벨, 그리드, 막대형)
- ⚡ **부드러운 전환 애니메이션** — 카드 페이드, sparkline path morph, 인디케이터 슬라이드
- 🌙 다크모드 자동 (`prefers-color-scheme`)

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

## 📊 점수 / 등급

| 등급 | 점수 | 설명 |
|------|------|------|
| 🟢 OK | 80 이상 | 세차 권장 |
| 🟡 보류 | 50–79 | 가능하지만 신중 |
| 🔴 비추천 | 49 이하 | 다른 날 추천 |

**가중치**: 강수 40 + 대기질 25 + 기온 15 + 습도 10 + 풍속 10 (총 100점)

대기질 데이터가 없으면 75점 만점을 100점으로 정규화합니다.

## 🌐 데이터 소스 (키 없이 즉시 동작)

| API | 용도 | 키 |
|-----|------|----|
| **Open-Meteo Forecast** | 1~16일 정확 예보 | ❌ |
| **MET Norway (Yr.no)** | 글로벌 보조 (~10일) | ❌ |
| **Open-Meteo Air Quality** | PM10/PM2.5 글로벌 | ❌ |
| **Open-Meteo Archive** | 17~30일 과거 5년 평균 (참고치) | ❌ |

키를 추가하면 자동 활성화되는 어댑터:
OpenWeather, Weatherbit, 기상청, 에어코리아, WAQI, IQAir.

### 키 주입 (선택)

`index.html` `<head>` 에 추가하거나, 별도 `keys.local.js`(git-ignore 됨):

```html
<script>
  window.CWC_KEYS = {
    openWeather: 'YOUR_KEY',
    waqi:        'YOUR_TOKEN',
    // ...
  };
</script>
```

## 📁 폴더 구조

```
car-wash-checker/
├── index.html
├── style.css
├── data/cities.json
├── src/
│   ├── app.js              (부트스트랩, 상태 머신, 인디케이터)
│   ├── config.js           (키, 활성 소스, 캐시 TTL)
│   ├── location.js         (GPS, 도시 폴백, isKorea)
│   ├── aggregator.js       (Promise.allSettled, 어댑터 호출)
│   ├── consensus.js        (가중 평균 + IQR 이상치 제거)
│   ├── scoring.js          (순수 함수, 점수 산출)
│   ├── weatherKind.js      (날씨 분류: rain/snow/sun/cloud/wind)
│   ├── animations.js       (날씨별 SVG 애니메이션)
│   ├── render.js           (DOM 렌더, sparkline)
│   └── adapters/
│       ├── _base.js
│       ├── openMeteo.js
│       ├── metNorway.js
│       ├── sevenTimer.js
│       ├── openMeteoAir.js
│       └── openMeteoClimate.js
└── docs/                   (PDCA 문서)
    ├── 01-plan/
    └── 02-design/
```

## 🛠 PDCA 방법론 적용

- **Plan**: [docs/01-plan/features/car-wash-checker.plan.md](docs/01-plan/features/car-wash-checker.plan.md)
- **Design**: [docs/02-design/features/car-wash-checker.design.md](docs/02-design/features/car-wash-checker.design.md)

## 📝 라이선스

MIT
