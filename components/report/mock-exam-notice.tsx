'use client';

import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { MockExam } from '@/lib/types/student';

interface MockExamNoticeProps {
  exams: MockExam[];
  onResponded: (examId: string) => void;
}

function ExamCard({ exam, onResponded }: { exam: MockExam; onResponded: (id: string) => void }) {
  const [status, setStatus] = useState<'attending' | 'absent' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showReason, setShowReason] = useState(false);

  const submit = async (chosen: 'attending' | 'absent') => {
    if (submitting) return;
    setStatus(chosen);
    if (chosen === 'absent' && !showReason) {
      setShowReason(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/mock-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: exam.id, status: chosen, reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setDone(true);
        setTimeout(() => onResponded(exam.id), 1200);
      }
    } catch {
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 border border-slate-100">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <p className="text-xs font-bold text-slate-500">
          <span className="font-black text-slate-700">{exam.name}</span> 응답 완료
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E8F0FE] bg-[#F0F4FF] overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#DCE7FF] text-[#1D4ED8]">
          <ClipboardCheck className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-[#1D1D1F]">
            {exam.name} · {exam.date} 참여 여부를 알려주세요
          </p>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
            선생님이 확인합니다. 불참 시 사유를 남기면 더 좋아요.
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2.5">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit('attending')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black border transition active:scale-[0.98] ${
              status === 'attending'
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            {submitting && status === 'attending'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle2 className="w-3.5 h-3.5" />}
            참여
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit('absent')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black border transition active:scale-[0.98] ${
              status === 'absent'
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600'
            }`}
          >
            {submitting && status === 'absent'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <XCircle className="w-3.5 h-3.5" />}
            불참
          </button>
        </div>

        {showReason && status === 'absent' && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="불참 사유를 적어주세요 (선택 사항)"
              rows={2}
              maxLength={200}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-red-300 focus:outline-none resize-none"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit('absent')}
              className="w-full rounded-xl bg-red-500 py-2.5 text-xs font-black text-white hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              불참으로 제출
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MockExamNotice({ exams, onResponded }: MockExamNoticeProps) {
  if (exams.length === 0) return null;
  return (
    <div className="space-y-3">
      {exams.map((exam) => (
        <ExamCard key={exam.id} exam={exam} onResponded={onResponded} />
      ))}
    </div>
  );
}
