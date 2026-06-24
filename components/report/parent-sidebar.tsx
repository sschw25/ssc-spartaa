'use client';

import React from 'react';

interface ReportNavItem {
  href: string;
  label: string;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ParentSidebarProps {
  reportNavItems: ReportNavItem[];
}

export function ParentSidebar({ reportNavItems }: ParentSidebarProps) {
  return (
    <aside className="no-print sticky top-6 hidden xl:block">
      <nav className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0071E3]">Parent Report Menu</p>
          <h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">학습 결과 목차</h2>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">필요한 영역을 바로 확인하세요.</p>
        </div>

        <div className="mt-4 space-y-1.5">
          {reportNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-100 bg-slate-50 text-slate-500 transition-colors group-hover:border-[#0071E3]/20 group-hover:bg-[#0071E3]/5 group-hover:text-[#0071E3]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-slate-800">{item.label}</span>
                  <span className="block truncate text-[10px] font-bold text-slate-400">{item.meta}</span>
                </span>
              </a>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
