'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar, Check, X, Ticket, Minus, Plus, Loader2, Clock, Timer, ClipboardCheck, Gift } from 'lucide-react';
import { ConsultationLog, LeaveRequest, RewardGrant } from '@/lib/types/student';
import { StudyStatsCard } from '@/components/report/study-stats-card';
import { LEAVE_TYPES } from '@/lib/leave';
import type { DailyChecklistEntry } from '@/lib/student-activity';

function leaveStatusChip(status: LeaveRequest['status']) {
  if (status === 'approved') return <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">승인</span>;
  if (status === 'rejected') return <span className="shrink-0 rounded-full bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-600">반려</span>;
  return <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">대기 중</span>;
}

interface ConsultTabProps {
  lifeComment: string;
  setLifeComment: (v: string) => void;
  studentLifeComment: string;
  setStudentLifeComment: (v: string) => void;
  lifeLogs: ConsultationLog[];
  // 출결/순공 통계
  studyStats?: any;
  todayAttendanceStatus?: {
    configured: boolean;
    today?: string;
    status: 'present' | 'left' | 'absent' | 'unconfigured' | 'unknown';
    checkInAt?: string;
    checkOutAt?: string | null;
    minutes?: number | null;
    minutesSoFar?: number;
    autoClosed?: boolean;
  } | null;
  todayActivityKey?: string;
  todayPomodoroStats?: { sessions: number; minutes: number };
  todayChecklist?: DailyChecklistEntry | null;
  // 휴가 신청
  leaveRequests?: LeaveRequest[];
  leaveCoupons?: number;
  couponGrants?: RewardGrant[];
  leaveActionBusy?: Record<string, boolean>;
  leaveReplyDrafts?: Record<string, string>;
  setLeaveReplyDrafts?: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onLeaveAction?: (requestId: string, payload: { status?: 'approved' | 'rejected' | 'pending'; reply?: string }) => Promise<void>;
  onCouponAdjust?: (delta: number) => Promise<void>;
}

