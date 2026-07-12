'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CalendarClock, ClipboardCheck, CalendarHeart, Ticket, MessageCircle,
  ChevronLeft, ChevronRight, ChevronDown, Loader2, CheckCircle2, PenLine, ExternalLink, Megaphone, X,
  Plus, Pencil, Trash2, BookOpen, Circle, Flag, TrendingUp,
} from 'lucide-react';
import { OtEventNotice } from './ot-event-notice';
import { MockExamNotice } from './mock-exam-notice';
import { CampusEventNotice } from './campus-event-notice';
import type {
  StudentCalendarItem, CalendarItemKind, CalendarResponseState, MaterialProgressSummary,
} from '@/lib/student-calendar';
import { readableTextOn } from '@/lib/material-color';

type RiskLevel = MaterialProgressSummary['riskLevel'];

// 마감 위험도 → 마커/진행바/칩 색 (색=의미: danger 위험 red / warn 주의 amber / ok 순조 emerald)
function riskBar(r: RiskLevel): string {
  if (r === 'danger') return 'bg-red-500';
  if (r === 'warn') return 'bg-amber-500';
  return 'bg-emerald-500';
}
function riskSoftChip(r: RiskLevel): string {
  if (r === 'danger') return 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300';
  if (r === 'warn') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
}
function riskLabel(r: RiskLevel): string {
  if (r === 'danger') return '뒤처졌어요';
  if (r === 'warn') return '조금 뒤처져요';
  return '순조로워요';
}
// 남은 일수 → 라벨 (친근 ~요체)
function ddayLabel(days: number): string {
  if (days === 0) return '오늘 마감';
  if (days < 0) return '마감 지남';
  return `D-${days}`;
}
function formatMd(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  if (!m || !d) return dateKey;
  return `${m}/${d}`;
}

interface StudentCalendarTabProps {
  // 모의고사 성적입력 사후과제 → 학습(성적) 탭으로 인페이지 이동
  onNavigateToGrades?: () => void;
  // 응답/사후과제 반영 후 상위(홈 배지 등) 갱신용 (선택)
  onActionableChange?: (count: number) => void;
  // 자료 기간 바·진행 행 클릭 → 자료 상세 시트 열기(학생 뷰 전용).
  openMaterialDetail?: (materialType: 'book' | 'lecture', materialId: string) => void;
}

