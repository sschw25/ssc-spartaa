'use client';

import React from 'react';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Student } from '@/lib/types/student';
import { buildAwayReplan } from '@/lib/away-impact';
import { kstToday } from '@/lib/leave';
import { useConfirm } from '@/components/ui/confirm-dialog';

// 정기외출로 상시 막힌 학습 슬롯을 반영해 계획을 재조정하는 권고 패널(관리자 상세시트 info 탭).
// 미리보기(before/after)를 보여주고, '확인·적용' 시 API 로 계획 교체 + 학생 홈 알림.
export function AwayReplanPanel({ student, onApplied }: { student: Student; onApplied?: () => void }) {
  const confirm = useConfirm();
  const [applying, setApplying] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const items = React.useMemo(() => buildAwayReplan(student, kstToday()), [student]);
  if (done || items.length === 0) return null;
  const actionable = items.filter((it) => !it.blocked);

  const apply = async () => {
    if (applying || actionable.length === 0) return;
    const ok = await confirm({
      title: '외출 반영 계획 조정을 적용할까요?',
      description: `${actionable.length}개 자료의 계획이 재조정되고, 학생에게 알림이 전송됩니다.`,
      confirmText: '적용',
    });
    if (!ok) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/away-replan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (res.ok && j.success) {
        toast.success(`계획 조정 ${j.appliedCount}건 적용 · 학생에게 알림 전송`);
        setDone(true);
        onApplied?.();
      } else {
        toast.error(j.message || '적용에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300/50 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
          <CalendarClock className="w-4 h-4" /> 외출 영향 · 계획 조정 권고
        </h4>
        {actionable.length > 0 && (
          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            확인·적용 ({actionable.length})
          </button>
        )}
      </div>
      <p className="text-[11px] font-medium leading-relaxed text-amber-800/80 dark:text-amber-300/80">
        정기 외출로 학습 슬롯이 상시 막혀 아래 계획 재조정을 권고해요. 적용하면 해당 요일이 학습일에서 빠지고 계획이 재생성되며, 학생에게 알림이 갑니다.
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={`${it.subjectId}_${it.materialId}`}
            className="flex items-start gap-2 rounded-lg bg-white/70 dark:bg-white/5 px-3 py-2 text-[11px]"
          >
            <ArrowRight className="mt-0.5 w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0">
              <span className="font-bold text-slate-900 dark:text-slate-100">{it.subjectName} · {it.title}</span>
              <span className={`ml-1.5 ${it.blocked ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>{it.diff}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
