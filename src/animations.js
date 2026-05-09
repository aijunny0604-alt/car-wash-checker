// 날씨 시각화 애니메이션. 메인 카드 안의 .weather-stage 컨테이너에 그림.
// kind 값: sunny | sunny-hot | cloudy | rain | rain-heavy | snow | windy

const ANIMATIONS = {
  sunny:      drawSun,
  'sunny-hot': drawSunHot,
  cloudy:     drawCloudy,
  rain:       (el) => drawRain(el, 24),
  'rain-heavy': (el) => drawRain(el, 60),
  snow:       drawSnow,
  windy:      drawWindy,
};

export function renderWeatherAnimation(stage, kind) {
  // 같은 종류면 다시 그리지 않음 — 메인 카드가 새로 innerHTML 되더라도
  // app.js에서 이 함수 호출 직전에 stage가 비어 있으므로, 빈 경우에만 그림.
  if (stage.dataset.kind === kind && stage.children.length > 0) return;
  stage.innerHTML = '';
  stage.dataset.kind = kind;
  (ANIMATIONS[kind] || drawCloudy)(stage);
}

// ──────────────────────────────────────
// 햇빛: 회전하는 광선 + 본체
// ──────────────────────────────────────
function drawSun(stage) {
  stage.innerHTML = `
    <svg viewBox="0 0 200 200" class="anim-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff7c2"/>
          <stop offset="60%" stop-color="#ffd96a"/>
          <stop offset="100%" stop-color="#ff9d3b"/>
        </radialGradient>
        <radialGradient id="sunHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff7c2" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#fff7c2" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="70" fill="url(#sunHalo)" class="sun-halo"/>
      <g class="sun-rays">
        ${rayLines(12)}
      </g>
      <circle cx="100" cy="100" r="38" fill="url(#sunGrad)" class="sun-body"/>
    </svg>
  `;
  addSunParticles(stage, 8);
}
function drawSunHot(stage) {
  drawSun(stage);
  // 더위 반짝임 + 햇살 입자
  const heat = document.createElement('div');
  heat.className = 'heat-haze';
  stage.appendChild(heat);
  addSunParticles(stage, 14);
}
function addSunParticles(stage, count = 10) {
  const layer = document.createElement('div');
  layer.className = 'sun-particles';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'sun-particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.top  = `${Math.random() * 100}%`;
    p.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
    p.style.animationDuration = `${(3 + Math.random() * 3).toFixed(2)}s`;
    p.style.opacity = (0.4 + Math.random() * 0.4).toFixed(2);
    layer.appendChild(p);
  }
  stage.appendChild(layer);
}
function rayLines(n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i;
    s += `<line x1="100" y1="40" x2="100" y2="20" stroke="#ffcd55" stroke-width="4" stroke-linecap="round" transform="rotate(${angle} 100 100)" />`;
  }
  return s;
}

// ──────────────────────────────────────
// 구름
// ──────────────────────────────────────
function drawCloudy(stage) {
  // 구름 path 폭 ~80, 높이 ~44. 200×200 viewBox에 3개 — 자연스러운 분포
  stage.innerHTML = `
    <svg viewBox="0 0 200 200" class="anim-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${cloud(60, 35, 1.05, 'cloud-a')}
      ${cloud(20, 70, 0.75, 'cloud-b')}
      ${cloud(110, 90, 0.85, 'cloud-c')}
    </svg>
  `;
}
function cloud(x, y, scale, cls) {
  // 자연스러운 구름 - path로 부드러운 윤곽 + 그라데이션 음영
  // 바닥은 평평, 위는 부풀어 오른 형태. width ~80, height ~44.
  const id = `cg-${cls}`;
  return `
    <g class="${cls}" transform="translate(${x} ${y}) scale(${scale})">
      <defs>
        <linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stop-color="#ffffff"/>
          <stop offset="65%" stop-color="#f3f6fa"/>
          <stop offset="100%" stop-color="#dde4ec"/>
        </linearGradient>
      </defs>
      <!-- 메인 구름 윤곽 (path) -->
      <path d="
        M 8 32
        C 2 32, 0 24, 6 20
        C 2 12, 12 4, 20 8
        C 22 0, 36 -2, 42 6
        C 50 0, 64 4, 66 14
        C 76 14, 80 24, 74 30
        C 78 36, 72 42, 64 40
        L 14 40
        C 6 42, 2 38, 8 32 Z
      " fill="url(#${id})" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>
      <!-- 위쪽 하이라이트 -->
      <ellipse cx="28" cy="10" rx="14" ry="5" fill="#fff" opacity="0.7"/>
      <!-- 바닥 살짝 그림자 -->
      <ellipse cx="38" cy="42" rx="34" ry="3" fill="#0f172a" opacity="0.10"/>
    </g>
  `;
}

