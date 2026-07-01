'use client';

import React from 'react';
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CalendarClock,
  CalendarHeart,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Plus,
  ScanLine,
  Search,
  Shield,
  Trophy,
  Inbox,
  Sparkles,
  UserPlus,
  Utensils,
  PinOff,
  Pin,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type AdminSession = { id: string; username: string; campus: string; role: string } | null;

type AdminMenuListProps = {
  pathname: string;
  adminSession: AdminSession;
  /** PC 고정 상태 — 헤더의 토글 버튼 모양 결정 */
  pinned: boolean;
  onTogglePin: () => void;
  onNavigate: (href: string) => void;
  onSearchStudent: () => void;
  onAddStudent: () => void;
  onOpenKiosk: () => void;
  onLogout: () => void;
};

type MenuItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  /** 라우팅 대상 — 있으면 onNavigate, 없으면 action 사용 */
  href?: string;
  /** href가 없는 항목(검색·추가·키오스크)의 동작 */
  action?: () => void;
};

type MenuSection = {
  key: string;
  title: string;
  items: MenuItem[];
};

const STORAGE_KEY = 'ssc-admin-menu-collapsed';

/**
 * 어드민 좌측 메뉴 본문 — 오버레이 Sheet와 PC 고정 사이드바가 공유.
 * 섹션 헤더를 눌러 각 그룹을 접고 펼 수 있으며, 접힘 상태는 localStorage에 저장된다.
 * 헤더의 고정/해제 버튼은 데스크톱(lg+)에서만 노출된다.
 */
export function AdminMenuList({
  pathname,
  adminSession,
  pinned,
  onTogglePin,
  onNavigate,
  onSearchStudent,
  onAddStudent,
  onOpenKiosk,
  onLogout,
}: AdminMenuListProps) {
  const isSuper = !!adminSession && (adminSession.campus === 'all' || adminSession.role === 'super');

  const sections: MenuSection[] = [
    {
      key: 'main',
      title: '메인',
      items: [
        { key: 'dashboard', icon: Home, label: '홈 대시보드', href: '/admin/dashboard' },
        { key: 'inbox', icon: Inbox, label: '통합 인박스', href: '/admin/inbox' },
        { key: 'calendar', icon: CalendarDays, label: '캘린더', href: '/admin/calendar' },
      ],
    },
    {
      key: 'students',
      title: '원생 관리',
      items: [
        { key: 'consultation', icon: BookOpen, label: '원생 종합 관리', href: '/admin/consultation' },
        { key: 'consultation-bookings', icon: CalendarClock, label: '상담 예약', href: '/admin/consultation-bookings' },
        { key: 'applications', icon: UserPlus, label: '가입신청', href: '/admin/applications' },
        { key: 'search', icon: Search, label: '학생 검색', action: onSearchStudent },
        { key: 'add', icon: Plus, label: '학생 추가', action: onAddStudent },
      ],
    },
    {
      key: 'attendance',
      title: '출결 · 생활',
      items: [
        { key: 'attendance', icon: ClipboardList, label: '출결 상세', href: '/admin/attendance' },
        { key: 'seat-board', icon: LayoutGrid, label: '좌석 현황판', href: '/admin/seat-board' },
        { key: 'kiosk', icon: ScanLine, label: '등하원 체크 ↗', action: onOpenKiosk },
        { key: 'mock-exam', icon: ClipboardCheck, label: '모의고사 참여 체크', href: '/admin/mock-exam' },
        { key: 'ot-events', icon: CalendarClock, label: 'OT 참여 관리', href: '/admin/ot-events' },
        { key: 'meals', icon: Utensils, label: '도시락 신청', href: '/admin/meals' },
        { key: 'penalties', icon: Shield, label: '벌점 · 상점 관리', href: '/admin/penalties' },
        { key: 'leave-requests', icon: CalendarHeart, label: '휴식 · 반차 관리', href: '/admin/leave-requests' },
        { key: 'leave', icon: Calendar, label: '휴가 쿠폰 관리', href: '/admin/leave' },
      ],
    },
    {
      key: 'comms',
      title: '소통',
      items: [{ key: 'messages', icon: MessageSquare, label: '메시지 발송', href: '/admin/messages' }],
    },
    {
      key: 'stats',
      title: '통계',
      items: [
        { key: 'leaderboard', icon: Trophy, label: '순공 랭킹', href: '/admin/leaderboard' },
        { key: 'missions', icon: Sparkles, label: '쿠폰 미션 설정', href: '/admin/missions' },
        { key: 'health-score', icon: HeartPulse, label: '케어 지수', href: '/admin/health-score' },
      ],
    },
    ...(isSuper
      ? [
          {
            key: 'settings',
            title: '설정',
            items: [{ key: 'accounts', icon: Shield, label: '관리자 계정 관리', href: '/admin/accounts' }],
          } as MenuSection,
        ]
      : []),
  ];

  // 섹션별 접힘 상태 — localStorage에 저장해 Sheet/사이드바/새로고침 간 유지
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      /* localStorage 접근 불가 시 무시 */
    }
  }, []);

  const toggleSection = (key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패 무시 */
      }
      return next;
    });
  };

  const menuButtonClass = (active: boolean) =>
    cn(
      'flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-[#1D1D1F]',
      active ? 'bg-[#F5F5F7]' : 'hover:bg-[#F5F5F7]'
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-black/[0.05] p-5">
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-2 text-base font-semibold text-[#1D1D1F]">
            <span className="rounded-lg bg-[#1D1D1F] px-2.5 py-1.5 text-sm font-semibold text-white">SSC</span>
            관리자 메뉴
          </div>
          <p className="mt-1 text-xs font-semibold text-[#86868B]">자주 쓰는 관리자 화면으로 이동합니다.</p>
        </div>
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          title={pinned ? '메뉴 고정 해제' : '메뉴 왼쪽 고정'}
          className={cn(
            'hidden lg:flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold transition-premium',
            pinned
              ? 'bg-[#0071E3]/12 text-[#0071E3] hover:bg-[#0071E3]/18'
              : 'text-[#86868B] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]'
          )}
        >
          {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {pinned ? '해제' : '고정'}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {sections.map((section) => {
          const isCollapsed = !!collapsed[section.key];
          return (
            <div key={section.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                aria-expanded={!isCollapsed}
                className="group mt-3 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#86868B] transition-premium hover:bg-[#F5F5F7] hover:text-[#1D1D1F] first:mt-1"
              >
                <span>{section.title}</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-300',
                    isCollapsed && '-rotate-90'
                  )}
                />
              </button>
              <div
                className={cn(
                  'grid transition-all duration-300 ease-out',
                  isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="flex flex-col gap-1 pt-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = item.href ? pathname === item.href : false;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => (item.href ? onNavigate(item.href) : item.action?.())}
                          className={menuButtonClass(active)}
                        >
                          <Icon className="w-4 h-4 text-[#0071E3]" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto border-t border-black/[0.05] p-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-red-600 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </div>
  );
}
