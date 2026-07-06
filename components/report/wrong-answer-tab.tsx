'use client';

import React from 'react';
import { Target } from 'lucide-react';
import { Student } from '@/lib/types/student';
import { TabHero } from './tab-hero';

// 오답 사유 태그 — 과목별 진도에서 분리한 독립 탭. 교재별로 틀린 유형을 눌러 누적한다.
const TAGS = [
  { key: 'calculation_error', label: '연산' },
  { key: 'time_limit', label: '시간' },
  { key: 'misread_condition', label: '오독' },
  { key: 'concept_leak', label: '개념' },
] as const;

// 누적 카운트 배지 색 (진도 탭에서 쓰던 색과 동일하게 유지)
const COUNT_CLS: Record<string, string> = {
  calculation_error: 'bg-red-50 dark:bg-red-500/10 text-red-600',
  time_limit: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
  misread_condition: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600',
  concept_leak: 'bg-blue-50 dark:bg-[#0071E3]/15 text-[#0071E3]',
};

interface WrongAnswerTabProps {
  student: Student;
  isStudentReport: boolean;
  incrementBookIncorrectTag: (materialId: string, tagKey: string, currentTags: Record<string, number> | undefined) => void;
  activeTab: string;
}

export function WrongAnswerTab({ student, isStudentReport, incrementBookIncorrectTag, activeTab }: WrongAnswerTabProps) {
  // 학생 본인 화면 전용 도구(태그 입력). 학부모 리포트에는 노출하지 않는다.
  if (!isStudentReport) return null;

  const books = (student.subjects || []).flatMap((sub) =>
    (sub.books || []).map((book) => ({ subjectName: sub.name, book })),
  );

  return (
    <section id="wrong-note" className={`scroll-mt-24 space-y-5 ${activeTab === 'wrong-note' ? '' : 'hidden'}`}>
      <TabHero
        eyebrow="Wrong Note"
        icon={Target}
        title="오답 노트"
        description="교재별로 틀린 이유를 태그로 남겨두면, 약점 유형이 한눈에 쌓여요."
      />

      {books.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-8 text-center">
          <p className="text-sm font-black text-slate-700 dark:text-slate-300">등록된 교재가 없어요.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-400">교재가 추가되면 여기에서 오답 사유를 기록할 수 있어요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {books.map(({ subjectName, book }) => {
            const tags = book.incorrectTags || {};
            const total = TAGS.reduce((sum, t) => sum + (Number(tags[t.key]) || 0), 0);
            return (
              <div key={book.id} className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]">{subjectName || '과목'}</p>
                    <h3 className="mt-0.5 truncate text-sm font-black text-slate-900 dark:text-slate-100">{book.title}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
                    누적 {total}
                  </span>
                </div>

                {/* 오답 사유 추가 버튼 */}
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => incrementBookIncorrectTag(book.id, t.key, book.incorrectTags)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1 text-[11px] font-black text-slate-600 dark:text-slate-300 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] active:scale-95"
                    >
                      {t.label} +1
                    </button>
                  ))}
                </div>

                {/* 누적 카운트 */}
                {total > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-white/10 pt-3 text-[11px] font-black">
                    {TAGS.map((t) => {
                      const n = Number(tags[t.key]) || 0;
                      if (n <= 0) return null;
                      return (
                        <span key={t.key} className={`rounded-md px-2 py-0.5 leading-none ${COUNT_CLS[t.key]}`}>
                          {t.label} {n}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