const KIND_META: Record<CalendarItemKind, { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; chip: string }> = {
  notice: { label: '공지', icon: Megaphone, dot: 'bg-[#0071E3]', chip: 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0071E3]/20 dark:text-blue-300' },
  ot: { label: 'OT', icon: CalendarClock, dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  mock: { label: '모의고사', icon: ClipboardCheck, dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  event: { label: '행사·일정', icon: CalendarHeart, dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  leave: { label: '반차·휴식', icon: Ticket, dot: 'bg-rose-400', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  consultation: { label: '상담', icon: MessageCircle, dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  makeup: { label: '보강', icon: BookOpen, dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  personal: { label: '내 일정', icon: Pencil, dot: 'bg-slate-800 dark:bg-slate-200', chip: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200' },
};

interface DayPlanItem {
  subjectName: string; title: string; unit: string; amount: number; range: string;
  isCompleted: boolean; actualAmount: number; selfPaced: boolean; current: number; weekly: boolean;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 달성률(%) → 진행바 색
function achievementColor(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-[#0071E3]';
  return 'bg-amber-500';
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 앱 내 경로(/로 시작, //host 제외) 또는 http(s) 링크만 안전 링크로 렌더 (오픈 리다이렉트 방지)
function isSafeHref(href: string): boolean {
  return /^\/(?!\/)[^\s]*$/.test(href) || /^https?:\/\//.test(href);
}

function formatDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const wd = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${wd})`;
}

export function StudentCalendarTab({ onNavigateToGrades, onActionableChange, openMaterialDetail }: StudentCalendarTabProps) {
  const [items, setItems] = useState<StudentCalendarItem[]>([]);
  const [studyByDate, setStudyByDate] = useState<Record<string, { planned: number; done: number }>>({});
  const [materialSummaries, setMaterialSummaries] = useState<MaterialProgressSummary[]>([]);
  const [progressOpen, setProgressOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [viewYm, setViewYm] = useState<{ y: number; m: number } | null>(null); // m: 0-index
  // 선택일의 공부 계획 상세
  const [dayPlan, setDayPlan] = useState<{ summary: { planned: number; done: number }; items: DayPlanItem[] } | null>(null);
  // 내 일정(개인 스케줄) 작성/수정/삭제
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null=신규 작성, 값=수정 대상 sourceId
  const [newTitle, setNewTitle] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/calendar', { credentials: 'same-origin', cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setItems(json.items || []);
        setStudyByDate(json.studyByDate || {});
        setMaterialSummaries(json.materialSummaries || []);
        onActionableChange?.(json.actionableCount || 0);
        if (json.todayKey) {
          setTodayKey((prev) => prev || json.todayKey);
          setSelectedDate((prev) => prev || json.todayKey);
          setViewYm((prev) => {
            if (prev) return prev;
            const [y, m] = String(json.todayKey).split('-').map(Number);
            return { y, m: m - 1 };
          });
        }
      }
    } catch {
      /* graceful: 빈 캘린더 */
    } finally {
      setLoading(false);
    }
  }, [onActionableChange]);

  useEffect(() => { load(); }, [load]);

  // 방어: API 응답이 실패/지연해도 월 그리드는 반드시 뜨게 — viewYm/todayKey 를 클라이언트 KST 날짜로 폴백 초기화.
  // (과거: API 실패 시 viewYm 이 null 로 남아 캘린더가 빈 껍데기로 보였다.)
  useEffect(() => {
    if (viewYm) return;
    const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const [y, m] = kst.split('-').map(Number);
    if (y && m) {
      setViewYm({ y, m: m - 1 });
      setTodayKey((prev) => prev || kst);
      setSelectedDate((prev) => prev || kst);
    }
  }, [viewYm]);

  // 새로고침 없이 알림 반영: 포커스/가시성 복귀(20초 스로틀) + 화면이 보일 때 60초 폴링.
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 20_000) return;
      last = now;
      load();
    };
    const poll = () => { if (document.visibilityState === 'visible') { last = Date.now(); load(); } };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const iv = setInterval(poll, 60_000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(iv);
    };
  }, [load]);

  // 선택일이 바뀌면 그날 공부 계획 상세를 불러온다.
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    setDayPlan(null);
    fetch(`/api/student/day-plan?date=${selectedDate}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.success) setDayPlan({ summary: j.summary, items: j.items || [] }); })
      .catch(() => { /* graceful */ });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const resetForm = useCallback(() => {
    setAdding(false); setEditingId(null); setNewTitle(''); setNewMemo('');
  }, []);

  // 신규 작성(POST) · 수정(PATCH) 겸용 저장
  const saveEntry = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || !selectedDate || entryBusy) return;
    setEntryBusy(true);
    try {
      const res = editingId
        ? await fetch('/api/student/calendar-entry', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ id: editingId, title, memo: newMemo.trim() || undefined }),
          })
        : await fetch('/api/student/calendar-entry', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ date: selectedDate, title, memo: newMemo.trim() || undefined }),
          });
      const json = await res.json();
      if (res.ok && json.success) {
        resetForm();
        await load();
      }
    } catch { /* noop */ } finally {
      setEntryBusy(false);
    }
  }, [newTitle, newMemo, selectedDate, entryBusy, editingId, load, resetForm]);

  const startEdit = useCallback((sourceId: string, title: string, memo: string) => {
    setEditingId(sourceId); setNewTitle(title); setNewMemo(memo); setAdding(true);
  }, []);

  const deleteEntry = useCallback(async (sourceId: string) => {
    try {
      const res = await fetch(`/api/student/calendar-entry?id=${encodeURIComponent(sourceId)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (res.ok) await load();
    } catch { /* noop */ }
  }, [load]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, StudentCalendarItem[]>();
    for (const it of items) {
      // 다중일 행사는 시작일 셀에만 표시(상세에서 종료일 안내)
      const bucket = map.get(it.date);
      if (bucket) bucket.push(it);
      else map.set(it.date, [it]);
    }
    return map;
  }, [items]);

  // 진행 패널/마커에서 특정 날짜로 이동(달 전환 + 선택).
  const goToDate = useCallback((dateKey: string) => {
    const [y, m] = dateKey.split('-').map(Number);
    if (y && m) setViewYm({ y, m: m - 1 });
    setSelectedDate(dateKey);
  }, []);

  const monthCells = useMemo(() => {
    if (!viewYm) return [];
    const { y, m } = viewYm;
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Array<{ dateKey: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ dateKey: ymd(y, m, d), day: d });
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYm]);

  // ── 기간지정(마감) 자료 → 시작~마감 스팬 바(구글 캘린더식) ──────────────────
  // 겹치지 않게 레인(가로 줄) 배정: 시작일 순 그리디 — 각 자료를 마지막 사용 마감일이 겹치지 않는 최하단 레인에.
  const materialLanes = useMemo(() => {
    const valid = materialSummaries.filter((m) => m.startDate && m.endDate && m.startDate <= m.endDate);
    const sorted = [...valid].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
    const laneEnds: string[] = []; // 레인별 마지막 마감일
    const laneOf = new Map<string, number>();
    for (const m of sorted) {
      let lane = laneEnds.findIndex((end) => end < m.startDate);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(m.endDate); }
      else laneEnds[lane] = m.endDate;
      laneOf.set(m.id, lane);
    }
    return { laneOf, laneCount: laneEnds.length };
  }, [materialSummaries]);

  // 월 셀을 주(7칸) 단위로 나눈다 — 주별로 스팬 바를 그린다.
  const weeks = useMemo(() => {
    const out: Array<Array<{ dateKey: string; day: number } | null>> = [];
    for (let i = 0; i < monthCells.length; i += 7) out.push(monthCells.slice(i, i + 7));
    return out;
  }, [monthCells]);

  const monthActionable = useMemo(() => {
    if (!viewYm) return 0;
    const prefix = `${viewYm.y}-${String(viewYm.m + 1).padStart(2, '0')}`;
    return items.filter((i) => i.date.startsWith(prefix) && (i.responseState === 'needs-response' || i.responseState === 'post-task')).length;
  }, [items, viewYm]);

  const selectedItems = useMemo(() => itemsByDate.get(selectedDate) || [], [itemsByDate, selectedDate]);

  const shiftMonth = (delta: number) => {
    setViewYm((prev) => {
      if (!prev) return prev;
      const base = new Date(prev.y, prev.m + delta, 1);
      return { y: base.getFullYear(), m: base.getMonth() };
    });
  };

  const monthLabel = viewYm ? `${viewYm.y}년 ${viewYm.m + 1}월` : '';

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[680px] items-center justify-center px-4 py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 px-4 sm:px-5">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-[#0071E3]" />
        <h1 className="text-base font-black text-slate-900 dark:text-slate-100">캘린더</h1>
        {monthActionable > 0 && (
          <span className="ml-auto rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
            응답 필요 {monthActionable}건
          </span>
        )}
      </div>

      {/* 월 그리드 */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-black text-slate-900 dark:text-slate-100">{monthLabel}</span>
          <button type="button" onClick={() => shiftMonth(1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="text-center">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={w} className={`pb-1 text-[11px] font-bold ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-slate-400'}`}>{w}</div>
            ))}
          </div>
          {/* 주 단위: 날짜 칸 + 자료 기간 스팬 바(구글 캘린더식 레인) */}
          {weeks.map((week, wi) => {
            const real = week.filter(Boolean) as Array<{ dateKey: string; day: number }>;
            const wStart = real[0]?.dateKey, wEnd = real[real.length - 1]?.dateKey;
            // 이 주에 걸치는 자료별 세그먼트(레인·시작칸·칸수)
            const segs: Array<{ lane: number; startCol: number; span: number; m: MaterialProgressSummary }> = [];
            if (wStart && wEnd) {
              for (const m of materialSummaries) {
                if (m.endDate < wStart || m.startDate > wEnd) continue;
                let startCol = -1, endCol = -1;
                week.forEach((c, ci) => { if (c && m.startDate <= c.dateKey && c.dateKey <= m.endDate) { if (startCol === -1) startCol = ci; endCol = ci; } });
                if (startCol === -1) continue;
                segs.push({ lane: materialLanes.laneOf.get(m.id) ?? 0, startCol, span: endCol - startCol + 1, m });
              }
            }
            const laneCount = segs.length ? Math.max(...segs.map((s) => s.lane)) + 1 : 0;
            return (
              <div key={`w_${wi}`} className="mt-1">
                {/* 날짜 칸 */}
                <div className="grid grid-cols-7 gap-1">
                  {week.map((cell, ci) => {
                    if (!cell) return <div key={`b_${wi}_${ci}`} />;
                    const dayItems = itemsByDate.get(cell.dateKey) || [];
                    const isToday = cell.dateKey === todayKey;
                    const isSelected = cell.dateKey === selectedDate;
                    const kinds = Array.from(new Set(dayItems.map((i) => i.kind)));
                    const hasAction = dayItems.some((i) => i.responseState === 'needs-response' || i.responseState === 'post-task');
                    const study = studyByDate[cell.dateKey];
                    const studyPct = study && study.planned > 0 ? Math.round((100 * study.done) / study.planned) : 0;
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        onClick={() => setSelectedDate(cell.dateKey)}
                        className={`relative flex min-h-[2.75rem] flex-col items-center justify-start rounded-xl border py-1 transition ${
                          isSelected
                            ? 'border-[#0071E3] bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold ${
                          isToday ? 'bg-[#0071E3] text-white' : 'text-slate-700 dark:text-slate-200'
                        }`}>{cell.day}</span>
                        {kinds.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                            {kinds.slice(0, 4).map((k) => (
                              <span key={k} className={`h-1.5 w-1.5 rounded-full ${KIND_META[k].dot}`} />
                            ))}
                          </span>
                        )}
                        {study && (
                          <span className="mt-auto mb-0.5 block h-1 w-7 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" title={`공부 계획 ${study.done}/${study.planned}`}>
                            <span className={`block h-full rounded-full ${achievementColor(studyPct)}`} style={{ width: `${studyPct}%` }} />
                          </span>
                        )}
                        {hasAction && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                      </button>
                    );
                  })}
                </div>
                {/* 자료 기간 바 — 자료 색으로 시작~마감까지 이어짐. 겹치면 레인으로 쌓임. */}
                {Array.from({ length: laneCount }).map((_, lane) => (
                  <div key={`l_${wi}_${lane}`} className="mt-[3px] grid grid-cols-7 gap-x-1">
                    {segs.filter((s) => s.lane === lane).map((s, si) => {
                      const isStart = s.m.startDate >= (wStart || '') && week[s.startCol]?.dateKey === s.m.startDate;
                      const isEnd = s.m.endDate <= (wEnd || '') && week[s.startCol + s.span - 1]?.dateKey === s.m.endDate;
                      return (
                        <button
                          key={`${s.m.id}_${si}`}
                          type="button"
                          onClick={() => (openMaterialDetail ? openMaterialDetail(s.m.materialType, s.m.materialId) : goToDate(s.m.startDate))}
                          title={`${s.m.subject} · ${s.m.title} · ${formatMd(s.m.startDate)}~${formatMd(s.m.endDate)} 마감`}
                          style={{
                            gridColumn: `${s.startCol + 1} / span ${s.span}`,
                            backgroundColor: s.m.color,
                            color: readableTextOn(s.m.color),
                            borderTopLeftRadius: isStart ? 5 : 2,
                            borderBottomLeftRadius: isStart ? 5 : 2,
                            borderTopRightRadius: isEnd ? 5 : 2,
                            borderBottomRightRadius: isEnd ? 5 : 2,
                          }}
                          className="flex h-[15px] items-center overflow-hidden whitespace-nowrap px-1 text-left text-[8.5px] font-bold leading-none transition active:scale-[0.98]"
                        >
                          <span className="truncate">{isStart ? s.m.title : `${s.m.title} ›`}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/5 pt-3 dark:border-white/10">
          {(Object.keys(KIND_META) as CalendarItemKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${KIND_META[k].dot}`} />{KIND_META[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="inline-block h-2.5 w-4 rounded-[3px] bg-gradient-to-r from-rose-400 to-sky-400" /> 자료 기간 <span className="font-medium text-slate-400 dark:text-slate-500">(색=자료, 시작~마감)</span>
          </span>
        </div>
      </div>

      {/* 과목별 진행 — 노션 캘린더식. 자료별 진행바·마감일·남은일·상태칩. */}
      {materialSummaries.length > 0 && (
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
          <button
            type="button"
            onClick={() => setProgressOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2"
          >
            <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-slate-100">
              <TrendingUp className="h-4 w-4 text-[#0071E3]" /> 과목별 진행
            </h2>
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">자료 {materialSummaries.length}개</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {progressOpen && (
            <div className="mt-3 flex flex-col gap-2">
              {materialSummaries.map((m) => (
                <MaterialProgressRow key={m.id} m={m} onOpen={() => (openMaterialDetail ? openMaterialDetail(m.materialType, m.materialId) : goToDate(m.endDate))} canOpen={!!openMaterialDetail} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 선택 날짜 상세 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">{selectedDate ? formatDateLabel(selectedDate) : ''}</h2>
          {selectedDate && !adding && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setNewTitle(''); setNewMemo(''); setAdding(true); }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-black text-white active:scale-95 dark:bg-white dark:text-slate-900"
            >
              <Plus className="h-3.5 w-3.5" /> 내 일정 추가
            </button>
          )}
        </div>

        {/* 그날의 공부 계획 · 달성도 */}
        {dayPlan && dayPlan.items.length > 0 && (
          <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-slate-100">
                <BookOpen className="h-3.5 w-3.5 text-[#0071E3]" /> 공부 계획
              </h3>
              {dayPlan.summary.planned > 0 && (() => {
                const pct = Math.round((100 * dayPlan.summary.done) / dayPlan.summary.planned);
                return (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      <span className={`block h-full rounded-full ${achievementColor(pct)}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-[11px] font-black tabular-nums text-slate-600 dark:text-slate-300">
                      {dayPlan.summary.done}/{dayPlan.summary.planned} · {pct}%
                    </span>
                  </span>
                );
              })()}
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {dayPlan.items.map((it, idx) => {
                const done = it.isCompleted;
                const target = it.selfPaced
                  ? `자율 (누적 ${it.current}${it.unit})`
                  : it.range || (it.amount ? `${it.amount}${it.unit}` : '');
                return (
                  <div key={`${it.title}_${idx}`} className="flex items-start gap-2">
                    {done
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`break-keep text-[12px] font-bold ${done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{it.title}</span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">{it.subjectName}</span>
                        {it.weekly && <span className="shrink-0 rounded-full bg-[#0071E3]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0071E3]">주간</span>}
                      </span>
                      {target && <span className="mt-0.5 block text-[11px] font-semibold text-slate-400 dark:text-slate-500">{target}{done && it.actualAmount ? ` · 완료 ${it.actualAmount}${it.unit}` : ''}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 내 일정 작성/수정 폼 */}
        {adding && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="mb-2 text-[11px] font-black text-slate-500 dark:text-slate-400">{editingId ? '내 일정 수정' : '내 일정 추가'}</p>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={100}
              placeholder="예: 국어 모의고사 오답 정리, 스터디 모임"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-slate-400 focus:outline-none dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-100"
              autoFocus
            />
            <input
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              maxLength={500}
              placeholder="메모 (선택)"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 focus:border-slate-400 focus:outline-none dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-200"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEntry}
                disabled={!newTitle.trim() || entryBusy}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-1.5 text-[11px] font-black text-white disabled:opacity-50 active:scale-95 dark:bg-white dark:text-slate-900"
              >
                {entryBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '저장'}
              </button>
            </div>
          </div>
        )}

        {selectedItems.length === 0 && !adding && !(dayPlan && dayPlan.items.length > 0) ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400 dark:border-white/10 dark:bg-[#1c1c1e]">
            이 날 일정이 없어요. <span className="font-black text-slate-700 dark:text-slate-200">‘내 일정 추가’</span>로 내 스케줄을 적어보세요.
          </div>
        ) : (
          selectedItems.map((item) => (
            <CalendarDetailRow
              key={item.id}
              item={item}
              onResponded={load}
              onNavigateToGrades={onNavigateToGrades}
              onDeletePersonal={deleteEntry}
              onEditPersonal={(id, title, memo) => startEdit(id, title, memo)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: CalendarResponseState }) {
  if (state === 'needs-response') return <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">응답 필요</span>;
  if (state === 'post-task') return <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">제출 필요</span>;
  if (state === 'accepted') return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">참석</span>;
  if (state === 'declined') return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">불참</span>;
  return null;
}

// 과목별 진행 한 줄 — 진행바(actualRatio)·마감일·남은일·상태칩. 클릭 시 마감일로 이동.
function MaterialProgressRow({ m, onOpen, canOpen }: { m: MaterialProgressSummary; onOpen: () => void; canOpen: boolean }) {
  const pct = Math.round(m.actualRatio * 100);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-black/5 bg-slate-50 p-2.5 text-left transition active:scale-[0.99] hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* 자료 색상은 태그에만 — 카드 전체 색칠은 지양 */}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${m.color}22`, color: m.color }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
            {m.subject}
          </span>
          <span className="truncate text-[12px] font-bold text-slate-800 dark:text-slate-100">{m.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${riskSoftChip(m.riskLevel)}`}>{riskLabel(m.riskLevel)}</span>
          {canOpen && <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <span className={`block h-full rounded-full ${riskBar(m.riskLevel)}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </span>
        <span className="shrink-0 text-[10px] font-black tabular-nums text-slate-500 dark:text-slate-300">{pct}%</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-0.5"><Flag className="h-2.5 w-2.5" /> {formatMd(m.endDate)} 마감</span>
        <span>·</span>
        <span>{ddayLabel(m.daysRemaining)}</span>
        <span>·</span>
        <span className="tabular-nums">{m.actualAmount}/{m.targetAmount}{m.unit}</span>
      </div>
    </button>
  );
}

function CalendarDetailRow({
  item, onResponded, onNavigateToGrades, onDeletePersonal, onEditPersonal,
}: {
  item: StudentCalendarItem;
  onResponded: () => void;
  onNavigateToGrades?: () => void;
  onDeletePersonal?: (sourceId: string) => void;
  onEditPersonal?: (sourceId: string, title: string, memo: string) => void;
}) {
  const [zoom, setZoom] = useState(false);

  // 라이트박스 열림 동안 Escape 로 닫기
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  // 응답형(미응답) — 기존 응답 카드 재사용
  if (item.responseState === 'needs-response') {
    if (item.kind === 'ot' && item.otRaw) return <OtEventNotice events={[item.otRaw]} onResponded={onResponded} />;
    if (item.kind === 'mock' && item.mockRaw) return <MockExamNotice exams={[item.mockRaw]} onResponded={onResponded} />;
    if (item.kind === 'event' && item.eventRaw) return <CampusEventNotice events={[item.eventRaw]} onResponded={onResponded} />;
  }

  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  // 사진 공지 — 썸네일 클릭 시 전체 이미지 라이트박스
  if (item.kind === 'notice' && item.imageUrl) {
    return (
      <>
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="flex w-full items-start gap-3 rounded-2xl border border-black/5 bg-white p-3 text-left shadow-sm transition active:scale-[0.99] dark:border-white/10 dark:bg-[#1c1c1e]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="break-keep text-xs font-black text-slate-900 dark:text-slate-100">{item.title}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
            </span>
            {item.detail && <span className="mt-0.5 block break-keep text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.detail}</span>}
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#0071E3]"><Megaphone className="h-3 w-3" /> 눌러서 크게 보기</span>
          </span>
        </button>
        {zoom && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setZoom(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          >
            <button type="button" onClick={() => setZoom(false)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white">
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt={item.title} className="max-h-[85vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${meta.chip}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="break-keep text-xs font-black text-slate-900 dark:text-slate-100">{item.title}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
          <StateBadge state={item.responseState} />
          {item.kind === 'personal' && (onEditPersonal || onDeletePersonal) && (
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {onEditPersonal && (
                <button
                  type="button"
                  onClick={() => onEditPersonal(item.sourceId, item.title, item.detail || '')}
                  className="text-slate-300 transition-colors hover:text-[#0071E3] dark:text-slate-600"
                  aria-label="내 일정 수정"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onDeletePersonal && (
                <button
                  type="button"
                  onClick={() => onDeletePersonal(item.sourceId)}
                  className="text-slate-300 transition-colors hover:text-red-500 dark:text-slate-600"
                  aria-label="내 일정 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          )}
        </div>
        {(item.startTime || item.endDate) && (
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            {item.endDate && item.endDate !== item.date ? `${item.date} ~ ${item.endDate}` : ''}
            {item.startTime ? ` ${item.startTime}` : ''}
          </p>
        )}
        {item.detail && <p className="mt-0.5 break-keep text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.detail}</p>}

        {/* 사후과제 — 모의고사 성적입력은 인페이지 이동, 그 외는 관리자 링크 */}
        {item.responseState === 'post-task' && (
          <div className="mt-2">
            {item.kind === 'mock' ? (
              <button
                type="button"
                onClick={onNavigateToGrades}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-3 py-2 text-[11px] font-black text-white active:scale-95"
              >
                <PenLine className="h-3.5 w-3.5" /> {item.postTaskLabel || '성적 입력'}
                {item.postTaskDueDate && <span className="ml-0.5 font-bold text-white/70">~{item.postTaskDueDate}</span>}
              </button>
            ) : item.postTaskHref && isSafeHref(item.postTaskHref) ? (
              <a
                href={item.postTaskHref}
                {...(/^https?:\/\//.test(item.postTaskHref) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-3 py-2 text-[11px] font-black text-white active:scale-95"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {item.postTaskLabel || '제출하기'}
                {item.postTaskDueDate && <span className="ml-0.5 font-bold text-white/70">~{item.postTaskDueDate}</span>}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> {item.postTaskLabel || '제출 필요'}
                {item.postTaskDueDate && <span className="ml-0.5 font-bold opacity-70">~{item.postTaskDueDate}</span>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
