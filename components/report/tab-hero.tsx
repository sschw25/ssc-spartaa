'use client';

import React from 'react';

// 학생 페이지 탭 공용 헤더 — '신청' 탭의 헤더 스타일(파란 칩 배지 + 굵은 제목 + 설명)을 표준화.
// 각 탭 상단에 배치해 시각적 일관성을 준다. children 으로 하위 선택 그리드 등을 이어 붙일 수 있다.
export function TabHero({
  eyebrow,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
            <Icon className="h-3.5 w-3.5" /> {eyebrow}
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
