'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CalendarClock, ClipboardCheck, CalendarHeart, Ticket, MessageCircle,
  ChevronLeft, ChevronRight, Loader2, CheckCircle2, PenLine, ExternalLink, Megaphone, X,
  Plus, Pencil, Trash2, BookOpen, Circle,
} from 'lucide-react';
import { OtEventNotice } from './ot-event-notice';
import { MockExamNotice } from './mock-exam-notice';
import { CampusEventNotice } from './campus-event-notice';
import type { StudentCalendarItem, CalendarItemKind, CalendarResponseState } from '@/lib/student-calendar';

interface StudentCalendarTabProps {
  // 모의고사 성적입력 사후과제 → 학습(성적) 탭으로 인페이지 이동
  onNavigateToGrades?: () => void;
  // 응답/사후과제 반영 후 상위(홈 배지 등) 갱신용 (선택)
  onActionableChange?: (count: number) => void;
}

const KIND_META: Record<CalendarItemKind, { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; chip: string }> = {
  notice: { label: '공지', icon: Megaphone, dot: 'bg-[#0071E3]', chip: 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0071E3]/20 dark:text-blue-300' },
  ot: { label: 'OT', icon: CalendarClock, dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  mock: { label: '모의고사', icon: ClipboardCheck, dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  event: { label: '행사·일정', icon: CalendarHeart, dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  leave: { label: '반차·휴식', icon: Ticket, dot: 'bg-rose-400', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  consultation: { label: '상담', icon: MessageCircle, dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
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

export function StudentCalendarTab({ onNavigateToGrades, onActionableChange }: StudentCalendarTabProps) {
  const [items, setItems] = useState<StudentCalendarItem[]>([]);
  const [studyByDate, setStudyByDate] = useState<Record<string, { planned: number; done: number }>>({});
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [viewYm, setViewYm] = useState<{ y: number; m: number } | null>(null); // m: 0-index
  // 선택일의 공부 계획 상세
  const [dayPlan, setDayPlan] = useState<{ summary: { planned: number; done: number }; items: DayPlanItem[] } | null>(null);
  // 내 일정(개인 스케줄) 작성/삭제
  const [adding, setAdding] = useState(false);
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

  const addEntry = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || !selectedDate || entryBusy) return;
    setEntryBusy(true);
    try {
      const res = await fetch('/api/student/calendar-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ date: selectedDate, title, memo: newMemo.trim() || undefined }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNewTitle(''); setNewMemo(''); setAdding(false);
        await load();
      }
    } catch { /* noop */ } finally {
      setEntryBusy(false);
    }
  }, [newTitle, newMemo, selectedDate, entryBusy, load]);

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

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={w} className={`pb-1 text-[11px] font-bold ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-slate-400'}`}>{w}</div>
          ))}
          {monthCells.map((cell, idx) => {
            if (!cell) return <div key={`b_${idx}`} />;
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
                className={`relative flex aspect-square flex-col items-center justify-start rounded-xl border py-1.5 transition ${
                  isSelected
                    ? 'border-[#0071E3] bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15'
                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold ${
                  isToday ? 'bg-[#0071E3] text-white' : 'text-slate-700 dark:text-slate-200'
                }`}>{cell.day}</span>
                {kinds.length > 0 && (
                  <span className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
                    {kinds.slice(0, 4).map((k) => (
                      <span key={k} className={`h-1.5 w-1.5 rounded-full ${KIND_META[k].dot}`} />
                    ))}
                  </span>
                )}
                {/* 공부 계획 달성 미니바 — 계획 있는 날만. 채움=달성분, 트랙=미달(미래는 0%). */}
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

        {/* 범례 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/5 pt-3 dark:border-white/10">
          {(Object.keys(KIND_META) as CalendarItemKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${KIND_META[k].dot}`} />{KIND_META[k].label}
            </span>
          ))}
        </div>
      </div>

      {/* 선택 날짜 상세 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">{selectedDate ? formatDateLabel(selectedDate) : ''}</h2>
          {selectedDate && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
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

        {/* 내 일정 작성 폼 */}
        {adding && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
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
                onClick={() => { setAdding(false); setNewTitle(''); setNewMemo(''); }}
                className="rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                취소
              </button>
              <button
                type="button"
                onClick={addEntry}
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
            <CalendarDetailRow key={item.id} item={item} onResponded={load} onNavigateToGrades={onNavigateToGrades} onDeletePersonal={deleteEntry} />
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

function CalendarDetailRow({
  item, onResponded, onNavigateToGrades, onDeletePersonal,
}: {
  item: StudentCalendarItem;
  onResponded: () => void;
  onNavigateToGrades?: () => void;
  onDeletePersonal?: (sourceId: string) => void;
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
          {item.kind === 'personal' && onDeletePersonal && (
            <button
              type="button"
              onClick={() => onDeletePersonal(item.sourceId)}
              className="ml-auto shrink-0 text-slate-300 transition-colors hover:text-red-500 dark:text-slate-600"
              aria-label="내 일정 삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
