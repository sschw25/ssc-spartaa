'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, TrendingDown, UserX, ShieldAlert, Sparkles } from 'lucide-react';
import { getCampusLabel } from '@/lib/meal';

// 오늘의 브리핑 — /api/admin/daily-digest 를 그대로 반영(스마트화 Wave1 #2+#3).
// 구조는 lib/daily-digest.ts CampusDigest와 동일.
interface DigestStudentEntry { studentId: string; name: string; campus: string }
interface StreakBrokenEntry extends DigestStudentEntry { recentLeftDays: number; priorLeftDays: number }
interface ConsecutiveAbsenceEntry extends DigestStudentEntry { consecutiveDays: number; lastDate: string }
interface RiskBandEntry extends DigestStudentEntry { score: number; isNew: boolean }
interface CampusDigest {
  campus: string;
  date: string;
  yesterdayAbsences: DigestStudentEntry[];
  leftSpikes: StreakBrokenEntry[];
  consecutiveAbsences: ConsecutiveAbsenceEntry[];
  riskBand: RiskBandEntry[];
  counts: {
    yesterdayAbsences: number;
    leftSpikes: number;
    consecutiveAbsences: number;
    riskBand: number;
    riskBandNew: number;
  };
}
interface DigestData { generatedDate: string; campuses: Record<string, CampusDigest> }

interface Props {
  campusFilter: string; // 'all' | 'wonju' | 'chuncheon' | 'chungju'
  onSelectStudentId?: (id: string) => void;
}

function NameChips({
  entries, onSelectStudentId, renderSuffix,
}: {
  entries: { studentId: string; name: string; campus: string }[];
  onSelectStudentId?: (id: string) => void;
  renderSuffix?: (e: any) => React.ReactNode;
}) {
  if (entries.length === 0) {
    return <p className="text-[11px] font-semibold text-slate-500 py-2">해당 없음</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <button
          key={e.studentId}
          onClick={() => onSelectStudentId?.(e.studentId)}
          className="inline-flex items-center gap-1 rounded-full bg-black/[0.03] dark:bg-white/5 hover:bg-black/[0.06] dark:hover:bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-900 dark:text-slate-100 transition-colors"
        >
          <span>{e.name}</span>
          {renderSuffix?.(e)}
        </button>
      ))}
    </div>
  );
}

