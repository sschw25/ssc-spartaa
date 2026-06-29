'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ClipboardList, Inbox, Trophy, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  match?: (pathname: string) => boolean;
};

const TABS: TabItem[] = [
  { icon: Home, label: '홈', href: '/admin/dashboard' },
  { icon: ClipboardList, label: '출결', href: '/admin/attendance' },
  { icon: Inbox, label: '인박스', href: '/admin/inbox' },
  { icon: Trophy, label: '랭킹', href: '/admin/leaderboard' },
  { icon: Sparkles, label: '미션', href: '/admin/missions' },
];

/**
 * iOS 26 Liquid Glass 하단 플로팅 탭바.
 * 떠 있는 유리 크롬(glass-strong) + 활성 탭은 파랑 틴트 캡슐.
 * 전 어드민 페이지 공용 — 핵심 목적지 빠른 이동.
 */
export function AdminGlassTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      aria-label="빠른 이동"
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pointer-events-none"
    >
      <div className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-full p-1.5">
        {TABS.map((tab) => {
          const active = tab.match ? tab.match(pathname) : pathname === tab.href;
          const Icon = tab.icon;
          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => router.push(tab.href)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-full px-3.5 py-2 transition-all duration-300 active:scale-[0.94]',
                active
                  ? 'bg-[#0071E3]/12 text-[#0071E3]'
                  : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04]'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className={cn('text-[10px] tracking-tight', active ? 'font-semibold' : 'font-bold')}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