// 생활 관리 탭 (프레젠테이셔널). 코멘트 저장은 부모의 마스터 저장/자동저장 경로에서 처리.
export function ConsultTab({
  lifeComment, setLifeComment,
  studentLifeComment, setStudentLifeComment,
  lifeLogs,
  studyStats,
  todayAttendanceStatus,
  todayActivityKey,
  todayPomodoroStats = { sessions: 0, minutes: 0 },
  todayChecklist = null,
  leaveRequests = [],
  leaveCoupons = 0,
  couponGrants = [],
  leaveActionBusy = {},
  leaveReplyDrafts = {},
  setLeaveReplyDrafts,
  onLeaveAction,
  onCouponAdjust,
}: ConsultTabProps) {
  const fmtMin = (min?: number | null) => {
    if (min == null) return '-';
    const safeMin = Math.max(0, Math.round(min));
    const h = Math.floor(safeMin / 60);
    const m = safeMin % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  };

  const attendanceLabel = (() => {
    if (!todayAttendanceStatus) return { title: '조회 중', detail: '실시간 출결을 불러오는 중입니다.', tone: 'text-slate-500' };
    if (!todayAttendanceStatus.configured || todayAttendanceStatus.status === 'unconfigured') {
      return {
        title: '미등원',
        detail: '오늘 등원 기록이 없습니다.',
        tone: 'text-red-600',
      };
    }
    if (todayAttendanceStatus.status === 'present') {
      return {
        title: `등원 중 · ${fmtMin(todayAttendanceStatus.minutes)}`,
        detail: `등원 ${todayAttendanceStatus.checkInAt || '-'} · 현재 세션 ${fmtMin(todayAttendanceStatus.minutesSoFar)}`,
        tone: 'text-emerald-700',
      };
    }
    if (todayAttendanceStatus.status === 'left') {
      if (todayAttendanceStatus.autoClosed) {
        return {
          title: '자동 하원 · 수동입력 필요',
          detail: `등원 ${todayAttendanceStatus.checkInAt || '-'} · 하원 미입력 · 순공 미반영`,
          tone: 'text-amber-700',
        };
      }
      return {
        title: `하원 완료 · ${fmtMin(todayAttendanceStatus.minutes)}`,
        detail: `등원 ${todayAttendanceStatus.checkInAt || '-'} · 하원 ${todayAttendanceStatus.checkOutAt || '-'} · 순공`,
        tone: 'text-[#0071E3]',
      };
    }
    if (todayAttendanceStatus.status === 'absent') {
      return { title: '미등원', detail: '오늘 출결 기록이 없습니다.', tone: 'text-red-600' };
    }
    return { title: '조회 실패', detail: '실시간 출결 상태를 확인하지 못했습니다.', tone: 'text-slate-500' };
  })();

  const checklistSubmittedAt = todayChecklist?.submitted_at
    ? new Date(todayChecklist.submitted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <>
      {/* 오늘 실시간 루틴 현황 */}
      <div className="space-y-3 p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[#0071E3]" />
            오늘 등원정보·생활 루틴
          </h3>
          <span className="text-[10px] font-bold text-slate-400">{todayAttendanceStatus?.today || todayActivityKey || '오늘'}</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              오늘 등원정보
            </p>
            <p className={`mt-1 text-sm font-semibold ${attendanceLabel.tone}`}>{attendanceLabel.title}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{attendanceLabel.detail}</p>
          </div>

          <div className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <Timer className="w-3.5 h-3.5" />
              뽀모도로 집중
            </p>
            <p className="mt-1 text-sm font-semibold text-[#0071E3]">
              {todayPomodoroStats.sessions}세션 · {fmtMin(todayPomodoroStats.minutes)}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">학생 홈에서 완료한 집중 기록</p>
          </div>

          <div className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <ClipboardCheck className="w-3.5 h-3.5" />
              자가점검표
            </p>
            {todayChecklist ? (
              <>
                <p className="mt-1 text-sm font-semibold text-emerald-700">제출 완료{checklistSubmittedAt ? ` · ${checklistSubmittedAt}` : ''}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  수면 {todayChecklist.sleep_hours ?? '-'}시간 · 휴대폰 {todayChecklist.phone_submitted ? '제출' : '미제출'}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-amber-700">미제출</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">오늘 자가점검 기록이 없습니다.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 출결·순공 현황 */}
      {studyStats && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#0071E3]" />
            출결·순공 현황
          </h3>
          <StudyStatsCard stats={studyStats} />
        </div>
      )}

      {/* 휴가·반차·휴식권 신청 내역 */}
      <div className="space-y-3 p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#0071E3]" />
            휴가·반차 신청 내역
          </h4>
          {/* 쿠폰 잔액 및 조정 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              <Ticket className="inline w-3 h-3 mr-0.5 text-amber-500" />
              쿠폰 {leaveCoupons}개
            </span>
            {onCouponAdjust && (
              <>
                <button
                  type="button"
                  onClick={() => onCouponAdjust(-1)}
                  className="rounded-md border border-black/[0.08] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-bold hover:bg-slate-200 dark:hover:bg-white/10"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCouponAdjust(1)}
                  className="rounded-md border border-black/[0.08] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-bold hover:bg-slate-200 dark:hover:bg-white/10"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCouponAdjust(3)}
                  className="rounded-md border border-[#0071E3]/20 bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-2 py-0.5 text-[10px] font-bold text-[#0071E3] hover:bg-[#0071E3]/10"
                >
                  +3
                </button>
              </>
            )}
          </div>
        </div>

        {/* 쿠폰 지급 이력 — 언제·무슨 사유로 지급됐는지(미션 정산/OT/행사/일일). 최근순. */}
        {couponGrants.length > 0 && (
          <details className="rounded-xl border border-black/[0.06] dark:border-white/10 bg-[#F9F9FB] dark:bg-white/5 px-3 py-2.5">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-300 select-none">
              <Gift className="w-3.5 h-3.5 text-amber-500" />
              쿠폰 지급 이력 {couponGrants.length}건
              <span className="ml-1 text-[10px] font-semibold text-slate-400">(펼치기)</span>
            </summary>
            <div className="mt-2.5 space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {couponGrants.map((g, i) => {
                const iso = g.grantedAt || '';
                const when = iso
                  ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
                  : (/^\d{4}-\d{2}-\d{2}$/.test(g.periodKey) ? g.periodKey : '시각 미기록');
                return (
                  <div key={`${g.grantedAt || g.periodKey}_${i}`} className="flex items-center gap-2 text-[11px]">
                    <span className="shrink-0 rounded-md bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/15 px-1.5 py-0.5 font-bold text-[#0071E3]">+{g.coupons}장</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{g.missionName}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">{when}</span>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {leaveRequests.length === 0 ? (
          <p className="text-center py-4 text-[11px] text-slate-500 dark:text-slate-400">신청 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2.5">
            {leaveRequests.map(req => {
              const typeInfo = LEAVE_TYPES[req.type];
              const busy = leaveActionBusy[req.id];
              const replyDraft = leaveReplyDrafts[req.id] ?? '';
              return (
                <div key={req.id} className="rounded-xl border border-black/[0.06] dark:border-white/10 bg-[#F9F9FB] dark:bg-white/5 p-3 space-y-2">
                  {/* 상단: 종류·날짜·상태 */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded-full bg-white dark:bg-white/10 border border-black/[0.08] dark:border-white/10 px-1.5 py-0.5 font-semibold text-slate-700 dark:text-slate-300">
                      {typeInfo?.label ?? req.type}
                    </span>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">{req.date}</span>
                    {leaveStatusChip(req.status)}
                    {req.usedCoupon && (
                      <span className="rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-1.5 py-0.5 font-bold text-amber-700">
                        쿠폰 사용
                      </span>
                    )}
                  </div>

                  {/* 사유 */}
                  {req.reason && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold whitespace-pre-wrap">{req.reason}</p>
                  )}

                  {/* 기존 관리자 답변 */}
                  {req.adminReply && (
                    <div className="rounded-lg border border-[#0071E3]/15 bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 px-2.5 py-1.5 text-[11px] font-semibold text-[#0071E3]">
                      답변: {req.adminReply}
                    </div>
                  )}

                  {/* 답변 입력 */}
                  {onLeaveAction && (
                    <div className="flex gap-1.5 items-center">
                      <input
                        value={replyDraft}
                        onChange={e =>
                          setLeaveReplyDrafts &&
                          setLeaveReplyDrafts(d => ({ ...d, [req.id]: e.target.value }))
                        }
                        placeholder="답변 메시지 (선택)"
                        className="min-w-0 flex-1 rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !replyDraft.trim()}
                        onClick={() => onLeaveAction(req.id, { reply: replyDraft.trim() })}
                        className="h-7 shrink-0 rounded-lg px-2.5 text-[10px] font-bold"
                      >
                        답변
                      </Button>
                    </div>
                  )}

                  {/* 승인/반려 액션 */}
                  {onLeaveAction && (
                    <div className="flex gap-1.5 flex-wrap">
                      {req.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onLeaveAction(req.id, { status: 'approved' })}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          승인
                        </button>
                      )}
                      {req.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onLeaveAction(req.id, { status: 'rejected' })}
                          className="flex items-center gap-1 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          반려
                        </button>
                      )}
                      {req.status !== 'pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onLeaveAction(req.id, { status: 'pending' })}
                          className="rounded-lg border border-black/[0.08] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50"
                        >
                          대기 중으로
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">학부모 공유용 생활 코멘트</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              학부모용 결과지에 그대로 표시되는 담임 생활 관리 피드백입니다.
            </p>
          </div>
        </div>
        <Textarea
          placeholder="예: 등원 시간, 휴대폰 통제, 수면/식사, 자습 태도, 멘탈 관리에 대한 코멘트를 입력하세요."
          value={lifeComment}
          onChange={(e) => setLifeComment(e.target.value)}
          className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-white/5 min-h-[110px]"
        />
      </div>

      <div className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">학생 공유용 생활 코멘트</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              학생 본인이 확인할 생활 습관, 자습 태도, 다음 행동 피드백입니다.
            </p>
          </div>
        </div>
        <Textarea
          placeholder="예: 이번 주는 등원 루틴을 유지하고, 쉬는 시간 휴대폰 사용을 줄이며, 자습 시작 전 오늘 목표를 먼저 적어주세요."
          value={studentLifeComment}
          onChange={(e) => setStudentLifeComment(e.target.value)}
          className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-white/5 min-h-[110px]"
        />
      </div>

      <div id="life-consultation-logs" className="space-y-4">
        <h3 className="text-sm font-bold border-b border-black/[0.05] dark:border-white/10 pb-2 flex items-center">
          <Calendar className="w-4 h-4 mr-2 text-slate-500" />
          누적 생활 면담 기록 ({lifeLogs.length}건)
        </h3>

        {lifeLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">
            등록된 생활 면담 기록이 없습니다.
          </div>
        ) : (
          <div className="relative border-l border-black/[0.08] dark:border-white/10 pl-5 ml-2.5 space-y-5">
            {lifeLogs.map((log) => (
              <div key={log.id} className="relative group">
                <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 dark:border-slate-100 bg-white dark:bg-[#1c1c1e] group-hover:bg-[#0071E3] transition-colors" />
                <div className="p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] space-y-2 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{log.date}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-[#F5F5F7] dark:bg-white/5 rounded-full text-slate-500 dark:text-slate-400 font-semibold">
                      면담자: {log.manager}
                    </span>
                  </div>
                  <pre className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                    {log.content}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
