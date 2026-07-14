'use client';

import React from 'react';
import { Clock, CalendarDays, Trophy, Flame } from 'lucide-react';

export interface StudyStats {
  weekTotalMin: number;
  weekRank: { rank: number; total: number } | null;
  weekPercent?: number | null;
  weekStart: string;
  monthStart: string;
  weekAttendedDays?: number;
  weekExpectedDays?: number;
  weekAbsentDays?: number;
  currentStreak?: number;
  weekFocusMin?: number;  // 집중(타이머) 순공 — 체류 상한 클램프
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

export function StudyStatsCard({ stats }: { stats: StudyStats | null }) {
  if (!stats) return null;

  const hasAny = stats.weekTotalMin > 0 || (stats.weekFocusMin ?? 0) > 0;

  return (
    <div className="@container rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-[#0071E3]" />
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">순공 시간</h3>
      </div>

      {!hasAny ? (
        <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
          아직 기록이 없어요. QR로 등하원을 체크하고 집중 타이머를 켜면 시간이 쌓여요.
        </div>
      ) : (
        <>
          {/* 집중(타이머) — 대표 지표. 체류를 넘을 수 없어요(재석 클램프) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/12 border border-[#0071E3]/15 p-4">
              <div className="text-[11px] text-[#0071E3] font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 shrink-0" /> 이번 주 집중
              </div>
              <div className="text-lg @md:text-xl font-bold text-[#0071E3] mt-1 tabular-nums whitespace-nowrap">{fmt(stats.weekFocusMin ?? 0)}</div>
            </div>
            <div className="rounded-2xl bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 border border-[#0071E3]/15 p-4 flex flex-row @md:flex-col items-center justify-center @md:text-center gap-3 @md:gap-1.5">
              <div className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#0071E3" strokeOpacity="0.12" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r="26" fill="none" stroke="#0071E3" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 26}
                    strokeDashoffset={(2 * Math.PI * 26) * (stats.weekPercent != null ? Math.min(1, Math.max(0, stats.weekPercent / 100)) : 1)}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black leading-none text-[#0071E3]">
                    {stats.weekPercent != null ? `${stats.weekPercent}%` : '—'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col @md:items-center gap-1 min-w-0">
                <div className="text-[11px] font-semibold text-[#0071E3] flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 shrink-0" /> 이번 주 체류 상위
                </div>
                <p className="text-[10px] font-bold leading-tight text-[#0071E3]/70">
                  상위권에 가까울수록 링이 가득 차요
                </p>
              </div>
            </div>
          </div>

          {/* 체류(등원~하원) — 보조 지표 */}
          <div className="rounded-2xl bg-[#F5F5F7] dark:bg-white/5 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> 이번 주 체류
            </div>
            <div className="text-lg @md:text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums whitespace-nowrap">{fmt(stats.weekTotalMin)}</div>
          </div>
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 -mt-2">
            집중은 타이머로 잰 진짜 순공, 체류는 등원~하원 시간이에요. 집중은 체류를 넘을 수 없어요.
          </p>

          {/* 이번 주 출석 현황 */}
          {typeof stats.weekExpectedDays === 'number' && stats.weekExpectedDays > 0 && (
            <div className="rounded-2xl border border-black/[0.05] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> 이번 주 출석
                </span>
                <span className="flex items-center gap-2">
                  {(stats.currentStreak ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F56300] bg-[#F56300]/10 px-2 py-0.5 rounded-full">
                      <Flame className="w-3 h-3" /> {stats.currentStreak}일 연속
                    </span>
                  )}
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {stats.weekAttendedDays ?? 0} / {stats.weekExpectedDays}일
                  </span>
                  {(stats.weekAbsentDays ?? 0) > 0 ? (
                    <span className="text-[10px] font-bold text-[#F56300] bg-[#F56300]/10 px-2 py-0.5 rounded-full">
                      결석 {stats.weekAbsentDays}일
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      개근
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: stats.weekExpectedDays }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 flex-1 rounded-full transition-colors ${i < (stats.weekAttendedDays ?? 0) ? 'bg-emerald-500' : 'bg-black/[0.08] dark:bg-white/10'}`}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
