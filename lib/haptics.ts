// 모바일 햅틱(진동) 헬퍼 — 네이티브 앱 같은 촉감을 위해 핵심 상호작용에 미세 진동을 준다.
// 지원 안 하는 기기/데스크톱에선 조용히 무시된다. prefers-reduced-motion 시 생략.

type HapticKind = 'tap' | 'select' | 'success' | 'warn';

const PATTERN: Record<HapticKind, number | number[]> = {
  tap: 7, // 버튼/토글 — 아주 짧게
  select: 10, // 탭 전환·선택
  success: [12, 40, 12], // 제출 성공·완료
  warn: [20, 60, 20], // 오류·경고
};

export function haptic(kind: HapticKind = 'tap') {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(PATTERN[kind]);
  } catch {
    /* 일부 브라우저는 사용자 제스처 밖 호출을 막음 — 무시 */
  }
}
