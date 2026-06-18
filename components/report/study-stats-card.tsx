'use client';

import React from 'react';
import { Clock, CalendarDays, Trophy, Flame } from 'lucide-react';

interface StudyStats {
  weekTotalMin: number;
  monthTotalMin: number;
  byWeekday: { label: string; min: number }[];
  peakWeekday: { label: string; min: number } | null;
  weekRank: { rank: number; total: number } | null;
  weekStart: string;
  monthStart: string;
  weekAttendedDays?: number;
  weekExpectedDays?: number;
  weekAbsentDays?: number;
  currentStreak?: number;
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

export function StudyStatsCard({ stats }: { stats: StudyStats | null }) {
  if (!stats) return null;

  const maxMin = Math.max(1, ...stats.byWeekday.map((d) => d.min));
  const hasAny = stats.monthTotalMin > 0;

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-[#0071E3]" />
        <h3 className="text-base font-bold text-[#1D1D1F]">순공 시간 리포트</h3>
      </div>

      {!hasAny ? (
        <div className="text-center py-8 text-sm text-[#86868B]">
          아직 등하원 기록이 없어요. QR로 등하원을 체크하면 순공 시간이 쌓입니다.
        </div>
      ) : (
        <>
          {/* 요약 3종 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#F5F5F7] p-4">
              <div className="text-[11px] text-[#86868B] font-semibold flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> 이번 주 순공
              </div>
              <div className="text-xl font-bold text-[#1D1D1F] mt-1">{fmt(stats.weekTotalMin)}</div>
            </div>
            <div className="rounded-2xl bg-[#F5F5F7] p-4">
              <div className="text-[11px] text-[#86868B] font-semibold flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> 이번 달 순공
              </div>
              <div className="text-xl font-bold text-[#1D1D1F] mt-1">{fmt(stats.monthTotalMin)}</div>
            </div>
            <div className="rounded-2xl bg-[#0071E3]/[0.06] border border-[#0071E3]/15 p-4">
              <div className="text-[11px] text-[#0071E3] font-semibold flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" /> 이번 주 등수
              </div>
              <div className="text-xl font-bold text-[#0071E3] mt-1">
                {stats.weekRank ? `${stats.weekRank.rank}등 / ${stats.weekRank.total}명` : '—'}
              </div>
            </div>
          </div>

          {/* 이번 주 출석 현황 */}
          {typeof stats.weekExpectedDays === 'number' && stats.weekExpectedDays > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-black/[0.05] bg-[#F5F5F7] px-4 py-3">
              <span className="text-[11px] font-semibold text-[#86868B] flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> 이번 주 출석
              </span>
              <span className="flex items-center gap-2">
                {(stats.currentStreak ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F56300] bg-[#F56300]/10 px-2 py-0.5 rounded-full">
                    <Flame className="w-3 h-3" /> {stats.currentStreak}일 연속
                  </span>
                )}
                <span className="text-sm font-bold text-[#1D1D1F]">
                  {stats.weekAttendedDays ?? 0} / {stats.weekExpectedDays}일
                </span>
                {(stats.weekAbsentDays ?? 0) > 0 ? (
                  <span className="text-[10px] font-bold text-[#F56300] bg-[#F56300]/10 px-2 py-0.5 rounded-full">
                    결석 {stats.weekAbsentDays}일
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    개근
                  </span>
                )}
              </span>
            </div>
          )}

          {/* 요일별 분포 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#1D1D1F]">요일별 공부량 (이번 달)</span>
              {stats.peakWeekday && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F56300] bg-[#F56300]/10 px-2 py-0.5 rounded-full">
                  <Flame className="w-3 h-3" /> {stats.peakWeekday.label}요일 집중
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2 h-28">
              {stats.byWeekday.map((d) => {
                const pct = Math.round((d.min / maxMin) * 100);
                const isPeak = stats.peakWeekday?.label === d.label && d.min > 0;
                return (
                  <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                    <div
                      className={`w-full rounded-t-md ${isPeak ? 'bg-[#F56300]' : 'bg-[#0071E3]/70'}`}
                      style={{ height: `${Math.max(d.min > 0 ? 6 : 0, pct)}%` }}
                      title={fmt(d.min)}
                    />
                    <span className={`text-[10px] ${isPeak ? 'text-[#F56300] font-bold' : 'text-[#86868B]'}`}>{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