export function DailyDigestWidget({ campusFilter, onSelectStudentId }: Props) {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = campusFilter && campusFilter !== 'all' ? `?campus=${campusFilter}` : '';
      const res = await fetch(`/api/admin/daily-digest${q}`, { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, [campusFilter]);

  useEffect(() => { load(); }, [load]);

  const campusDigests = data ? Object.values(data.campuses) : [];
  const totals = campusDigests.reduce(
    (acc, c) => ({
      yesterdayAbsences: acc.yesterdayAbsences + c.counts.yesterdayAbsences,
      leftSpikes: acc.leftSpikes + c.counts.leftSpikes,
      consecutiveAbsences: acc.consecutiveAbsences + c.counts.consecutiveAbsences,
      riskBand: acc.riskBand + c.counts.riskBand,
      riskBandNew: acc.riskBandNew + c.counts.riskBandNew,
    }),
    { yesterdayAbsences: 0, leftSpikes: 0, consecutiveAbsences: 0, riskBand: 0, riskBandNew: 0 },
  );
  const isEmpty = !loading && data && (
    totals.yesterdayAbsences + totals.leftSpikes + totals.consecutiveAbsences + totals.riskBand === 0
  );

  const allConsecutive = campusDigests.flatMap((c) => c.consecutiveAbsences);
  const allSpikes = campusDigests.flatMap((c) => c.leftSpikes);
  const allYesterday = campusDigests.flatMap((c) => c.yesterdayAbsences);
  const allRisk = campusDigests.flatMap((c) => c.riskBand);

  return (
    <div className="rounded-3xl glass p-5 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          <Sparkles className="w-4 h-4 text-[#0071E3]" /> 오늘의 브리핑
          {data?.generatedDate && (
            <span className="text-[11px] font-medium text-slate-500">({data.generatedDate} 기준)</span>
          )}
        </h3>
        <button onClick={load} title="새로고침" className="rounded-lg p-1.5 text-slate-500 hover:bg-[#F5F5F7] dark:hover:bg-white/5 transition">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" /></div>
      ) : isEmpty ? (
        // '오늘 처리할 일' 카드의 빈 상태와 동일한 형식(체크 아이콘 + 문구) — 반반 배치 시 톤 일치
        <div className="flex-1 py-8 flex flex-col items-center justify-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">오늘 특이사항 없음</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* 카운트 요약 칩 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-2xl bg-black/[0.03] dark:bg-white/5 px-3 py-2.5">
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><UserX className="w-3 h-3" /> 어제 결석</p>
              <p className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-slate-100">{totals.yesterdayAbsences}명</p>
            </div>
            <div className="rounded-2xl bg-amber-500/[0.08] px-3 py-2.5">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> 이탈 급증</p>
              <p className="mt-1 text-[16px] font-semibold text-amber-700 dark:text-amber-400">{totals.leftSpikes}명</p>
            </div>
            <div className="rounded-2xl bg-orange-500/[0.08] px-3 py-2.5">
              <p className="text-[11px] font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> 연속 결석</p>
              <p className="mt-1 text-[16px] font-semibold text-orange-700 dark:text-orange-400">{totals.consecutiveAbsences}명</p>
            </div>
            <div className="rounded-2xl bg-red-500/[0.08] px-3 py-2.5">
              <p className="text-[11px] font-medium text-red-700 dark:text-red-400 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> 위험 밴드</p>
              <p className="mt-1 text-[16px] font-semibold text-red-700 dark:text-red-400">
                {totals.riskBand}명 {totals.riskBandNew > 0 && <span className="text-[11px] font-semibold">(신규 {totals.riskBandNew})</span>}
              </p>
            </div>
          </div>

          {/* 연속 결석 명단 */}
          {allConsecutive.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-orange-700 dark:text-orange-400 mb-1.5">연속 결석</p>
              <NameChips
                entries={allConsecutive}
                onSelectStudentId={onSelectStudentId}
                renderSuffix={(e: ConsecutiveAbsenceEntry) => (
                  <span className="text-orange-600 dark:text-orange-400">· {getCampusLabel(e.campus)} · {e.consecutiveDays}일째</span>
                )}
              />
            </div>
          )}

          {/* 이탈 급증 명단 */}
          {allSpikes.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 mb-1.5">이탈 급증</p>
              <NameChips
                entries={allSpikes}
                onSelectStudentId={onSelectStudentId}
                renderSuffix={(e: StreakBrokenEntry) => (
                  <span className="text-amber-600 dark:text-amber-400">· {getCampusLabel(e.campus)} · {e.recentLeftDays}일(이전 {e.priorLeftDays}일)</span>
                )}
              />
            </div>
          )}

          {/* 어제 결석 명단 */}
          {allYesterday.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 mb-1.5">어제 결석</p>
              <NameChips
                entries={allYesterday}
                onSelectStudentId={onSelectStudentId}
                renderSuffix={(e: DigestStudentEntry) => (
                  <span className="text-slate-500">· {getCampusLabel(e.campus)}</span>
                )}
              />
            </div>
          )}

          {/* 위험 밴드 명단 */}
          {allRisk.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-red-700 dark:text-red-400 mb-1.5">위험 밴드</p>
              <NameChips
                entries={allRisk}
                onSelectStudentId={onSelectStudentId}
                renderSuffix={(e: RiskBandEntry) => (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    · {getCampusLabel(e.campus)} · {e.score}점
                    {e.isNew && (
                      <span className="ml-0.5 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400">신규</span>
                    )}
                  </span>
                )}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
