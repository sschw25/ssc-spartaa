'use client';

import React from 'react';
import { Shield, TrendingDown, TrendingUp } from 'lucide-react';
import { Student, PenaltyRecord } from '@/lib/types/student';

interface PenaltiesTabProps {
  student: Student;
  activeTab: string;
}

export function PenaltiesTab({ student, activeTab }: PenaltiesTabProps) {
  if (activeTab !== 'student-penalties') return null;

  const penalties = student.penalties || [];
  const total = penalties.reduce(
    (sum: number, p: PenaltyRecord) => sum + (p.type === 'penalty' ? p.points : -p.points),
    0
  );

  return (
    <div id="student-penalties" className="mx-auto w-full max-w-[680px] px-4 sm:px-5 pb-6 no-print space-y-4">
      <div className="rounded-3xl border border-black/[0.06] bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.04] flex items-center justify-between gap-2 bg-[#FAFAFA]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-black text-slate-900 tracking-wider uppercase">벌점 · 상점 내역</h3>
          </div>
          <span className={`text-xs font-black ${
            total > 0 ? 'text-red-500' : total < 0 ? 'text-emerald-500' : 'text-slate-400'
          }`}>
            누적 {total > 0 ? `+${total}` : total}점
          </span>
        </div>

        {penalties.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400 font-bold bg-white">
            등록된 벌점 및 상점 내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {[...penalties]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                  <span className={`shrink-0 grid w-9 h-9 place-items-center rounded-xl text-xs font-black ${
                    p.type === 'penalty' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {p.type === 'penalty' ? '+' : '-'}{p.points}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{p.reason}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{p.date}</p>
                  </div>
                  {p.type === 'penalty'
                    ? <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    : <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