// ──────────────────────────────────────
// 비
// ──────────────────────────────────────
function drawRain(stage, dropCount = 24) {
  drawCloudy(stage); // 위에 구름 깔기
  const drops = document.createElement('div');
  drops.className = 'rain-layer';
  for (let i = 0; i < dropCount; i++) {
    const d = document.createElement('span');
    d.className = 'rain-drop';
    // 가로 위치
    const left = Math.random() * 100;
    d.style.left = `${left}%`;
    // 시작 위치 (구름 아래에서 떨어지듯)
    d.style.top = `${20 + Math.random() * 30}%`;
    // 빗방울 길이/굵기 다양화
    const len = 8 + Math.random() * 14;        // 8~22px
    const thickness = 1 + Math.random() * 1.5; // 1~2.5px
    d.style.height = `${len}px`;
    d.style.width  = `${thickness}px`;
    // 살짝 기울어짐 (대각선)
    const tilt = -8 + Math.random() * 4;
    d.style.transform = `rotate(${tilt}deg)`;
    // 타이밍 다양화
    d.style.animationDelay = `${(Math.random() * 1.6).toFixed(2)}s`;
    d.style.animationDuration = `${(0.45 + Math.random() * 0.7).toFixed(2)}s`;
    d.style.opacity = (0.35 + Math.random() * 0.55).toFixed(2);
    // 일부는 더 흐릿하게 (depth)
    if (Math.random() < 0.3) d.style.filter = 'blur(0.6px)';
    drops.appendChild(d);
  }
  // 바닥 splash 파티클
  const splashLayer = document.createElement('div');
  splashLayer.className = 'rain-splash-layer';
  for (let i = 0; i < Math.floor(dropCount / 4); i++) {
    const s = document.createElement('span');
    s.className = 'rain-splash';
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
    s.style.animationDuration = `${(0.6 + Math.random() * 0.4).toFixed(2)}s`;
    splashLayer.appendChild(s);
  }
  stage.appendChild(drops);
  stage.appendChild(splashLayer);
}

// ──────────────────────────────────────
// 눈
// ──────────────────────────────────────
function drawSnow(stage) {
  drawCloudy(stage);
  const snow = document.createElement('div');
  snow.className = 'snow-layer';
  for (let i = 0; i < 30; i++) {
    const f = document.createElement('span');
    f.className = 'snowflake';
    f.textContent = '❄';
    f.style.left = `${Math.random() * 100}%`;
    f.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
    f.style.animationDuration = `${(4 + Math.random() * 4).toFixed(2)}s`;
    f.style.fontSize = `${(8 + Math.random() * 12).toFixed(0)}px`;
    f.style.opacity = (0.5 + Math.random() * 0.5).toFixed(2);
    snow.appendChild(f);
  }
  stage.appendChild(snow);
}

// ──────────────────────────────────────
// 바람 (강풍)
// ──────────────────────────────────────
function drawWindy(stage) {
  drawCloudy(stage);
  const wind = document.createElement('div');
  wind.className = 'wind-layer';
  for (let i = 0; i < 8; i++) {
    const line = document.createElement('span');
    line.className = 'wind-line';
    line.style.top = `${10 + i * 12}%`;
    line.style.animationDelay = `${(i * 0.15).toFixed(2)}s`;
    wind.appendChild(line);
  }
  stage.appendChild(wind);
}
