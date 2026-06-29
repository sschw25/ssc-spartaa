'use client';

import React from 'react';
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CalendarClock,
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
  PinOff,
  Pin,
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

/**
 * 어드민 좌측 메뉴 본문 — 오버레이 Sheet와 PC 고정 사이드바가 공유.
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

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {/* 메인 */}
        <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">메인</p>
        <button
          type="button"
          onClick={() => onNavigate('/admin/dashboard')}
          className={menuButtonClass(pathname === '/admin/dashboard')}
        >
          <Home className="w-4 h-4 text-[#0071E3]" />
          홈 대시보드
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/inbox')}
          className={menuButtonClass(pathname === '/admin/inbox')}
        >
          <Inbox className="w-4 h-4 text-[#0071E3]" />
          통합 인박스
        </button>

        {/* 원생 관리 */}
        <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">원생 관리</p>
        <button
          type="button"
          onClick={() => onNavigate('/admin/consultation')}
          className={menuButtonClass(pathname === '/admin/consultation')}
        >
          <BookOpen className="w-4 h-4 text-[#0071E3]" />
          원생 종합 관리
        </button>
        <button type="button" onClick={onSearchStudent} className={menuButtonClass(false)}>
          <Search className="w-4 h-4 text-[#0071E3]" />
          학생 검색
        </button>
        <button type="button" onClick={onAddStudent} className={menuButtonClass(false)}>
          <Plus className="w-4 h-4 text-[#0071E3]" />
          학생 추가
        </button>

        {/* 출결 · 생활 */}
        <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">출결 · 생활</p>
        <button
          type="button"
          onClick={() => onNavigate('/admin/attendance')}
          className={menuButtonClass(pathname === '/admin/attendance')}
        >
          <ClipboardList className="w-4 h-4 text-[#0071E3]" />
          출결 상세
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/seat-board')}
          className={menuButtonClass(pathname === '/admin/seat-board')}
        >
          <LayoutGrid className="w-4 h-4 text-[#0071E3]" />
          좌석 현황판
        </button>
        <button type="button" onClick={onOpenKiosk} className={menuButtonClass(false)}>
          <ScanLine className="w-4 h-4 text-[#0071E3]" />
          등하원 체크 ↗
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/mock-exam')}
          className={menuButtonClass(pathname === '/admin/mock-exam')}
        >
          <ClipboardCheck className="w-4 h-4 text-[#0071E3]" />
          모의고사 참여 체크
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/ot-events')}
          className={menuButtonClass(pathname === '/admin/ot-events')}
        >
          <CalendarClock className="w-4 h-4 text-[#0071E3]" />
          OT 참여 관리
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/penalties')}
          className={menuButtonClass(pathname === '/admin/penalties')}
        >
          <Shield className="w-4 h-4 text-[#0071E3]" />
          벌점 · 상점 관리
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/leave')}
          className={menuButtonClass(pathname === '/admin/leave')}
        >
          <Calendar className="w-4 h-4 text-[#0071E3]" />
          휴가 쿠폰 관리
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/leave/by-date')}
          className={menuButtonClass(pathname === '/admin/leave/by-date')}
        >
          <CalendarDays className="w-4 h-4 text-[#0071E3]" />
          날짜별 휴식·반차
        </button>

        {/* 소통 */}
        <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">소통</p>
        <button
          type="button"
          onClick={() => onNavigate('/admin/messages')}
          className={menuButtonClass(pathname === '/admin/messages')}
        >
          <MessageSquare className="w-4 h-4 text-[#0071E3]" />
          메시지 발송
        </button>

        {/* 통계 */}
        <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">통계</p>
        <button
          type="button"
          onClick={() => onNavigate('/admin/leaderboard')}
          className={menuButtonClass(pathname === '/admin/leaderboard')}
        >
          <Trophy className="w-4 h-4 text-[#0071E3]" />
          순공 랭킹
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/admin/missions')}
          className={menuButtonClass(pathname === '/admin/missions')}
        >
          <Sparkles className="w-4 h-4 text-[#0071E3]" />
          쿠폰 미션 설정
        </button>

        {/* 설정 (슈퍼 관리자용) */}
        {adminSession && (adminSession.campus === 'all' || adminSession.role === 'super') && (
          <>
            <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">설정</p>
            <button
              type="button"
              onClick={() => onNavigate('/admin/accounts')}
              className={menuButtonClass(pathname === '/admin/accounts')}
            >
              <Shield className="w-4 h-4 text-[#0071E3]" />
              관리자 계정 관리
            </button>
          </>
        )}
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
