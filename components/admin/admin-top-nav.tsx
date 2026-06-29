'use client';

import React, { ReactNode, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AdminMenuList } from '@/components/admin/admin-menu-list';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

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
  const { isMenuPinned, toggleMenuPin } = useAdminGlobalSheet();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [adminSession, setAdminSession] = useState<{ id: string; username: string; campus: string; role: string } | null>(null);

  React.useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/admin/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setAdminSession(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch admin session in nav:', err);
      }
    }
    fetchSession();
  }, []);


  const navigate = (href: string) => {
    setIsMenuOpen(false);
    router.push(href);
  };

  const handleTogglePin = () => {
    setIsMenuOpen(false);
    toggleMenuPin();
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

  return (
    <>
      <nav className="glass sticky top-0 z-30 px-4 md:px-6 py-3 flex justify-between items-center gap-3 admin-mobile-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsMenuOpen(true)}
            className={cn(
              'h-9.5 w-9.5 shrink-0 rounded-2xl hover:bg-[#F5F5F7] transition-premium',
              // PC에서 메뉴가 고정돼 있으면 좌측 사이드바가 항상 보이므로 햄버거 숨김
              isMenuPinned && 'lg:hidden'
            )}
            title="메뉴"
          >
            <Menu className="w-5 h-5" />
            <span className="sr-only">메뉴 열기</span>
          </Button>
          <button
            type="button"
            onClick={() => router.push('/admin/dashboard')}
            className="shrink-0 whitespace-nowrap font-semibold text-sm tracking-tight text-white bg-[#1D1D1F] px-3.5 py-1.5 rounded-2xl mr-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.15)] hover:scale-[1.03] active:scale-[0.98] transition-all"
          >
            SSC
          </button>
          <h1 className="admin-fit-text text-[15px] sm:text-[17px] font-semibold tracking-tight text-[#1D1D1F] flex items-center gap-1.5 min-w-0">
            {titleIcon}
            <span className="truncate">{title}</span>
          </h1>
        </div>

        {campusOptions && campusValue && onCampusChange && (
          <div className="glass-capsule flex items-center gap-2 rounded-full p-0.5 shrink-0">
            <span className="hidden sm:inline pl-3.5 pr-1 text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">센터</span>
            <div className="flex min-w-0 overflow-hidden gap-0.5">
              {campusOptions
                .filter((option) => {
                  if (adminSession && adminSession.campus !== 'all') {
                    return option.value === adminSession.campus;
                  }
                  return true;
                })
                .map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={campusValue === option.value ? 'default' : 'ghost'}
                    onClick={() => onCampusChange(option.value)}
                    className={cn(
                      'admin-fit-button h-7 rounded-full px-3 text-[11px] transition-premium',
                      campusValue === option.value
                        ? 'bg-white hover:bg-white text-black shadow-[0_2px_6px_rgba(0,0,0,0.05)] font-semibold border border-black/[0.02]'
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

      {/* PC 고정 사이드바 — 데스크톱(lg+)에서 메뉴 고정 시 항상 노출 */}
      {isMenuPinned && (
        <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[280px] flex-col border-r border-black/[0.06] bg-white shadow-[2px_0_16px_rgba(0,0,0,0.04)]">
          <AdminMenuList
            pathname={pathname}
            adminSession={adminSession}
            pinned={isMenuPinned}
            onTogglePin={handleTogglePin}
            onNavigate={(href) => router.push(href)}
            onSearchStudent={searchStudent}
            onAddStudent={addStudent}
            onOpenKiosk={openKiosk}
            onLogout={logout}
          />
        </aside>
      )}

      {/* 오버레이 메뉴 — 모바일 및 미고정 데스크톱 */}
      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="left" className="w-[300px] bg-white p-0">
          <SheetTitle className="sr-only">관리자 메뉴</SheetTitle>
          <AdminMenuList
            pathname={pathname}
            adminSession={adminSession}
            pinned={isMenuPinned}
            onTogglePin={handleTogglePin}
            onNavigate={navigate}
            onSearchStudent={searchStudent}
            onAddStudent={addStudent}
            onOpenKiosk={openKiosk}
            onLogout={logout}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
