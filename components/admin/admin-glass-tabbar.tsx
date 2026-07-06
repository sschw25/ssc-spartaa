'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Users,
  ClipboardList,
  MessageSquare,
  BarChart3,
  BookOpen,
  CalendarClock,
  UserPlus,
  LayoutGrid,
  ClipboardCheck,
  Utensils,
  Shield,
  CalendarHeart,
  CalendarDays,
  AlarmClock,
  Inbox,
  Trophy,
  Sparkles,
  Ticket,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { navigateWithTransition } from '@/lib/view-transition';

type SubItem = { icon: LucideIcon; label: string; href: string };
type TabGroup = {
  key: string;
  icon: LucideIcon;
  label: string;
  /** 바로 이동하는 단일 목적지 (팝오버 없음) */
  href?: string;
  /** 팝오버로 펼치는 하위 화면들 */
  items?: SubItem[];
};

// 사이드바(AdminMenuList) 섹션 구성을 하단 슈퍼탭으로 그대로 반영.
const GROUPS: TabGroup[] = [
  { key: 'home', icon: Home, label: '홈', href: '/admin/dashboard' },
  {
    key: 'students',
    icon: Users,
    label: '학생',
    items: [
      { icon: BookOpen, label: '학생 종합 관리', href: '/admin/consultation' },
      { icon: CalendarClock, label: '상담 예약', href: '/admin/consultation-bookings' },
      { icon: UserPlus, label: '가입신청', href: '/admin/applications' },
    ],
  },
  {
    key: 'attendance',
    icon: ClipboardList,
    label: '출결·생활',
    items: [
      { icon: ClipboardList, label: '출결 상세', href: '/admin/attendance' },
      { icon: LayoutGrid, label: '좌석 현황판', href: '/admin/seat-board' },
      { icon: ClipboardCheck, label: '모의고사', href: '/admin/mock-exam' },
      { icon: CalendarClock, label: 'OT 참여', href: '/admin/ot-events' },
      { icon: Utensils, label: '도시락 신청', href: '/admin/meals' },
      { icon: Shield, label: '벌점·상점', href: '/admin/penalties' },
      { icon: CalendarHeart, label: '휴식·반차', href: '/admin/leave-requests' },
      { icon: Ticket, label: '쿠폰', href: '/admin/leave' },
    ],
  },
  {
    key: 'comms',
    icon: MessageSquare,
    label: '소통',
    items: [
      { icon: Inbox, label: '통합 인박스', href: '/admin/inbox' },
      { icon: MessageSquare, label: '메시지 발송', href: '/admin/messages' },
      { icon: CalendarDays, label: '캘린더', href: '/admin/calendar' },
      { icon: AlarmClock, label: '예약 스케줄', href: '/admin/schedules' },
    ],
  },
  {
    key: 'stats',
    icon: BarChart3,
    label: '통계',
    items: [
      { icon: Trophy, label: '순공 랭킹', href: '/admin/leaderboard' },
      { icon: Sparkles, label: '쿠폰 미션', href: '/admin/missions' },
      { icon: HeartPulse, label: '케어 지수', href: '/admin/health-score' },
    ],
  },
];

/**
 * iOS 26 Liquid Glass 하단 그룹 슈퍼탭.
 * 홈은 바로 이동하고, 나머지 그룹은 탭하면 유리 팝오버로 하위 화면을 펼친다.
 * 섹션 구성은 사이드바(AdminMenuList)와 동일 — 모든 관리자 화면을 하단바에서 도달.
 */
export function AdminGlassTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [openKey, setOpenKey] = React.useState<string | null>(null);

  // 라우트가 바뀌면 열린 팝오버를 닫는다.
  React.useEffect(() => {
    setOpenKey(null);
  }, [pathname]);

  const isGroupActive = (g: TabGroup) =>
    g.href ? pathname === g.href : !!g.items?.some((i) => pathname === i.href);

  const handleTab = (g: TabGroup) => {
    haptic('select');
    if (g.href) {
      navigateWithTransition(() => router.push(g.href!));
      setOpenKey(null);
    } else {
      setOpenKey((k) => (k === g.key ? null : g.key));
    }
  };

  const openGroup = GROUPS.find((g) => g.key === openKey);

  return (
    <nav
      aria-label="빠른 이동"
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      {/* 팝오버 바깥 클릭 시 닫기 */}
      <AnimatePresence>
        {openKey && (
          <motion.button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 -z-10 cursor-default bg-transparent pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpenKey(null)}
          />
        )}
      </AnimatePresence>

      {/* 그룹 팝오버 */}
      <AnimatePresence mode="wait">
        {openGroup?.items && (
          <motion.div
            key={openGroup.key}
            className="glass-strong pointer-events-auto w-[min(88vw,340px)] rounded-3xl p-2"
            style={{ transformOrigin: 'bottom center' }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {openGroup.label}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {openGroup.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      haptic('select');
                      setOpenKey(null);
                      navigateWithTransition(() => router.push(item.href));
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'press-spring flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'bg-[#0071E3]/12 text-[#0071E3]'
                        : 'text-slate-600 hover:bg-black/[0.04] dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-100'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#0071E3]" />
                    <span className="min-w-0 truncate text-[12px] font-bold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 슈퍼탭 바 */}
      <div className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-full p-1.5">
        {GROUPS.map((group) => {
          const active = isGroupActive(group);
          const open = openKey === group.key;
          const Icon = group.icon;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => handleTab(group)}
              aria-current={active ? 'page' : undefined}
              aria-expanded={group.items ? open : undefined}
              className={cn(
                'press-spring flex min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 transition-colors duration-300',
                active || open
                  ? 'bg-[#0071E3]/12 text-[#0071E3]'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-black/[0.04]'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className={cn('text-[10px] tracking-tight', active || open ? 'font-semibold' : 'font-bold')}>
                {group.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
