'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Flame, Loader2, CheckCircle2, Circle, Moon, Smartphone, ChevronLeft, ListChecks, Timer, BookOpen, Sparkles, CalendarDays, Presentation, PenLine, PartyPopper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MissionsCard } from '@/components/report/missions-card';

type Recommendation = {
  key: string;
  icon: 'plan' | 'sleep' | 'phone' | 'distraction' | 'mock' | 'onfire';
  title: string;
  detail: string;
  tone: 'suggest' | 'celebrate';
};

const REC_ICON: Record<Recommendation['icon'], LucideIcon> = {
  plan: ListChecks,
  sleep: Moon,
  phone: Smartphone,
  distraction: Timer,
  mock: BookOpen,
  onfire: Sparkles,
};

type PlanEntry = {
  id: string;
  subject: string;
  title: string;
  type: '강의' | '교재';
  materialType: 'book' | 'lecture';
  materialId: string;
  planId: string;
  dateKey: string;
  isCompleted: boolean;
  actualAmount?: number;
  dailyAmount: number;
  dailyLabel: string;
  rangeText: string;
};

type Checklist = {
  sleep_hours?: number;
  phone_submitted?: boolean;
  phone_status?: 'submitted' | 'locker' | 'off_hold';
  submitted_at?: string;
} | null;

type ScheduleItem = {
  id: string;
  kind: 'ot' | 'mock' | 'event';
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  dday: number;
  needsResponse: boolean;
};

type HubData = {
  todayPlanEntries: PlanEntry[];
  checklist: Checklist;
  streak: { current: number; best?: number };
  streakRepair?: { date: string; restoredStreak: number; cost: number } | null;
  recommendations?: Recommendation[];
  schedule?: ScheduleItem[];
  leaveCoupons: number;
};

const SCHEDULE_KIND: Record<ScheduleItem['kind'], { label: string; icon: LucideIcon }> = {
  ot: { label: 'OT', icon: Presentation },
  mock: { label: '모의고사', icon: PenLine },
  event: { label: '행사', icon: PartyPopper },
};

// 'YYYY-MM-DD' → '6월 30일 (화)' (서울 기준)
function formatScheduleDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short',
  }).format(d); // 예: "6. 30. (화)"
  const m = parts.match(/(\d+)\. (\d+)\. \((.)\)/);
  return m ? `${m[1]}월 ${m[2]}일 (${m[3]})` : parts;
}

const PHONE_LABEL: Record<string, string> = {
  submitted: '제출 완료',
  locker: '임시보관함',
  off_hold: '전원끄고 소지',
};

const SECTION_SURFACE = 'rounded-xl border border-black/5 bg-white p-5 shadow-sm sm:p-6';

