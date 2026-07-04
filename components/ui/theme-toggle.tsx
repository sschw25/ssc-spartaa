'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// 라이트/다크 토글 — next-themes 기반. 하이드레이션 전에는 아이콘만 중립으로.
export function ThemeToggle({ className, variant = 'row' }: { className?: string; variant?: 'row' | 'icon' }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  const toggle = () => {
    haptic('tap');
    setTheme(isDark ? 'light' : 'dark');
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        className={cn('press-spring grid place-items-center', className)}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn('press-spring flex items-center gap-3', className)}
    >
      {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      <span>{mounted ? (isDark ? '라이트 모드' : '다크 모드') : '테마'}</span>
    </button>
  );
}
