'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar, Check, X, Ticket, Minus, Plus, Loader2 } from 'lucide-react';
import { ConsultationLog, LeaveRequest } from '@/lib/types/student';
import { StudyStatsCard } from '@/components/report/study-stats-card';
import { LEAVE_TYPES, getLeaveTypeLabel } from '@/lib/leave';

function leaveStatusChip(status: LeaveRequest['status']) {
  if (status === 'approved') return <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">승인</span>;
  if (status === 'rejected') return <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-black text-red-600">반려</span>;
  return <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-black text-amber-700">대기중</span>;
}

interface ConsultTabProps {
  lifeComment: string;
  setLifeComment: (v: string) => void;
  studentLifeComment: string;
  setStudentLifeComment: (v: string) => void;
  lifeLogs: ConsultationLog[];
  // 출결/순공 통계
  studyStats?: any;
  // 휴가 신청
  leaveRequests?: LeaveRequest[];
  leaveCoupons?: number;
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
  leaveRequests = [],
  leaveCoupons = 0,
  leaveActionBusy = {},
  leaveReplyDrafts = {},
  setLeaveReplyDrafts,
  onLeaveAction,
  onCouponAdjust,
}: ConsultTabProps) {
  return (
    <>
      {/* 출결·순공 현황 */}
      {studyStats && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#1D1D1F] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#0071E3]" />
            출결·순공 현황
          </h3>
          <StudyStatsCard stats={studyStats} />
        </div>
      )}

      {/* 휴가·반차·휴식권 신청 내역 */}
      <div className="space-y-3 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-bold text-[#1D1D1F] flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#0071E3]" />
            휴가·반차 신청 내역
          </h4>
          {/* 쿠폰 잔액 및 조정 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500">
              <Ticket className="inline w-3 h-3 mr-0.5 text-amber-500" />
              쿠폰 {leaveCoupons}개
            </span>
            {onCouponAdjust && (
              <>
                <button
                  type="button"
                  onClick={() => onCouponAdjust(-1)}
                  className="rounded-md border border-black/[0.08] bg-[#F5F5F7] px-1.5 py-0.5 text-[10px] font-bold hover:bg-slate-200"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCouponAdjust(1)}
                  className="rounded-md border border-black/[0.08] bg-[#F5F5F7] px-1.5 py-0.5 text-[10px] font-bold hover:bg-slate-200"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCouponAdjust(3)}
                  className="rounded-md border border-[#0071E3]/20 bg-[#0071E3]/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#0071E3] hover:bg-[#0071E3]/10"
                >
                  +3
                </button>
              </>
            )}
          </div>
        </div>

        {leaveRequests.length === 0 ? (
          <p className="text-center py-4 text-[11px] text-[#86868B]">신청 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2.5">
            {leaveRequests.map(req => {
              const typeInfo = LEAVE_TYPES[req.type];
              const busy = leaveActionBusy[req.id];
              const replyDraft = leaveReplyDrafts[req.id] ?? '';
              return (
                <div key={req.id} className="rounded-xl border border-black/[0.06] bg-[#F9F9FB] p-3 space-y-2">
                  {/* 상단: 종류·날짜·상태 */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded-full bg-white border border-black/[0.08] px-1.5 py-0.5 font-black text-slate-700">
                      {typeInfo?.label ?? req.type}
                    </span>
                    <span className="font-semibold text-slate-500">{req.date}</span>
                    {leaveStatusChip(req.status)}
                    {req.usedCoupon && (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-bold text-amber-700">
                        🎟️ 쿠폰 사용
                      </span>
                    )}
                  </div>

                  {/* 사유 */}
                  {req.reason && (
                    <p className="text-[11px] text-slate-600 font-semibold whitespace-pre-wrap">{req.reason}</p>
                  )}

                  {/* 기존 관리자 답변 */}
                  {req.adminReply && (
                    <div className="rounded-lg border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-[#0071E3]">
                      💬 답변: {req.adminReply}
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
                        className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
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
                          className="flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
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
                          className="rounded-lg border border-black/[0.08] bg-[#F5F5F7] px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                        >
                          대기중으로
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

      <div className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[#1D1D1F]">학부모 공유용 생활 코멘트</h4>
            <p className="text-[10px] text-[#86868B] mt-0.5">
              학부모용 결과지에 그대로 표시되는 담임 생활 관리 피드백입니다.
            </p>
          </div>
        </div>
        <Textarea
          placeholder="예: 등원 시간, 휴대폰 통제, 수면/식사, 자습 태도, 멘탈 관리에 대한 코멘트를 입력하세요."
          value={lifeComment}
          onChange={(e) => setLifeComment(e.target.value)}
          className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[110px]"
        />
      </div>

      <div className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[#1D1D1F]">학생 공유용 생활 코멘트</h4>
            <p className="text-[10px] text-[#86868B] mt-0.5">
              학생 본인이 확인할 생활 습관, 자습 태도, 다음 행동 피드백입니다.
            </p>
          </div>
        </div>
        <Textarea
          placeholder="예: 이번 주는 등원 루틴을 유지하고, 쉬는 시간 휴대폰 사용을 줄이며, 자습 시작 전 오늘 목표를 먼저 적어주세요."
          value={studentLifeComment}
          onChange={(e) => setStudentLifeComment(e.target.value)}
          className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[110px]"
        />
      </div>

      <div id="life-consultation-logs" className="space-y-4">
        <h3 className="text-sm font-bold border-b border-black/[0.05] pb-2 flex items-center">
          <Calendar className="w-4 h-4 mr-2 text-[#86868B]" />
          누적 생활 면담 기록 ({lifeLogs.length}건)
        </h3>

        {lifeLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#86868B]">
            등록된 생활 면담 기록이 없습니다.
          </div>
        ) : (
          <div className="relative border-l border-black/[0.08] pl-5 ml-2.5 space-y-5">
            {lifeLogs.map((log) => (
              <div key={log.id} className="relative group">
                <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-[#1D1D1F] bg-white group-hover:bg-[#0071E3] transition-colors" />
                <div className="p-4 rounded-xl border border-black/[0.05] bg-white space-y-2 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#1D1D1F]">{log.date}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-[#F5F5F7] rounded-full text-[#86868B] font-semibold">
                      면담자: {log.manager}
                    </span>
                  </div>
                  <pre className="text-xs text-[#434345] leading-relaxed whitespace-pre-wrap font-sans">
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
