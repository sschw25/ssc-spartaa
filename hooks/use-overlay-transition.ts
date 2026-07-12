'use client';
import { useCallback, useState } from 'react';
// 커스텀 오버레이 닫힘 전환 — closing=true 로 exit 애니메이션을 재생한 뒤 duration 후 실제 onClose 호출.
export function useOverlayTransition(onClose: () => void, duration = 260) {
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    setClosing((c) => {
      if (c) return c;
      window.setTimeout(onClose, duration);
      return true;
    });
  }, [onClose, duration]);
  return { closing, requestClose };
}
