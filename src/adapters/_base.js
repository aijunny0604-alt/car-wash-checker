// 모든 어댑터가 사용하는 공통 fetch 래퍼.
// - timeout (AbortController)
// - HTTP 비정상 시 throw
// - 헤더는 호출자가 추가 가능

import { FETCH_TIMEOUT_MS } from '../config.js';

export async function httpJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function httpText(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 안전한 평균 (null/undefined 무시)
export function safeAvg(nums) {
  const valid = nums.filter(n => Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// YYYY-MM-DD 로컬
export function toIsoDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
