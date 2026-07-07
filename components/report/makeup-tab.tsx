'use client';

import React from 'react';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import type { Student } from '@/lib/types/student';
import { getMakeupLedger } from '@/lib/makeup-ledger';

interface MakeupTabProps {
  student: Student;
  isStudentReport: boolean;
  activeTab: string;
  saveMakeupDone: (materialType: 'book' | 'lecture', materialId: string, amount: number) => Promise<boolean>;
}

// 학습 '보강' 서브탭 — 휴가로 빠진 만큼 누적된 보강을 자료별로 보여주고, 얼마 보강했는지 나눠 입력.
export function MakeupTab({ student, isStudentReport, activeTab, saveMakeupDone }: MakeupTabProps) {
  const ledger = React.useMemo(() => getMakeupLedger(student), [student]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(1);
  const [saving, setSaving] = React.useState(false);

  // 학생 홈 전용. 학부모 리포트에서는 렌더하지 않는다.
  if (!isStudentReport) return null;

  const totalRemaining = ledger.reduce((sum, it) => sum + it.remaining, 0);

  return (
    <div id="makeup" className={`scroll-mt-24 space-y-4 print-card ${activeTab === 'makeup' ? '' : 'hidden print:block'}`}>
      <div className="rounded-3xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-4 md:p-5 shadow-sm space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-black text-amber-800 dark:text-amber-300">
          <CalendarClock className="w-4 h-4" /> 휴가 보강
        </h3>
        <p className="text-[12px] font-semibold text-amber-800/80 dark:text-amber-300/80">
          휴가로 빠진 학습만큼 보강이 쌓여요. 주말에 보강하면 여기서 얼마나 했는지 입력해요. 입력한 만큼 진도도 함께 채워져요.
        </p>
      </div>

      {ledger.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-4 py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
          <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">남은 보강이 없어요.</p>
          <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">휴가로 빠진 학습이 생기면 여기에 보강이 잡혀요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-4 py-3 shadow-sm">
            <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">남은 보강 자료 {ledger.length}개</p>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              합계 {totalRemaining}
            </span>
          </div>

          {ledger.map((it) => {
            const isOpen = openId === it.id;
            return (
              <div
                key={it.id}
                className={`rounded-2xl border p-4 shadow-sm transition ${
                  isOpen ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                      {it.subjectName} · {it.materialTitle}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400">
                      {it.materialType === 'book' ? '교재' : '인강'} · 완료 {it.done}{it.unit} / 발생 {it.owed}{it.unit}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    남음 {it.remaining}{it.unit}
                  </span>
                </div>

                {!isOpen ? (
                  <button
                    type="button"
                    onClick={() => { setOpenId(it.id); setAmount(Math.min(it.remaining, 1) || 1); }}
                    className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-300/60 bg-white px-3.5 py-2 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-50 active:scale-[0.98] dark:border-amber-500/30 dark:bg-[#1c1c1e] dark:text-amber-300 dark:hover:bg-amber-500/10"
                  >
                    보강한 만큼 입력
                  </button>
                ) : (
                  <div className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">이번에 얼마나 보강했나요?</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAmount((v) => Math.max(1, v - 1))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                      >
                        -
                      </button>
                      <span className="min-w-[3.5rem] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {amount}{it.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAmount((v) => Math.min(it.remaining, v + 1))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                      >
                        +
                      </button>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">최대 {it.remaining}{it.unit}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={saving || amount <= 0}
                        onClick={async () => {
                          if (saving || amount <= 0) return;
                          setSaving(true);
                          try {
                            const ok = await saveMakeupDone(it.materialType, it.materialId, amount);
                            if (ok) setOpenId(null);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="flex-1 rounded-full bg-amber-500 py-2 text-[12px] font-semibold text-white hover:bg-amber-600 active:scale-[0.97] disabled:opacity-60"
                      >
                        {saving ? '저장 중...' : '보강 완료 기록'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setOpenId(null)}
                        className="flex-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] py-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-60"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
