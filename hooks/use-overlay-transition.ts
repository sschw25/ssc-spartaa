'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
// 커스텀 오버레이 닫힘 전환 — closing=true 로 exit 애니메이션을 재생한 뒤 duration 후 실제 onClose 호출.
// 기본 300ms — Radix dialog/alert-dialog 전환과 동일(시스템 일관).
export function useOverlayTransition(onClose: () => void, duration = 300) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(onClose, duration);
  }, [onClose, duration]);
  // 언마운트 시 잔여 타이머 정리 — 닫힘 도중 부모가 먼저 사라져도 onClose 가 유령 호출되지 않게.
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);
  return { closing, requestClose };
}
