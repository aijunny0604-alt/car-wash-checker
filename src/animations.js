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
      </defs>
      <g class="sun-rays">
        ${rayLines(12)}
      </g>
      <circle cx="100" cy="100" r="38" fill="url(#sunGrad)" class="sun-body"/>
    </svg>
  `;
}
function drawSunHot(stage) {
  drawSun(stage);
  // 더위 반짝임 추가 (지면 위 아른거림)
  const heat = document.createElement('div');
  heat.className = 'heat-haze';
  stage.appendChild(heat);
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
  // 200x200 viewBox 안에 cloud 3개 — 위쪽 마진을 충분히 두어 잘림 방지
  // cloud는 (cx, cy) 중심에 ellipse가 위쪽으로 ry=14 만큼 올라가므로 cy >= 30 권장
  stage.innerHTML = `
    <svg viewBox="0 0 200 200" class="anim-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${cloud(50, 90, 0.9, 'cloud-a')}
      ${cloud(130, 110, 0.78, 'cloud-b')}
      ${cloud(80, 145, 0.65, 'cloud-c')}
    </svg>
  `;
}
function cloud(x, y, scale, cls) {
  return `
    <g class="${cls}" transform="translate(${x} ${y}) scale(${scale})">
      <ellipse cx="0"  cy="0" rx="22" ry="14" fill="#fff" opacity="0.92"/>
      <ellipse cx="20" cy="-6" rx="20" ry="14" fill="#fff" opacity="0.92"/>
      <ellipse cx="40" cy="2"  rx="22" ry="14" fill="#fff" opacity="0.92"/>
      <ellipse cx="20" cy="6"  rx="32" ry="12" fill="#fff" opacity="0.92"/>
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
    d.style.left = `${Math.random() * 100}%`;
    d.style.animationDelay = `${(Math.random() * 1.2).toFixed(2)}s`;
    d.style.animationDuration = `${(0.6 + Math.random() * 0.6).toFixed(2)}s`;
    d.style.opacity = (0.4 + Math.random() * 0.5).toFixed(2);
    drops.appendChild(d);
  }
  stage.appendChild(drops);
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
