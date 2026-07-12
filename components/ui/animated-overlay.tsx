'use client';

import React, { useEffect } from 'react';
import { useOverlayTransition } from '@/hooks/use-overlay-transition';

// 커스텀 오버레이 공통 껍데기 — 열림/닫힘에 iOS26풍 슬라이드업·줌 + 페이드 전환을 입힌다.
// 부모가 {open && <AnimatedOverlay .../>} 로 조건부 마운트하면, 닫기 요청 시 exit 애니메이션을 재생한 뒤 언마운트한다.
// 훅이 이 컴포넌트 안에 있으므로 매 열림마다 closing 이 초기화돼 재열림 시 exit 잔상이 없다.
// children 은 렌더프롭으로 requestClose 를 받아 내부 X/버튼도 같은 전환을 타게 한다.
const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';

interface AnimatedOverlayProps {
  onClose: () => void;
  // bottom = 모바일 하단 시트(데스크톱 중앙), center = 항상 중앙 다이얼로그
  align: 'bottom' | 'center';
  backdropClassName?: string;
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
  backdropStyle?: React.CSSProperties;
  role?: string;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  children: React.ReactNode | ((requestClose: () => void) => React.ReactNode);
}

export function AnimatedOverlay({
  onClose,
  align,
  backdropClassName = '',
  panelClassName = '',
  panelStyle,
  backdropStyle,
  role = 'dialog',
  ariaLabel,
  closeOnBackdrop = true,
  closeOnEscape = false,
  lockScroll = false,
  children,
}: AnimatedOverlayProps) {
  const { closing, requestClose } = useOverlayTransition(onClose);

  // ESC 로 닫기 — 입력 중(input/textarea/select)에는 취소용으로 남겨둔다.
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnEscape, requestClose]);

  useEffect(() => {
    if (!lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lockScroll]);

  const panelMotion = align === 'bottom'
    ? (closing ? 'animate-out slide-out-to-bottom-4 fade-out-0' : 'animate-in slide-in-from-bottom-4 fade-in-0')
    : (closing ? 'animate-out zoom-out-95 fade-out-0' : 'animate-in zoom-in-95 fade-in-0');
  const backdropMotion = closing ? 'animate-out fade-out-0' : 'animate-in fade-in-0';

  return (
    <div
      className={`${backdropClassName} duration-[260ms] ${EASE} ${backdropMotion}`}
      style={backdropStyle}
      onClick={closeOnBackdrop ? requestClose : undefined}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className={`${panelClassName} duration-[260ms] ${EASE} ${panelMotion}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {typeof children === 'function'
          ? (children as (requestClose: () => void) => React.ReactNode)(requestClose)
          : children}
      </div>
    </div>
  );
}
