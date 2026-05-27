// HUD 모드 — 다크 홀로그램 룩 + 자이로/마우스 시차.
// body.hud 클래스 토글로 모든 스타일 활성화. 기존 render.js / app.js 무손상.

const LS_KEY = 'cwc.hud';
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=JetBrains+Mono:wght@500;700&display=swap';

let tiltActive = false;
let lastOrientTs = 0;
let rafId = 0;
let latest = { beta: 30, gamma: 0 };

function ensureFont() {
  if (document.getElementById('hud-font')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  document.head.appendChild(pre1);
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = 'anonymous';
  document.head.appendChild(pre2);
  const link = document.createElement('link');
  link.id = 'hud-font';
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

function applyTilt() {
  rafId = 0;
  const clamp = (v, m = 1) => Math.max(-m, Math.min(m, v));
  // gamma: 좌우 기울임 (-90..90), beta: 앞뒤 기울임 (-180..180, 정상 폰 들면 ~30)
  const tx = clamp(latest.gamma / 25);
  const ty = clamp((latest.beta - 30) / 25);
  const r = document.documentElement;
  r.style.setProperty('--tilt-x', tx.toFixed(3));
  r.style.setProperty('--tilt-y', ty.toFixed(3));
}

function onOrient(e) {
  if (e.beta == null && e.gamma == null) return;
  latest = { beta: e.beta ?? 30, gamma: e.gamma ?? 0 };
  lastOrientTs = Date.now();
  if (!rafId) rafId = requestAnimationFrame(applyTilt);
}

function onMouse(e) {
  if (!document.body.classList.contains('hud')) return;
  // 폰 자이로가 들어오는 중이면 마우스 무시 (모바일에서 둘 다 발생 가능)
  if (Date.now() - lastOrientTs < 800) return;
  const tx = (e.clientX / window.innerWidth - 0.5) * 2;
  const ty = (e.clientY / window.innerHeight - 0.5) * 2;
  latest = { beta: 30 + ty * 25, gamma: tx * 25 };
  if (!rafId) rafId = requestAnimationFrame(applyTilt);
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function startTilt({ requestPermission = true } = {}) {
  if (tiltActive) return;
  // 감소 모션 사용자: 리스너/RAF 자체를 등록하지 않는다 (CSS도 transform 제거)
  if (prefersReducedMotion()) return;
  tiltActive = true;

  // iOS 13+ 권한 요청 — 사용자 제스처(토글 클릭) 내에서만 호출.
  // 페이지 로드 복원 경로(requestPermission=false)에서는 호출 금지 → 자동 거부 방지.
  if (requestPermission
      && typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') {
        console.info('[hud] DeviceOrientation 권한 거부 — 마우스 시차만 사용');
      }
    } catch (err) {
      console.info('[hud] DeviceOrientation 권한 요청 실패', err);
    }
  }

  window.addEventListener('deviceorientation', onOrient, { passive: true });
  window.addEventListener('mousemove', onMouse, { passive: true });
}

function stopTilt() {
  tiltActive = false;
  window.removeEventListener('deviceorientation', onOrient);
  window.removeEventListener('mousemove', onMouse);
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  const r = document.documentElement;
  r.style.removeProperty('--tilt-x');
  r.style.removeProperty('--tilt-y');
}

function setHud(on, { persist = true } = {}) {
  document.body.classList.toggle('hud', on);
  const btn = document.getElementById('hudToggleBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'HUD 끄기' : 'HUD 켜기';
    btn.textContent = on ? '🛸' : '🔭';
  }
  if (persist) {
    try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch {}
  }
  if (on) {
    ensureFont();
    // persist=false는 페이지 로드 복원 경로 → 사용자 제스처가 아니므로 권한 요청 보류.
    // 토글 클릭(persist=true)일 때만 iOS requestPermission 호출.
    startTilt({ requestPermission: persist });
  } else {
    stopTilt();
  }
}

function injectButton() {
  const header = document.querySelector('.app-header');
  if (!header || document.getElementById('hudToggleBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'hudToggleBtn';
  btn.className = 'icon-btn hud-toggle-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'HUD 모드 전환');
  btn.setAttribute('aria-pressed', 'false');
  btn.title = 'HUD 켜기';
  btn.textContent = '🔭';
  btn.addEventListener('click', () => {
    const next = !document.body.classList.contains('hud');
    setHud(next);
  });
  const settings = document.getElementById('settingsBtn');
  if (settings) header.insertBefore(btn, settings);
  else header.appendChild(btn);
}

function init() {
  injectButton();
  // 저장된 상태 복원 (단, iOS는 사용자 제스처 없이 권한 요청 못함 → tilt는 클릭 시 활성)
  let saved = '0';
  try { saved = localStorage.getItem(LS_KEY) || '0'; } catch {}
  if (saved === '1') setHud(true, { persist: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
