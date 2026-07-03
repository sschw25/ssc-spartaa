'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';

interface Aggregate {
  learnerCount: number;
  completerCount: number;
  speedMode: number | null;
  speedAvg: number | null;
  avgDurationWeeks: number | null;
  targetDeltaDaysAvg: number | null;
  statusDistribution: { ahead: number; onTrack: number; behind: number };
  topMonthsLabel: string;
  type: 'book' | 'lecture';
}

interface Personal {
  startMonthLabel: string;
  weeksSinceStart: number;
  myPercent: number;
  cohortPercentAtSameWeek: number | null;
  percentileTopLabel: string | null;
  etaWeeks: number | null;
  summary: string;
  sparse: boolean;
}

interface BenchmarkResponse {
  success: boolean;
  configured?: boolean;
  eligible?: boolean;
  learnerCount?: number;
  aggregate?: Aggregate;
  personal?: Personal | null;
}

interface BenchmarkSectionProps {
  type: 'book' | 'lecture';
  subject: string;
  name: string;
  studentId?: string;
  audience: 'admin' | 'student';
}

/**
 * 교재/강의 학습 벤치마크 — 같은 자료를 학습한 다른 학생들과 비교(집계 4명 이상부터 표시).
 * 관리자 진도 카드(Task 6)와 학생 리포트(Task 7)가 공유하는 프레젠테이션 컴포넌트.
 */
export function BenchmarkSection({ type, subject, name, studentId, audience }: BenchmarkSectionProps) {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ type, subject, name });
    if (studentId) params.set('studentId', studentId);
    setLoading(true);
    fetch(`/api/learning-benchmark?${params.toString()}`)
      .then((res) => res.json())
      .then((json: BenchmarkResponse) => {
        if (alive) setData(json);
      })
      .catch(() => {
        if (alive) setData({ success: false });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [type, subject, name, studentId]);

  if (loading) return null;
  if (!data?.success || data.configured === false) return null;

  const unitLabel = type === 'book' ? '교재' : '강의';

  if (data.eligible === false) {
    if (audience === 'student') return null;

    return (
      <p className="text-[11px] font-semibold text-slate-400">
        아직 이 {unitLabel}를 공부한 학생 데이터가 충분하지 않습니다(4명 이상부터 표시).
      </p>
    );
  }

  const aggregate = data.aggregate;
  if (!aggregate) return null;
  const personal = data.personal ?? null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-xs font-black text-slate-700">
          <Users className="h-3.5 w-3.5 text-[#0071E3]" />
          이 {unitLabel}, 다른 학생들은? · {aggregate.learnerCount}명
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          <ul className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
            {aggregate.avgDurationWeeks !== null && (
              <li className="rounded-xl bg-slate-50 p-2">
                평균 소요 <b className="text-slate-800">{aggregate.avgDurationWeeks}주</b>
              </li>
            )}
            {aggregate.type === 'lecture' && aggregate.speedMode !== null && (
              <li className="rounded-xl bg-slate-50 p-2">
                많이 쓴 배속 <b className="text-slate-800">{aggregate.speedMode}배</b>
                {aggregate.speedAvg ? ` (평균 ${aggregate.speedAvg.toFixed(1)}배)` : ''}
              </li>
            )}
            {aggregate.topMonthsLabel && (
              <li className="rounded-xl bg-slate-50 p-2">
                주로 <b className="text-slate-800">{aggregate.topMonthsLabel}</b>에 학습
              </li>
            )}
            {aggregate.targetDeltaDaysAvg !== null && (
              <li className="rounded-xl bg-slate-50 p-2">
                목표일 대비{' '}
                <b className="text-slate-800">
                  {aggregate.targetDeltaDaysAvg <= 0
                    ? `${Math.abs(aggregate.targetDeltaDaysAvg)}일 빨리`
                    : `${aggregate.targetDeltaDaysAvg}일 늦게`}
                </b>{' '}
                완료
              </li>
            )}
          </ul>

          {personal && (
            <div>
              <table className="w-full text-[11px]">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 font-semibold text-slate-400">시작 시기</td>
                    <td className="py-1.5 text-right font-bold text-slate-700">{personal.startMonthLabel}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-400">주로 {aggregate.topMonthsLabel}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 font-semibold text-slate-400">시작 후 경과</td>
                    <td className="py-1.5 text-right font-bold text-slate-700">{personal.weeksSinceStart}주차</td>
                    <td className="py-1.5 text-right font-semibold text-slate-400">—</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 font-semibold text-slate-400">현재 진도</td>
                    <td className="py-1.5 text-right font-black text-[#0071E3]">{personal.myPercent}%</td>
                    <td className="py-1.5 text-right font-semibold text-slate-400">
                      {personal.cohortPercentAtSameWeek !== null
                        ? `같은 주차 평균 ${personal.cohortPercentAtSameWeek}%`
                        : '—'}
                    </td>
                  </tr>
                  {personal.percentileTopLabel && (
                    <tr className="border-b border-slate-100">
                      <td className="py-1.5 font-semibold text-slate-400">상대 위치</td>
                      <td className="py-1.5 text-right font-black text-[#0071E3]" colSpan={2}>
                        {personal.percentileTopLabel}
                      </td>
                    </tr>
                  )}
                  {personal.etaWeeks !== null && (
                    <tr>
                      <td className="py-1.5 font-semibold text-slate-400">완료까지 예상</td>
                      <td className="py-1.5 text-right font-bold text-slate-700">약 {personal.etaWeeks}주 뒤</td>
                      <td className="py-1.5 text-right font-semibold text-slate-400">
                        평균 {aggregate.avgDurationWeeks ?? '—'}주
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-500">{personal.summary}</p>
            </div>
          )}

          {audience === 'admin' && (
            <p className="text-[10px] font-semibold text-slate-300">전체 {aggregate.completerCount}명 완료 기준 집계</p>
          )}
        </div>
      )}
    </div>
  );
}
