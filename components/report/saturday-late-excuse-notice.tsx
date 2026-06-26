'use client';

import React, { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { SaturdayLateExcuse } from '@/lib/types/student';

interface SaturdayLateExcuseNoticeProps {
  excuses: SaturdayLateExcuse[];
  studentId: string;
  onResponded: (updatedExcuses: SaturdayLateExcuse[]) => void;
}

export function SaturdayLateExcuseNotice({
  excuses,
  studentId,
  onResponded,
}: SaturdayLateExcuseNoticeProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 아직 대기중인(pending) 가장 첫 번째 증빙 건을 처리 대상으로 잡음
  const target = excuses[0];
  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('사유를 입력해 주세요.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/saturday-excuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          date: target.date,
          reason: cleanReason,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setReason('');
        // 성공 시 갱신된 excuses 배열을 상위 상태로 돌려줌
        if (json.saturdayLateExcuses) {
          onResponded(json.saturdayLateExcuses);
        }
      } else {
        setError(json.message || '제출에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-[#0071E3]/20 bg-[#0071E3]/[0.03] p-5 shadow-sm space-y-4 font-sans animate-fade-in-up">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-2xl bg-[#0071E3]/10 text-[#0071E3]">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-black text-slate-900">⏰ 토요 지각 · 결석 사유 증빙 요청</h4>
          <p className="text-[11px] font-semibold text-slate-500 leading-normal">
            <b>{target.date}</b> 토요일에 반차/휴가 신청 없이 등원하지 않은 내역이 확인되었습니다. <br />
            정상 참작을 위해 지각/결석 사유를 입력하여 제출해 주시기 바랍니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 pl-0 sm:pl-11">
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          placeholder="예) 병원 긴급 진료로 인해 늦었습니다. / 독감으로 인해 등원하지 못했습니다."
          rows={2}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
        />

        {error && <p className="text-[10px] font-bold text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto rounded-xl bg-[#0071E3] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0077ED] transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              제출 중...
            </>
          ) : (
            '사유 증빙 회신하기'
          )}
        </button>
      </form>
    </div>
  );
}