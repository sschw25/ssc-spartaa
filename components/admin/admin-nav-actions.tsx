'use client';

import React from 'react';
import { RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 관리자 서브페이지 상단 nav 의 표준 액션 버튼(새로고침·로그아웃).
// 대시보드 AdminTopNav actions 와 동일 톤 — 미니멀 페이지의 nav 를 대시보드와 통일하기 위한 재사용 컴포넌트.
export function AdminNavActions({
  onRefresh,
  loading,
  onLogout,
}: {
  onRefresh?: () => void;
  loading?: boolean;
  onLogout?: () => void | Promise<void>;
}) {
  return (
    <>
      {onRefresh && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          className="admin-fit-button rounded-2xl border-black/[0.05] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10 text-xs h-9.5 bg-white dark:bg-[#1c1c1e] px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 md:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline font-bold">새로고침</span>
        </Button>
      )}
      {onLogout && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onLogout}
          className="admin-fit-button text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl text-xs h-9.5 px-3 transition-premium"
          title="로그아웃"
        >
          <LogOut className="w-4 h-4 mr-1.5 text-red-500" />
          <span className="hidden sm:inline font-bold">로그아웃</span>
        </Button>
      )}
    </>
  );
}
