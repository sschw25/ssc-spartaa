'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, Search, Users, X, MessageSquare } from 'lucide-react';
import type { Student } from '@/lib/types/student';
import { useOverlayTransition } from '@/hooks/use-overlay-transition';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const getCampusLabel = (c: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

// 이벤트 대상(캠퍼스 + 목표시험 유형)으로 매칭되는 학생 판정 — lib scope 함수와 동일 규칙.
function matchStudent(student: Student, campus: string | undefined, targetExamTypes: string[] | undefined): boolean {
  if (campus && campus !== 'all' && student.campus !== campus) return false;
  const types = (targetExamTypes || []).map((t) => t.trim()).filter(Boolean);
  if (types.length === 0) return true;
  const contact = student.contact || '';
  return types.some((t) => contact.includes(t));
}

type PartStatus = 'accepted' | 'declined' | 'pending';
const STATUS_FILTERS: [PartStatus | 'all', string][] = [
  ['all', '전체'], ['accepted', '수락'], ['pending', '미응답'], ['declined', '불참'],
];
const STATUS_BADGE: Record<PartStatus, { label: string; cls: string }> = {
  accepted: { label: '수락', cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  pending: { label: '미응답', cls: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400' },
  declined: { label: '불참', cls: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' },
};

// 부모는 이벤트별로 조건부 렌더 + key={eventId} 로 마운트해, 열 때마다 매칭 학생 전체 체크로 초기화한다.
interface RecipientPickerModalProps {
  eventName: string;
  kindLabel: string;          // 'OT' | '모의고사' | '참여 미션'
  students: Student[];        // 관리자 스코프 전체 학생 (또는 이벤트 후보 풀)
  campus?: string;            // 이벤트 대상 캠퍼스
  targetExamTypes?: string[]; // 이벤트 대상 목표시험 유형
  sending: boolean;
  onCancel: () => void;
  onSend: (studentIds: string[]) => void;
  // 응답상태 필터(참여 미션 재발송/리마인더용). 제공 시 수락/미응답/불참 필터 + 상태 뱃지 노출.
  participations?: Map<string, PartStatus>;
  showStatusFilter?: boolean;
}

// 알림 발송 전 수신 대상 학생 체크리스트. 직렬 매칭 학생을 전부 체크해 보여주고, 뺄 사람만 해제한다.
export function RecipientPickerModal({
  eventName, kindLabel, students, campus, targetExamTypes, sending, onCancel, onSend,
  participations, showStatusFilter,
}: RecipientPickerModalProps) {
  const matched = useMemo(
    () => students.filter((s) => matchStudent(s, campus, targetExamTypes)),
    [students, campus, targetExamTypes],
  );

  // 직렬(contact) 필터 후보 — 매칭 학생의 고유 직렬값
  const contactOptions = useMemo(
    () => Array.from(new Set(matched.map((s) => (s.contact || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [matched],
  );

  // 마운트 시 매칭 학생 전부 체크 상태로 초기화 (부모가 이벤트별 key 로 remount)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(matched.map((s) => s.id)));
  // 필터는 다중선택(중복선택) — 빈 Set = 전체. 각 차원 내부는 합집합(OR), 차원 간은 교집합(AND).
  const [campusSel, setCampusSel] = useState<Set<string>>(() => new Set());
  const [contactSel, setContactSel] = useState<Set<string>>(() => new Set());
  const [statusSel, setStatusSel] = useState<Set<PartStatus>>(() => new Set());
  const [query, setQuery] = useState('');
  // 닫힘 전환 — 취소(X·닫기)는 exit 애니메이션 재생 후 onCancel. 발송(onSend)은 부모가 언마운트 관리.
  const { closing, requestClose } = useOverlayTransition(onCancel);

  const statusOf = (id: string): PartStatus => participations?.get(id) ?? 'pending';
  const toggleCampus = (c: string) => setCampusSel((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const toggleContact = (c: string) => setContactSel((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const toggleStatus = (v: PartStatus) => setStatusSel((p) => { const n = new Set(p); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  const q = query.trim().toLowerCase();
  const visible = matched.filter((s) => {
    if (campusSel.size && !campusSel.has(s.campus)) return false;
    if (contactSel.size && !contactSel.has((s.contact || '').trim())) return false;
    if (showStatusFilter && statusSel.size && !statusSel.has(statusOf(s.id))) return false;
    if (q && !(`${s.name}`.toLowerCase().includes(q) || (s.contact || '').toLowerCase().includes(q))) return false;
    return true;
  });
  const visibleIds = visible.map((s) => s.id);
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedCount = selected.size;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${closing ? 'animate-out fade-out-0' : 'animate-in fade-in-0'}`} style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className={`w-full max-w-lg rounded-3xl glass-strong shadow-2xl flex flex-col max-h-[85vh] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${closing ? 'animate-out zoom-out-95 fade-out-0' : 'animate-in zoom-in-95 fade-in-0'}`}>
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 break-keep">
              <Users className="w-4 h-4 text-[#0071E3] shrink-0" /> {kindLabel} 수신 대상 선택
            </h3>
            <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400 mt-1 break-keep">
              {eventName} · 체크된 학생에게만 알림이 갑니다.
            </p>
          </div>
          <button type="button" onClick={requestClose} disabled={sending}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 필터 */}
        <div className="px-5 space-y-2.5">
          {/* 캠퍼스 — 다중선택(여러 센터 동시 선택 가능) */}
          <div className="flex flex-wrap gap-1.5">
            {CAMPUS_FILTERS.map((c) => {
              const active = c === 'all' ? campusSel.size === 0 : campusSel.has(c);
              return (
                <button key={c} type="button" onClick={() => (c === 'all' ? setCampusSel(new Set()) : toggleCampus(c))}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-black border transition active:scale-95 ${
                    active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 hover:border-slate-300'
                  }`}>
                  {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
                </button>
              );
            })}
          </div>
          {/* 직렬 — 다중선택 */}
          {contactOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setContactSel(new Set())}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-black border transition active:scale-95 ${
                  contactSel.size === 0 ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 hover:border-slate-300'
                }`}>
                전체 직렬
              </button>
              {contactOptions.map((c) => (
                <button key={c} type="button" onClick={() => toggleContact(c)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-black border transition active:scale-95 ${
                    contactSel.has(c) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 hover:border-slate-300'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {/* 응답상태 — 다중선택 */}
          {showStatusFilter && (
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map(([v, label]) => {
                const active = v === 'all' ? statusSel.size === 0 : statusSel.has(v);
                return (
                  <button key={v} type="button" onClick={() => (v === 'all' ? setStatusSel(new Set()) : toggleStatus(v))}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-black border transition active:scale-95 ${
                      active ? 'border-[#0071E3] bg-[#0071E3] text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 hover:border-slate-300'
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="relative">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학생명 또는 코멘터 검색"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] pl-8 pr-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none" />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={toggleAllVisible}
              className="text-[11px] font-black text-[#0071E3] hover:underline">
              {allVisibleChecked ? '표시된 학생 전체 해제' : '표시된 학생 전체 선택'}
            </button>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              선택 {selectedCount}명 / 매칭 {matched.length}명
            </span>
          </div>
        </div>

        {/* 학생 목록 */}
        <div className="mt-2.5 px-5 overflow-y-auto flex-1">
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs font-bold text-slate-400">해당하는 학생이 없습니다.</div>
          ) : (
            <div className="divide-y divide-slate-100/70 dark:divide-white/10">
              {visible.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => toggle(s.id)}
                    className="w-full flex items-center gap-2.5 py-2.5 text-left transition active:scale-[0.99]">
                    <span className={`grid place-items-center w-5 h-5 rounded-md border shrink-0 transition ${
                      checked ? 'bg-[#0071E3] border-[#0071E3] text-white' : 'border-slate-300 dark:border-white/20 bg-white dark:bg-[#1c1c1e]'
                    }`}>
                      {checked && <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current"><path d="M7.5 13.5l-3-3 1.4-1.4 1.6 1.6 4.6-4.6L13.5 7.5z" /></svg>}
                    </span>
                    <span className="font-black text-slate-800 dark:text-slate-200 text-[13px]">{s.name}</span>
                    <span className="rounded-md bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 text-[9px] font-black">{getCampusLabel(s.campus)}</span>
                    {showStatusFilter && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black ${STATUS_BADGE[statusOf(s.id)].cls}`}>{STATUS_BADGE[statusOf(s.id)].label}</span>
                    )}
                    {s.contact && <span className="text-[11px] font-semibold text-slate-400 truncate">{s.contact}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex gap-2 justify-end p-5 pt-3 border-t border-black/[0.06] dark:border-white/10">
          <button type="button" onClick={requestClose} disabled={sending}
            className="h-9 rounded-2xl bg-[#F5F5F7] dark:bg-white/10 px-4 text-[12px] font-bold text-slate-900 dark:text-slate-100 hover:bg-[#E5E5EA] dark:hover:bg-white/15 transition-colors disabled:opacity-50">
            닫기
          </button>
          <button type="button" onClick={() => onSend([...selected])} disabled={sending || selectedCount === 0}
            className="h-9 rounded-2xl bg-[#0071E3] hover:bg-[#005DB9] px-4 text-[12px] font-black text-white flex items-center gap-1.5 transition-colors disabled:opacity-50">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            {selectedCount}명에게 발송
          </button>
        </div>
      </div>
    </div>
  );
}