// embedded: 리포트 탭 안에서 렌더될 때 — 풀스크린 배경/뒤로가기 없이 섹션만 출력한다.
export function MissionsHub({ studentId, studentName, embedded = false }: { studentId: string; studentName: string; embedded?: boolean }) {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // 체크리스트 폼(휴대폰 3택 + 수면시간) — /api/student/checklist 와 동일 계약(app/report 홈 탭과 동일).
  const [checklistForm, setChecklistForm] = useState<{
    sleepHours: number;
    phoneStatus: 'submitted' | 'locker' | 'off_hold';
    phoneReason: string;
  }>({ sleepHours: 7, phoneStatus: 'submitted', phoneReason: '' });
  const [checklistSubmitting, setChecklistSubmitting] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/missions-hub', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const togglePlanEntry = async (entry: PlanEntry) => {
    if (togglingId) return;
    setTogglingId(entry.id);
    const nextCompleted = !entry.isCompleted;
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialType: entry.materialType,
          materialId: entry.materialId,
          planId: entry.planId,
          isCompleted: nextCompleted,
          dateKey: entry.dateKey,
          ...(nextCompleted ? { actualAmount: entry.dailyAmount } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setData((prev) => prev ? {
          ...prev,
          todayPlanEntries: prev.todayPlanEntries.map((e) =>
            e.id === entry.id ? { ...e, isCompleted: nextCompleted, actualAmount: json.actualAmount ?? e.actualAmount } : e,
          ),
        } : prev);
        if (nextCompleted) {
          setJustCompletedId(entry.id);
          setTimeout(() => setJustCompletedId((cur) => (cur === entry.id ? null : cur)), 900);
        }
      }
    } catch {
      // noop
    } finally {
      setTogglingId(null);
    }
  };

  const submitChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecklistSubmitting(true);
    try {
      const res = await fetch('/api/student/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleepHours: checklistForm.sleepHours,
          phoneStatus: checklistForm.phoneStatus,
          phoneSubmitted: checklistForm.phoneStatus === 'submitted',
          phoneReason: checklistForm.phoneReason,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        await load();
      } else if (json?.message && typeof window !== 'undefined') {
        window.alert(json.message);
      }
    } catch {
      // noop
    } finally {
      setChecklistSubmitting(false);
    }
  };

  const repairStreak = async () => {
    const repair = data?.streakRepair;
    if (!repair || repairing) return;
    if (typeof window !== 'undefined' && !window.confirm(`쿠폰 ${repair.cost}개로 끊긴 스트릭을 이을까요?\n(${repair.restoredStreak}일 연속으로 복구돼요)`)) return;
    setRepairing(true);
    try {
      const res = await fetch('/api/student/streak-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: repair.date }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        await load();
      } else if (json?.message && typeof window !== 'undefined') {
        window.alert(json.message);
        await load();
      }
    } catch {
      // noop
    } finally {
      setRepairing(false);
    }
  };

  if (loading) {
    if (embedded) {
      return (
        <div className="flex items-center justify-center rounded-[28px] border border-slate-100 bg-white/70 py-16">
          <Loader2 className="w-6 h-6 text-[#0071E3] animate-spin" />
        </div>
      );
    }
    return (
      <div className="ios-app-bg min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  const streakCurrent = data?.streak.current ?? 0;
  const streakBest = data?.streak.best;
  const streakRepair = data?.streakRepair ?? null;
  const coupons = data?.leaveCoupons ?? 0;
  const checklist = data?.checklist;
  const entries = data?.todayPlanEntries ?? [];
  const completedCount = entries.filter((e) => e.isCompleted).length;
  const recommendations = data?.recommendations ?? [];
  const isCelebrate = recommendations.length === 1 && recommendations[0].tone === 'celebrate';
  const schedule = data?.schedule ?? [];

  const inner = (
      <>
        {/* 헤더 — 다른 리포트 탭(알림 등)과 동일한 아이브로우 칩 + 큰 제목 + 부제 패턴 */}
        <header className="min-w-0">
          {!embedded && (
            <a
              href={`/report/${studentId}?audience=student`}
              className="mb-2 inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-slate-400 transition hover:text-slate-600"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              리포트로 돌아가기
            </a>
          )}
          <div className="inline-flex items-center gap-2 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
            <Flame className="h-3.5 w-3.5" />
            Today Missions
          </div>
          {/* embedded(리포트 탭 내부)에서는 h1 중복을 피해 h2 사용 */}
          {embedded ? (
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-4xl">
              {studentName}님, 오늘도 화이팅이에요
            </h2>
          ) : (
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-4xl">
              {studentName}님, 오늘도 화이팅이에요
            </h1>
          )}
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            연속출석 스트릭, 오늘 계획, 아침 점검표, 쿠폰 미션까지 오늘 할 일을 한곳에 모았습니다.
          </p>
        </header>

        {/* 1. 연속출석 스트릭 */}
        <section className={SECTION_SURFACE}>
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
              <Flame
                className={`h-14 w-14 drop-shadow-[0_2px_6px_rgba(249,115,22,0.35)] ${streakCurrent > 0 ? 'text-orange-500 animate-streak-flame' : 'text-slate-300'}`}
                fill={streakCurrent > 0 ? 'currentColor' : 'none'}
                strokeWidth={streakCurrent > 0 ? 1.5 : 1.8}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums text-slate-900">{streakCurrent}</span>
                <span className="text-sm font-semibold text-slate-500">일 연속 출석</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-400">
                {streakCurrent > 0 ? '오늘도 이어가는 중이에요' : '오늘 등원하면 스트릭이 시작돼요'}
                {typeof streakBest === 'number' && streakBest > streakCurrent && (
                  <span className="text-orange-500">· 최고 기록 {streakBest}일</span>
                )}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">일요일은 센터 휴무일이라 스트릭에 포함하지 않아요</p>
            </div>
          </div>
          {streakRepair && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200/70 bg-orange-50 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-900">아깝게 끊긴 스트릭이 있어요</span>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                  쿠폰 {streakRepair.cost}개로 이으면 {streakRepair.restoredStreak}일 연속으로 복구돼요 · 보유 쿠폰 {coupons}개
                </span>
              </span>
              <button
                type="button"
                onClick={repairStreak}
                disabled={repairing || coupons < streakRepair.cost}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
                스트릭 잇기
              </button>
            </div>
          )}
        </section>

        {/* 2. 아침 자가 점검표 (휴대폰 제출 · 수면) — 하루 시작 루틴이라 계획보다 먼저 */}
        <section className={SECTION_SURFACE}>
          <h2 className="text-sm font-semibold text-slate-800">아침 자가 점검표</h2>
          {checklist ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                <Moon className="h-3.5 w-3.5 text-slate-400" />
                수면 {checklist.sleep_hours}시간
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                휴대폰 {PHONE_LABEL[checklist.phone_status || (checklist.phone_submitted ? 'submitted' : 'locker')] || '미제출'}
              </span>
            </div>
          ) : (
            <form onSubmit={submitChecklist} className="mt-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="hub-sleep-hours" className="text-xs font-semibold text-slate-600">어젯밤 수면 시간</label>
                <select
                  id="hub-sleep-hours"
                  value={checklistForm.sleepHours}
                  onChange={(e) => setChecklistForm((f) => ({ ...f, sleepHours: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-[#0071E3] focus:outline-none"
                >
                  {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12].map((h) => (
                    <option key={h} value={h}>{h}시간</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600">등원 시 휴대폰</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['submitted', 'locker', 'off_hold'] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setChecklistForm((f) => ({ ...f, phoneStatus: val }))}
                      className={`rounded-lg px-1.5 py-2 text-[11px] font-semibold border transition active:scale-95 leading-tight ${
                        checklistForm.phoneStatus === val
                          ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3]'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {PHONE_LABEL[val]}
                    </button>
                  ))}
                </div>
                {checklistForm.phoneStatus !== 'submitted' && (
                  <textarea
                    value={checklistForm.phoneReason}
                    onChange={(e) => setChecklistForm((f) => ({ ...f, phoneReason: e.target.value }))}
                    rows={2}
                    placeholder="휴대폰을 제출하지 못하는 사유를 적어 주세요"
                    className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-slate-700 placeholder:text-slate-300 focus:border-amber-400 focus:outline-none"
                  />
                )}
              </div>
              <button
                type="submit"
                disabled={checklistSubmitting || (checklistForm.phoneStatus !== 'submitted' && !checklistForm.phoneReason.trim())}
                className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                {checklistSubmitting ? '기록 중...' : '컨디션 기록 완료'}
              </button>
            </form>
          )}
        </section>

        {/* 3. 오늘 계획(진도) */}
        <section className={SECTION_SURFACE}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">오늘 계획</h2>
            {entries.length > 0 && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
                {completedCount}/{entries.length} 완료
              </span>
            )}
          </div>
          {entries.length === 0 ? (
            <p className="mt-3 text-xs font-semibold text-slate-400">오늘 배정된 진도 항목이 없어요.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => togglePlanEntry(entry)}
                  disabled={togglingId === entry.id}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition active:scale-[0.99] ${
                    entry.isCompleted ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                  } ${justCompletedId === entry.id ? 'animate-scale-in-up' : ''}`}
                >
                  <span className="shrink-0">
                    {togglingId === entry.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                    ) : entry.isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-slate-900">{entry.subject} · {entry.title}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <span>{entry.type}</span>
                      <span>·</span>
                      <span>{entry.dailyLabel}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 3.5 이번 주 집중 포인트 — 약점 기반 개인화 코칭(건강지수 factors → 학생 코칭 문구) */}
        {recommendations.length > 0 && (
          <section className={SECTION_SURFACE}>
            <div className="flex items-center gap-2">
              <Sparkles className={`h-4 w-4 ${isCelebrate ? 'text-emerald-500' : 'text-amber-500'}`} />
              <h2 className="text-sm font-semibold text-slate-800">
                {isCelebrate ? '지금 아주 잘하고 있어요' : '이번 주 집중 포인트'}
              </h2>
            </div>
            {!isCelebrate && (
              <p className="mt-1 text-[11px] font-semibold text-slate-400">최근 학습 데이터를 보고 골라봤어요</p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {recommendations.map((rec) => {
                const Icon = REC_ICON[rec.icon];
                const celebrate = rec.tone === 'celebrate';
                return (
                  <div
                    key={rec.key}
                    className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${
                      celebrate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200/70 bg-amber-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        celebrate ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-900">{rec.title}</span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-relaxed text-slate-500">{rec.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. 학원 일정 (OT · 모의고사 · 참여 행사) — 다가오는 30일, 임박순 */}
        {schedule.length > 0 && (
          <section className={SECTION_SURFACE}>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#0071E3]" />
              <h2 className="text-sm font-semibold text-slate-800">학원 일정</h2>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">앞으로 한 달 안에 참여할 일정이에요</p>
            <div className="mt-3 flex flex-col gap-2">
              {schedule.map((item) => {
                const kind = SCHEDULE_KIND[item.kind];
                const KindIcon = kind.icon;
                const urgent = item.dday <= 3;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
                      urgent ? 'border-amber-200/70 bg-amber-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        urgent ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-[#0071E3]'
                      }`}
                    >
                      <KindIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-900">{item.title}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{kind.label}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <span>{formatScheduleDate(item.date)}</span>
                        {item.endDate && item.endDate !== item.date && <span>~ {formatScheduleDate(item.endDate)}</span>}
                        {item.startTime && <span>{item.startTime}</span>}
                        {item.needsResponse && (
                          <span className="text-[#0071E3]">· 참석 응답이 필요해요</span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                        urgent ? 'bg-amber-500 text-white' : 'bg-blue-50 text-[#0071E3]'
                      }`}
                    >
                      {item.dday === 0 ? 'D-Day' : `D-${item.dday}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 5. 쿠폰 미션 */}
        <MissionsCard />
      </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-5">{inner}</div>;
  }

  return (
    <div className="ios-app-bg min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">{inner}</div>
    </div>
  );
}
