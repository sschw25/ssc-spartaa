'use client';

import React from 'react';
import { toDateKey, isStudyDay } from '@/lib/progress-plan';

// 과목별 진도 입력 히트맵 — 최근 35일. 파랑=입력한 날 / 옅은칸=학습일·미입력 / 점=비학습일·휴가일.
// (subject-progress-tab 내부 구현을 자료 상세 시트와 공유하려고 공용 컴포넌트로 추출 — 동작 동일)
export function InputHeatmap({ inputLog, studyDays, leaveDates }: { inputLog?: string[]; studyDays?: string[]; leaveDates: Set<string> }) {
  const done = new Set(inputLog || []);
  const cells: { key: string; state: 'done' | 'miss' | 'off' }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toDateKey(d);
    const off = !isStudyDay(d, studyDays) || leaveDates.has(key);
    const state = done.has(key) ? 'done' : off ? 'off' : 'miss';
    cells.push({ key, state });
  }
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-400">
        진도 입력 최근 5주
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#0071E3]" /> 입력</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-slate-100 dark:bg-white/10" /> 미입력</span>
      </p>
      <div className="flex flex-wrap gap-[3px]" aria-label="진도 입력 히트맵">
        {cells.map((c) => (
          <span
            key={c.key}
            title={`${c.key} · ${c.state === 'done' ? '입력함' : c.state === 'miss' ? '미입력' : '비학습/휴가'}`}
            className={
              c.state === 'done'
                ? 'h-3 w-3 rounded-[3px] bg-[#0071E3]'
                : c.state === 'miss'
                ? 'h-3 w-3 rounded-[3px] bg-slate-100 dark:bg-white/10'
                : 'h-3 w-3 rounded-[3px] bg-transparent ring-1 ring-inset ring-slate-100 dark:ring-white/10'
            }
          />
        ))}
      </div>
    </div>
  );
}
