'use client';

import React from 'react';

interface ReportNavItem {
  href: string;
  label: string;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface StudentTabNavProps {
  reportNavItems: ReportNavItem[];
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  notificationCount: number;
  tabIds: string[];
  slideDirRef: React.MutableRefObject<number>;
}

export function StudentTabNav({
  reportNavItems,
  activeTab,
  setActiveTab,
  notificationCount,
  tabIds,
  slideDirRef,
}: StudentTabNavProps) {
  return (
    <div className="no-print sticky top-0 z-40 mb-4 bg-gradient-to-b from-[#F8FAFC] via-[#F8FAFC]/95 to-[#F8FAFC]/0 pt-2 pb-3">
      <div className="flex gap-1.5 overflow-x-auto pl-16 pr-2 md:justify-center md:pl-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {reportNavItems.map((item) => {
          const Icon = item.icon;
          const tabId = item.href.slice(1);
          const active = activeTab === tabId;
          return (
            <button
              key={item.href}
              type="button"
              data-tab-active={active ? 'true' : undefined}
              onClick={() => {
                slideDirRef.current = tabIds.indexOf(tabId) >= tabIds.indexOf(activeTab) ? 1 : -1;
                setActiveTab(tabId);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-black whitespace-nowrap transition-all active:scale-95 ${
                active
                  ? 'border-[#0071E3] bg-[#0071E3] text-white shadow-[0_6px_16px_rgba(0,113,227,0.25)]'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              {tabId === 'student-notifications' && notificationCount > 0 && (
                <span className={`ml-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-black leading-4 ${active ? 'bg-white/25 text-white' : 'bg-red-500 text-white'}`}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
