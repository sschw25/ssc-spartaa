'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AdminGlobalProvider, useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { StudentDetailSheet } from '@/components/admin/student-detail-sheet';
import { AdminGlassTabBar } from '@/components/admin/admin-glass-tabbar';
import { AdminChatDock } from '@/components/admin/admin-chat-dock';
import { cn } from '@/lib/utils';

function GlobalStudentSheet() {
  const { selectedStudent, isSheetOpen, closeSheet, updateSheetStudent, sheetCallbacks } = useAdminGlobalSheet();

  return (
    <StudentDetailSheet
      student={selectedStudent}
      isOpen={isSheetOpen}
      onClose={closeSheet}
      onUpdate={(updated) => {
        updateSheetStudent(updated);
        sheetCallbacks.onUpdate?.(updated);
      }}
      onDelete={(studentId) => {
        closeSheet();
        sheetCallbacks.onDelete?.(studentId);
      }}
      students={sheetCallbacks.allStudents || []}
      defaultTab={sheetCallbacks.defaultTab}
    />
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isMenuPinned } = useAdminGlobalSheet();
  const isLoginPage = pathname === '/admin';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      {/* 메뉴 고정 시 PC(lg+)에서 좌측 사이드바(280px)만큼 본문을 밀어준다 */}
      <div className={cn('transition-[padding] duration-300', isMenuPinned && 'lg:pl-[280px]')}>
        {children}
      </div>
      <GlobalStudentSheet />
      {/* 전역 채팅 독 — 어느 관리자 화면에서든 학생 대화 즉시 접근(인박스 페이지 제외) */}
      <AdminChatDock />
      {/* 고정 사이드바가 보일 땐 데스크톱에서 하단 탭바 숨김(중복 방지) */}
      <div className={cn(isMenuPinned && 'lg:hidden')}>
        <AdminGlassTabBar />
      </div>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGlobalProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminGlobalProvider>
  );
}
