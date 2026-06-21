'use client';

import React, { ReactNode, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  Plus,
  ScanLine,
  Search,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type CampusOption = {
  value: string;
  label: string;
};

type AdminTopNavProps = {
  title: string;
  titleIcon?: ReactNode;
  campusOptions?: CampusOption[];
  campusValue?: string;
  onCampusChange?: (value: string) => void;
  actions?: ReactNode;
  onStudentSearch?: () => void;
  onStudentAdd?: () => void;
  onLogout?: () => void | Promise<void>;
};

export function AdminTopNav({
  title,
  titleIcon,
  campusOptions,
  campusValue,
  onCampusChange,
  actions,
  onStudentSearch,
  onStudentAdd,
  onLogout,
}: AdminTopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navigate = (href: string) => {
    setIsMenuOpen(false);
    router.push(href);
  };

  const openKiosk = () => {
    setIsMenuOpen(false);
    window.open('/attend/kiosk', '_blank');
  };

  const searchStudent = () => {
    setIsMenuOpen(false);
    if (onStudentSearch) {
      onStudentSearch();
      return;
    }
    router.push('/admin/consultation?focus=search');
  };

  const addStudent = () => {
    setIsMenuOpen(false);
    if (onStudentAdd) {
      onStudentAdd();
      return;
    }
    router.push('/admin/consultation?action=add');
  };

  const logout = async () => {
    setIsMenuOpen(false);
    if (onLogout) {
      await onLogout();
      return;
    }

    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin');
  };

  const menuButtonClass = (active: boolean) =>
    cn(
      'flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#1D1D1F]',
      active ? 'bg-[#F5F5F7]' : 'hover:bg-[#F5F5F7]'
    );

  return (
    <>
      <nav className="border-b border-black/[0.03] bg-white/80 backdrop-blur-xl sticky top-0 z-30 px-4 md:px-6 py-3 flex justify-between items-center gap-3 admin-mobile-wrap shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsMenuOpen(true)}
            className="h-9.5 w-9.5 shrink-0 rounded-2xl hover:bg-[#F5F5F7] transition-premium"
            title="메뉴"
          >
            <Menu className="w-5 h-5" />
            <span className="sr-only">메뉴 열기</span>
          </Button>
          <button
            type="button"
            onClick={() => router.push('/admin/dashboard')}
            className="font-black text-sm tracking-tight text-white bg-[#1D1D1F] px-3.5 py-1.5 rounded-2xl mr-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.15)] hover:scale-[1.03] active:scale-[0.98] transition-all"
          >
            SSC
          </button>
          <h1 className="admin-fit-text text-xs sm:text-sm font-black tracking-tight text-[#1D1D1F] opacity-90 flex items-center gap-1.5 min-w-0">
            {titleIcon}
            <span className="truncate">{title}</span>
          </h1>
        </div>

        {campusOptions && campusValue && onCampusChange && (
          <div className="flex items-center gap-2 rounded-full border border-black/[0.04] bg-[#F5F5F7]/80 p-0.5 shrink-0 shadow-inner">
            <span className="hidden sm:inline pl-3.5 pr-1 text-[10px] font-black text-[#86868B] uppercase tracking-wider">센터</span>
            <div className="flex min-w-0 overflow-hidden gap-0.5">
              {campusOptions.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={campusValue === option.value ? 'default' : 'ghost'}
                  onClick={() => onCampusChange(option.value)}
                  className={cn(
                    'admin-fit-button h-7 rounded-full px-3 text-[11px] transition-premium',
                    campusValue === option.value
                      ? 'bg-white hover:bg-white text-black shadow-[0_2px_6px_rgba(0,0,0,0.05)] font-black border border-black/[0.02]'
                      : 'text-[#86868B] hover:bg-white/60 hover:text-black'
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.replace('/admin/dashboard')}
            className="admin-fit-button rounded-2xl border-black/[0.05] hover:bg-[#F5F5F7] text-xs h-9.5 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
            title="홈"
          >
            <Home className="w-4 h-4 md:mr-1.5 text-[#0071E3]" />
            <span className="hidden md:inline font-bold">홈</span>
          </Button>
          {actions}
        </div>
      </nav>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="left" className="w-[300px] bg-white p-0">
          <SheetHeader className="border-b border-black/[0.05] p-5 text-left">
            <SheetTitle className="flex items-center gap-2 text-base font-black text-[#1D1D1F]">
              <span className="rounded-lg bg-[#1D1D1F] px-2.5 py-1.5 text-sm font-extrabold text-white">SSC</span>
              관리자 메뉴
            </SheetTitle>
            <SheetDescription className="text-xs font-semibold text-[#86868B]">
              자주 쓰는 관리자 화면으로 이동합니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-1 p-3">
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className={menuButtonClass(pathname === '/admin/dashboard')}
            >
              <Home className="w-4 h-4 text-[#0071E3]" />
              홈
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/attendance')}
              className={menuButtonClass(pathname === '/admin/attendance')}
            >
              <ClipboardList className="w-4 h-4 text-[#0071E3]" />
              출결 상세
            </button>
            <button type="button" onClick={openKiosk} className={menuButtonClass(false)}>
              <ScanLine className="w-4 h-4 text-[#0071E3]" />
              등하원 체크
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/consultation')}
              className={menuButtonClass(pathname === '/admin/consultation')}
            >
              <BookOpen className="w-4 h-4 text-[#0071E3]" />
              상담일지
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/leave')}
              className={menuButtonClass(pathname === '/admin/leave')}
            >
              <Calendar className="w-4 h-4 text-[#0071E3]" />
              휴가 · 반차 관리
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/leaderboard')}
              className={menuButtonClass(pathname === '/admin/leaderboard')}
            >
              <Trophy className="w-4 h-4 text-[#0071E3]" />
              순공 랭킹
            </button>
            <button type="button" onClick={searchStudent} className={menuButtonClass(false)}>
              <Search className="w-4 h-4 text-[#0071E3]" />
              학생 검색
            </button>
            <button type="button" onClick={addStudent} className={menuButtonClass(false)}>
              <Plus className="w-4 h-4 text-[#0071E3]" />
              학생 추가
            </button>
          </div>

          <div className="mt-auto border-t border-black/[0.05] p-3">
            <button
              type="button"
              onClick={logout}
              className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
