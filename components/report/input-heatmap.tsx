'use client';

import React, { useState } from 'react';
import { toDateKey, isStudyDay } from '@/lib/progress-plan';
import { getPlanDailyCompletion } from '@/lib/student-activity';
import type { DetailedPlan } from '@/lib/types/student';

// 과목별 진도 입력 히트맵 — 최근 35일. 파랑=입력한 날 / 옅은칸=학습일·미입력 / 점=비학습일·휴가일.
// (subject-progress-tab 내부 구현을 자료 상세 시트와 공유하려고 공용 컴포넌트로 추출 — 동작 동일)
// detailedPlans/unit 이 주어지면 칸을 눌러 그날 계획·실적·달성률 상세를 볼 수 있다(자료 컨텍스트 필요).
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${m}월 ${d}일 (${WEEKDAY_KO[dt.getDay()]})`;
}

export function InputHeatmap({
  inputLog,
  studyDays,
  leaveDates,
  detailedPlans,
  unit = '',
  isSelfPaced,
  reviewLog,
}: {
  inputLog?: string[];
  studyDays?: string[];
  leaveDates: Set<string>;
  detailedPlans?: DetailedPlan[];
  unit?: string;
  isSelfPaced?: boolean;
  reviewLog?: Record<string, number>;
}) {
  const done = new Set(inputLog || []);
  // 상세를 계산할 컨텍스트(계획 또는 자율 여부)가 있으면 인터랙티브.
  const interactive = Boolean(detailedPlans || isSelfPaced !== undefined);
  const [selected, setSelected] = useState<string | null>(null);

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

  // 선택한 날의 상세(계획·실적·달성률).
  const detail = (() => {
    if (!interactive || !selected) return null;
    const [y, m, dd] = selected.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, dd || 1);
    d.setHours(0, 0, 0, 0);
    const off = !isStudyDay(d, studyDays) || leaveDates.has(selected);
    const isLeave = leaveDates.has(selected);
    const logged = done.has(selected);

    if (isSelfPaced) {
      return { kind: 'self' as const, off, isLeave, logged, reviewMin: reviewLog?.[selected] || 0 };
    }
    const plan = (detailedPlans || []).find(
      (p) => !p.periodType && p.startDate <= selected && selected <= p.endDate,
    );
    if (!plan) return { kind: 'noplan' as const, off, isLeave, logged };
    const planned = Math.max(1, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6)));
    const comp = getPlanDailyCompletion(plan, selected);
    const actual = comp.isCompleted ? (typeof comp.actualAmount === 'number' ? comp.actualAmount : planned) : 0;
    const pct = Math.min(100, Math.round((actual / planned) * 100));
    return { kind: 'plan' as const, off, isLeave, logged, planned, actual, pct, range: plan.rangeText, completed: comp.isCompleted };
  })();

  const cellClass = (c: { key: string; state: 'done' | 'miss' | 'off' }) => {
    const base =
      c.state === 'done'
        ? 'bg-[#0071E3]'
        : c.state === 'miss'
        ? 'bg-slate-100 dark:bg-white/10'
        : 'bg-transparent ring-1 ring-inset ring-slate-100 dark:ring-white/10';
    const sel = selected === c.key ? ' ring-2 ring-[#0071E3] ring-offset-1 ring-offset-white dark:ring-offset-[#1c1c1e]' : '';
    return `h-3 w-3 rounded-[3px] ${base}${sel}`;
  };

  return (
    <div className="mt-3">
      {/* 범례 — 셀과 동일한 세 상태: 파랑=입력한 날 / 옅은칸=학습일인데 미입력 / 빈칸(테두리)=비학습일·휴가 */}
      <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400 dark:text-slate-400">
        진도 입력 최근 5주
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#0071E3]" /> 입력한 날</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-slate-100 dark:bg-white/10" /> 학습일·미입력</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-slate-200 dark:ring-white/15" /> 학습일 아님·휴가</span>
        {interactive && <span className="text-slate-400 dark:text-slate-500">· 칸을 누르면 그날 계획·실적</span>}
      </p>
      <div className="flex flex-wrap gap-[3px]" aria-label="진도 입력 히트맵">
        {cells.map((c) => {
          const title = `${c.key} · ${c.state === 'done' ? '입력함' : c.state === 'miss' ? '미입력' : '비학습/휴가'}`;
          return interactive ? (
            <button
              key={c.key}
              type="button"
              title={title}
              aria-label={title}
              onClick={() => setSelected((prev) => (prev === c.key ? null : c.key))}
              className={`${cellClass(c)} transition active:scale-90`}
            />
          ) : (
            <span key={c.key} title={title} className={cellClass(c)} />
          );
        })}
      </div>

      {interactive && selected && detail && (
        <div className="mt-2.5 rounded-xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black text-slate-800 dark:text-slate-100">{formatDayLabel(selected)}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              닫기
            </button>
          </div>

          {detail.off ? (
            <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {detail.isLeave ? '휴가로 쉰 날이에요 (계획에서 제외).' : '이 자료의 학습일이 아니에요.'}
            </p>
          ) : detail.kind === 'self' ? (
            <p className="mt-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              자율 학습 · <span className={detail.logged ? 'font-black text-[#0071E3]' : 'font-black text-slate-400'}>{detail.logged ? '입력함' : '미입력'}</span>
              {detail.reviewMin > 0 ? ` · 복습 ${detail.reviewMin}분` : ''}
            </p>
          ) : detail.kind === 'noplan' ? (
            <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              이 자료의 계획 기간이 아니에요{detail.logged ? ' · 입력 기록 있음' : ''}.
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-500 dark:text-slate-400">계획</span>
                <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  {detail.planned}{unit}
                  {detail.range ? <span className="ml-1 font-medium text-slate-400 dark:text-slate-500">({detail.range})</span> : null}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-500 dark:text-slate-400">실제로 한 양</span>
                <span className="font-black tabular-nums text-[#0071E3]">{detail.actual}{unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className={`h-full rounded-full ${detail.pct >= 100 ? 'bg-emerald-500' : 'bg-[#0071E3]'}`}
                    style={{ width: `${detail.pct}%` }}
                  />
                </div>
                <span className={`shrink-0 text-[11px] font-black tabular-nums ${detail.pct >= 100 ? 'text-emerald-600 dark:text-emerald-300' : 'text-[#0071E3]'}`}>
                  {detail.pct}%
                </span>
              </div>
              {detail.completed && detail.pct < 100 && (
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">완료로 체크했지만 계획량보다 적게 입력했어요.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
