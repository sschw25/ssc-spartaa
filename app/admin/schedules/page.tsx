'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, AlarmClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { ScheduledJobsPanel } from '@/components/admin/scheduled-jobs-panel';

// 관리자: 예약 스케줄 종합 관리 — 자동 실행 잡(출결 마감·도시락·미션 정산·상담 리마인더·일일 브리핑)
// 전체를 한 화면에서 설정한다. 각 기능 페이지에도 해당 잡만 컴팩트하게 임베드돼 있다.
export default function SchedulesPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
      } catch {
        router.replace('/admin');
        return;
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-white/5 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans">
      <AdminTopNav
        title="예약 스케줄"
        titleIcon={<AlarmClock className="w-4 h-4 text-[#0071E3]" />}
        onLogout={handleLogout}
      />

      <main className="stagger-children mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <AlarmClock className="w-5 h-5 text-[#0071E3]" /> 예약 스케줄
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 mt-0.5">
              자동 실행 작업의 요일·시각·사용 여부를 관리합니다(KST). 15분마다 점검해 설정 시각 이후 실행됩니다.
            </p>
          </div>
        </div>

        {/* 전체 잡 설정 패널 — 각 기능 페이지(출결·도시락·미션·상담 예약·대시보드)에도 해당 잡만 임베드됨.
            제목은 위 페이지 헤더가 담당하므로 패널 자체 제목은 숨긴다(중복 방지). */}
        <ScheduledJobsPanel hideHeading />
      </main>
    </div>
  );
}
