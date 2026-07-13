'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PenLine, CheckCircle2, Loader2 } from 'lucide-react';

// 모의고사 오답분석 제출 — 쿠폰 미션(mock_review_complete)의 유일한 제출 경로.
// 예전엔 components/student/missions-hub.tsx(어디에도 마운트되지 않던 독립 페이지 컴포넌트) 안에만
// 있어 학생이 이 폼에 접근할 방법이 없었다. 오답노트 탭과 개념상 인접해 이 자리로 옮겼다
// (오답노트의 교재별 스테퍼/사진 기록과는 별개 — 시험 단위 정형 보고서).
type MockReview = {
  id: string;
  testName: string;
  testDate: string;
  wrongNotes: string;
  actionPlan: string;
  submittedAt: string;
};

interface MockReviewPanelProps {
  isStudentReport: boolean;
  activeTab: string;
}

// 'YYYY-MM-DD' → '6. 30. (화)' (서울 기준) — missions-hub.tsx의 동일 포매터를 이 컴포넌트에도 복제.
function formatReviewDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short',
  }).format(d);
}

export function MockReviewPanel({ isStudentReport, activeTab }: MockReviewPanelProps) {
  const [todayKey, setTodayKey] = useState('');
  const [mockReviews, setMockReviews] = useState<MockReview[]>([]);
  const [form, setForm] = useState({ testName: '', testDate: '', wrongNotes: '', actionPlan: '' });
  const [submitting, setSubmitting] = useState(false);

  // /api/student/missions-hub 를 그대로 재사용하되 todayKey·mockReviews 필드만 사용한다.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/missions-hub', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setTodayKey(json.todayKey || '');
          setMockReviews(json.mockReviews || []);
          setForm((prev) => (prev.testDate ? prev : { ...prev, testDate: json.todayKey || '' }));
        }
      }
    } catch {
      // 최근 제출 목록 로드에 실패해도 폼 자체는 그대로 제출할 수 있게 둔다.
    }
  }, []);

  useEffect(() => {
    if (!isStudentReport) return;
    void load();
  }, [isStudentReport, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/mock-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setForm((prev) => ({ testName: '', testDate: prev.testDate || todayKey, wrongNotes: '', actionPlan: '' }));
        await load();
        toast.success('오답분석을 제출했어요.');
      } else {
        toast.error(json?.message || '오답분석 제출에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      toast.error('네트워크 오류로 오답분석을 제출하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  // 학생 본인 화면 전용. 학부모 리포트에는 노출하지 않는다.
  if (!isStudentReport) return null;

  return (
    <div id="mock-review" className={`scroll-mt-24 ${activeTab === 'wrong-note' ? '' : 'hidden'}`}>
      <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <PenLine className="h-4 w-4 text-[#0071E3]" />
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">모의고사 오답분석</h3>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          시험을 본 뒤 오답과 보완계획을 남기면 쿠폰 미션으로 인정돼요.
        </p>

        <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">시험명</span>
              <input
                type="text"
                value={form.testName}
                onChange={(e) => setForm((prev) => ({ ...prev, testName: e.target.value }))}
                maxLength={80}
                placeholder="예: 7월 전국모의고사"
                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">시험일</span>
              <input
                type="date"
                value={form.testDate}
                onChange={(e) => setForm((prev) => ({ ...prev, testDate: e.target.value }))}
                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
                required
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">오답/약점 요약</span>
            <textarea
              value={form.wrongNotes}
              onChange={(e) => setForm((prev) => ({ ...prev, wrongNotes: e.target.value }))}
              rows={3}
              minLength={5}
              maxLength={1000}
              placeholder="틀린 유형, 실수 패턴, 시간이 부족했던 영역"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">보완계획</span>
            <textarea
              value={form.actionPlan}
              onChange={(e) => setForm((prev) => ({ ...prev, actionPlan: e.target.value }))}
              rows={3}
              minLength={5}
              maxLength={1000}
              placeholder="다시 풀 문제, 복습 범위, 다음 시험 전 점검할 기준"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
              required
            />
          </label>
          <button
            type="submit"
            disabled={
              submitting ||
              !form.testName.trim() ||
              !form.testDate ||
              form.wrongNotes.trim().length < 5 ||
              form.actionPlan.trim().length < 5
            }
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0071E3] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#0060c0] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {submitting ? '제출 중' : '제출하기'}
          </button>
        </form>

        {mockReviews.length > 0 && (
          <div className="mt-4 border-t border-slate-100 dark:border-white/10 pt-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">최근 제출</p>
            <div className="mt-2 flex flex-col gap-2">
              {mockReviews.map((review) => (
                <div key={review.id} className="rounded-xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{review.testName}</span>
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">{formatReviewDate(review.testDate)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 break-keep text-[11px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                    {review.wrongNotes}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
