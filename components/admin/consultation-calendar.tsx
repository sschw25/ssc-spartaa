'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Student } from '@/lib/types/student';

interface ConsultationCalendarProps {
  students: Student[];
  onOpenStudent: (id: string) => void;
}

const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function ConsultationCalendar({ students, onOpenStudent }: ConsultationCalendarProps) {
  const todayObj = new Date();
  todayObj.setHours(0, 0, 0, 0);
  const todayStr = todayObj.toISOString().split('T')[0];

  const [viewYear, setViewYear] = useState(todayObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // 날짜별 학생 그룹화
  const byDate: Record<string, Student[]> = {};
  students.forEach(s => {
    if (s.nextConsultationDate) {
      if (!byDate[s.nextConsultationDate]) byDate[s.nextConsultationDate] = [];
      byDate[s.nextConsultationDate].push(s);
    }
  });

  // 이달 캘린더 날짜 배열 생성 (월요일 시작)
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDayNum = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7; // 0=Mon

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDayNum; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  // 이달 상담 예정/만료 통계
  const thisMonthStudents = Object.entries(byDate)
    .filter(([d]) => d.startsWith(monthPrefix))
    .flatMap(([, ss]) => ss);
  const overdueCount = Object.entries(byDate)
    .filter(([d]) => d.startsWith(monthPrefix) && d < todayStr)
    .flatMap(([, ss]) => ss).length;

  return (
    <div className="bg-white rounded-3xl border border-black/[0.04] shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.04] bg-[#FAFAFA]">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="text-sm font-semibold text-slate-900 min-w-[90px] text-center">
            {viewYear}년 {viewMonth + 1}월
          </span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold">
          <span className="text-slate-500">이달 상담 <span className="text-slate-900">{thisMonthStudents.length}명</span></span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200/60 rounded-full px-2.5 py-1">
              <AlertTriangle className="w-3 h-3" />
              미완 {overdueCount}명
            </span>
          )}
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-black/[0.04]">
        {DOW_LABELS.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-[10px] font-semibold tracking-wider ${
              i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-slate-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 캘린더 날짜 셀 */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const dateStr = day ? `${monthPrefix}-${String(day).padStart(2, '0')}` : null;
          const scheduled = dateStr ? (byDate[dateStr] || []) : [];
          const isToday = dateStr === todayStr;
          const isPast = dateStr && dateStr < todayStr;
          const hasOverdue = isPast && scheduled.length > 0;
          const dow = idx % 7; // 0=Mon

          return (
            <div
              key={idx}
              className={`min-h-[80px] border-b border-r border-black/[0.03] p-1.5 flex flex-col gap-0.5 last:border-r-0 ${
                !day ? 'bg-[#F8F9FA]/60' : isToday ? 'bg-blue-50/40' : ''
              }`}
            >
              {day && (
                <>
                  <span
                    className={`text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full self-start transition-colors ${
                      isToday
                        ? 'bg-[#0071E3] text-white'
                        : hasOverdue
                        ? 'text-amber-700'
                        : dow === 5
                        ? 'text-blue-500'
                        : dow === 6
                        ? 'text-red-500'
                        : 'text-slate-900'
                    }`}
                  >
                    {day}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {scheduled.slice(0, 3).map(s => (
                      <button
                        key={s.id}
                        onClick={() => onOpenStudent(s.id)}
                        className={`w-full text-left text-[9px] font-semibold px-1.5 py-0.5 rounded-md truncate transition-all hover:scale-[1.02] ${
                          hasOverdue
                            ? 'bg-amber-100/80 text-amber-800 hover:bg-amber-200'
                            : 'bg-[#0071E3]/[0.08] text-[#0071E3] hover:bg-[#0071E3]/[0.14]'
                        }`}
                        title={`${s.name} · ${s.campus}`}
                      >
                        {s.name}
                      </button>
                    ))}
                    {scheduled.length > 3 && (
                      <span className="text-[9px] font-semibold text-slate-500 pl-1">
                        +{scheduled.length - 3}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
