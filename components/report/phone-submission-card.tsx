'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Smartphone, Lock, Package, X, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { Student, PhoneSubmission, LeaveRequest } from '@/lib/types/student';

interface PhoneSubmissionCardProps {
  student: Student;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  todayDate: string; // YYYY-MM-DD KST
}

const TYPE_LABELS: Record<string, string> = {
  keep: '소지',
  locker: '임시보관함',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '검토 중',
  approved: '승인',
  rejected: '반려',
};

// Check if student has an approved early-departure leave today (morning/afternoon/night halfday)
function hasEarlyDepartureToday(student: Student, today: string): boolean {
  return (student.leaveRequests || []).some(
    (r: LeaveRequest) =>
      r.date === today &&
      r.status === 'approved' &&
      (r.type === 'morning' || r.type === 'afternoon' || r.type === 'night'),
  );
}

export function PhoneSubmissionCard({ student, setStudent, todayDate }: PhoneSubmissionCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [pendingType, setPendingType] = useState<'keep' | 'locker' | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const todaySubmission = (student.phoneSubmissions || []).find(
    (s) => s.date === todayDate && s.status !== 'rejected',
  ) as PhoneSubmission | undefined;

  const earlyDeparture = hasEarlyDepartureToday(student, todayDate);

  const startSubmit = (type: 'keep' | 'locker') => {
    setPendingType(type);
    setReasonInput('');
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingType) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/student/phone-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: pendingType, reason: reasonInput }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || '신청 실패');
        return;
      }
      setStudent((prev) =>
        prev
          ? {
              ...prev,
              phoneSubmissions: [...(prev.phoneSubmissions || []), json.submission],
            }
          : prev,
      );
      setShowForm(false);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!todaySubmission) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/student/phone-submission?id=${todaySubmission.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || '취소에 실패했어요.');
        return;
      }
      setStudent((prev) =>
        prev
          ? {
              ...prev,
              phoneSubmissions: (prev.phoneSubmissions || []).filter((s) => s.id !== todaySubmission.id),
            }
          : prev,
      );
    } catch {
      toast.error('네트워크 오류가 발생했어요.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-slate-400" />
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">휴대폰 보관 신청</p>
      </div>

      {/* 반차 등 사전 외출 예정자 안내 */}
      {earlyDeparture && !todaySubmission && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 border border-amber-100 px-3.5 py-3 text-[11px] font-bold text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span>오늘 반차/야간 외출이 있습니다. 퇴장 전 <strong>임시보관함</strong>에 휴대폰을 보관해 주세요.</span>
        </div>
      )}

      {/* 이미 신청한 경우 */}
      {todaySubmission ? (
        <div className="space-y-3">
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border ${
            todaySubmission.status === 'approved'
              ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
              : todaySubmission.status === 'rejected'
              ? 'bg-red-50 border-red-100 text-red-800'
              : 'bg-slate-50 border-slate-100 text-slate-700'
          }`}>
            {todaySubmission.status === 'approved' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : todaySubmission.status === 'rejected' ? (
              <X className="w-4 h-4 shrink-0 text-red-500" />
            ) : (
              <Clock className="w-4 h-4 shrink-0 text-slate-400" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-black">
                {TYPE_LABELS[todaySubmission.type]} 신청 · {STATUS_LABELS[todaySubmission.status]}
              </p>
              {todaySubmission.adminReply && (
                <p className="text-[10px] font-bold mt-0.5 opacity-80">{todaySubmission.adminReply}</p>
              )}
            </div>
          </div>
          {todaySubmission.status === 'pending' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full rounded-xl border border-slate-200 text-slate-500 text-[11px] font-black py-2 hover:bg-slate-50 transition disabled:opacity-50"
            >
              {cancelling ? '취소 중...' : '신청 취소'}
            </button>
          )}
        </div>
      ) : showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="inline-flex items-center gap-1 text-xs font-black text-slate-700">
            {pendingType === 'keep' ? (
              <><Smartphone className="w-3.5 h-3.5" /> 소지 신청</>
            ) : (
              <><Lock className="w-3.5 h-3.5" /> 임시보관함 신청</>
            )}
          </p>
          {pendingType === 'keep' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">소지 사유 (필수)</label>
              <textarea
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="예: 학원 이동, 부모님 연락 필요 등"
                required
                maxLength={200}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700 resize-none focus:outline-none focus:border-[#0071E3]"
              />
            </div>
          )}
          {error && <p className="text-[11px] font-bold text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-slate-200 text-slate-500 text-[11px] font-black py-2.5 hover:bg-slate-50 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || (pendingType === 'keep' && !reasonInput.trim())}
              className="flex-1 rounded-xl bg-slate-900 text-white text-[11px] font-black py-2.5 hover:bg-slate-800 transition disabled:opacity-50"
            >
              {submitting ? '신청 중...' : '신청'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => startSubmit('locker')}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center hover:border-[#0071E3]/30 hover:bg-[#0071E3]/[0.03] transition active:scale-95"
          >
            <Lock className="w-5 h-5 text-slate-400" />
            <span className="text-[11px] font-black text-slate-700">임시보관함</span>
            <span className="text-[9px] font-bold text-slate-400 leading-relaxed">잠깐 보관 후 직접 꺼냄</span>
          </button>
          <button
            onClick={() => startSubmit('keep')}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center hover:border-amber-300/50 hover:bg-amber-50/50 transition active:scale-95"
          >
            <Package className="w-5 h-5 text-slate-400" />
            <span className="text-[11px] font-black text-slate-700">소지</span>
            <span className="text-[9px] font-bold text-slate-400 leading-relaxed">사유 입력 후 신청</span>
          </button>
        </div>
      )}

      <p className="text-[9px] font-bold text-slate-400 leading-relaxed">
        * 기본적으로 등원 시 휴대폰을 제출함에 보관합니다. 특별 사정이 있는 경우에만 신청해 주세요.
      </p>
    </div>
  );
}
