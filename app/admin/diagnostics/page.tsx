'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Stethoscope, Loader2, RefreshCw, ShieldCheck, ArrowRight, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { StalePlanStudent } from '@/lib/plan-integrity';

const CAMPUS_LABEL: Record<string, string> = { wonju: '원주', chuncheon: '춘천', chungju: '충주' };

// 관리자: 계획 정합성 점검(비상 진단). 하루 목표(dailyAmount) 자료의 마지막 주 일일량이
// 희석돼 저장된("하루 3강인데 계획표엔 2강") 자료를 전체에서 찾아 개별 재설정한다.
// 재설정은 dailyAmount 만 제자리 교정(진도·완료상태·날짜 보존).
export default function DiagnosticsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StalePlanStudent[]>([]);
  const [fixing, setFixing] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/plan-integrity', { credentials: 'same-origin' });
      const j = await res.json();
      if (res.ok && j.success) {
        setStudents(j.students || []);
      } else {
        toast.error(j.message || '점검에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 점검에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
      } catch {
        router.replace('/admin');
        return;
      } finally {
        setCheckingAuth(false);
      }
      scan();
    })();
  }, [router, scan]);

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin');
  };

  const fixMaterial = async (studentId: string, materialId: string, title: string) => {
    const key = `${studentId}_${materialId}`;
    if (fixing) return;
    const ok = await confirm({
      title: '이 자료의 일일목표를 재설정할까요?',
      description: `${title}의 주별 일일량을 목표값으로 교정합니다. 진도·완료 상태·날짜는 그대로 유지됩니다.`,
      confirmText: '재설정',
    });
    if (!ok) return;
    setFixing(key);
    try {
      const res = await fetch('/api/admin/plan-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ studentId, materialId }),
      });
      const j = await res.json();
      if (res.ok && j.success) {
        toast.success('일일목표를 재설정했어요.');
        // 교정된 자료만 목록에서 제거(빈 학생은 함께 제거).
        setStudents((prev) =>
          prev
            .map((s) => (s.studentId === studentId ? { ...s, materials: s.materials.filter((m) => m.materialId !== materialId) } : s))
            .filter((s) => s.materials.length > 0),
        );
      } else {
        toast.error(j.message || '재설정에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 재설정에 실패했습니다.');
    } finally {
      setFixing(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-white/5 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  const materialCount = students.reduce((n, s) => n + s.materials.length, 0);

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans">
      <AdminTopNav
        title="계획 정합성 점검"
        titleIcon={<Stethoscope className="w-4 h-4 text-[#0071E3]" />}
        onLogout={handleLogout}
      />

      <main className="stagger-children mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-[#0071E3]" /> 계획 정합성 점검
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 mt-0.5">
              하루 목표 자료의 일일량이 마지막 주에서 희석된(예: 하루 3강인데 계획표엔 2강) 자료를 찾아 재설정합니다.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={scan} disabled={loading}
            className="shrink-0 rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] gap-1.5 font-bold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            다시 점검
          </Button>
        </div>

        {loading && students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs font-bold">전체 학생 계획을 점검하는 중…</span>
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-2xl border border-emerald-300/50 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 p-6 flex flex-col items-center gap-2 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-black text-emerald-800 dark:text-emerald-300">재설정이 필요한 계획이 없어요</p>
            <p className="text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-300/70">
              모든 하루 목표 자료의 일일량이 정상입니다.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-amber-300/50 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10 px-4 py-3 text-[11px] font-bold text-amber-800 dark:text-amber-300">
              재설정 필요: 학생 {students.length}명 · 자료 {materialCount}건. 각 자료의 &lsquo;재설정&rsquo;을 누르면 그 자료만 즉시 교정됩니다.
            </div>

            <div className="space-y-4">
              {students.map((s) => (
                <div key={s.studentId} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/5">
                    <span className="font-black text-sm truncate">{s.studentName}</span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {CAMPUS_LABEL[s.campus] || s.campus}{s.manager ? ` · ${s.manager}` : ''}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {s.materials.map((m) => {
                      const key = `${s.studentId}_${m.materialId}`;
                      return (
                        <li key={m.materialId} className="flex items-start gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="font-bold text-[13px] text-slate-900 dark:text-slate-100">{m.title}</span>
                              <span className="text-[10px] font-bold text-slate-400">{m.subjectName} · 하루 {m.goalDaily}{m.unit} 목표</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {m.weeks.map((w) => (
                                <span key={w.weekNumber} className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                  주{w.weekNumber}
                                  <span className="tabular-nums">{w.stored}{m.unit}</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                  <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{w.expected}{m.unit}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => fixMaterial(s.studentId, m.materialId, m.title)}
                            disabled={fixing === key}
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#0060c0] disabled:opacity-50"
                          >
                            {fixing === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                            재설정
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
