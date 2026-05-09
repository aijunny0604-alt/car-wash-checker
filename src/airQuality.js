// 대기질 등급 분류 (한국 환경부 기준)
// PM10:  0~30 좋음, 31~80 보통, 81~150 나쁨, 151+ 매우 나쁨
// PM2.5: 0~15 좋음, 16~35 보통, 36~75 나쁨, 76+ 매우 나쁨

export function gradePM10(v) {
  if (!Number.isFinite(v)) return null;
  if (v <= 30)  return { grade: 'good',     label: '좋음',     color: '#10b981', icon: '😊', max: 30 };
  if (v <= 80)  return { grade: 'moderate', label: '보통',     color: '#f59e0b', icon: '🙂', max: 80 };
  if (v <= 150) return { grade: 'bad',      label: '나쁨',     color: '#ef4444', icon: '😷', max: 150 };
  return            { grade: 'very-bad', label: '매우 나쁨', color: '#7c3aed', icon: '😨', max: 200 };
}

export function gradePM25(v) {
  if (!Number.isFinite(v)) return null;
  if (v <= 15) return { grade: 'good',     label: '좋음',     color: '#10b981', icon: '😊', max: 15 };
  if (v <= 35) return { grade: 'moderate', label: '보통',     color: '#f59e0b', icon: '🙂', max: 35 };
  if (v <= 75) return { grade: 'bad',      label: '나쁨',     color: '#ef4444', icon: '😷', max: 75 };
  return            { grade: 'very-bad', label: '매우 나쁨', color: '#7c3aed', icon: '😨', max: 100 };
}

// 종합 등급 (둘 중 더 나쁜 쪽)
export function overallAQGrade(pm10, pm25) {
  const order = ['good', 'moderate', 'bad', 'very-bad'];
  const a = gradePM10(pm10);
  const b = gradePM25(pm25);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return order.indexOf(a.grade) >= order.indexOf(b.grade) ? a : b;
}
