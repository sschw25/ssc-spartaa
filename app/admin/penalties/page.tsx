'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, Shield, RefreshCw, Loader2, TrendingDown, TrendingUp, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { PenaltyTab } from '@/components/admin/detail-tabs/penalty-tab';
import type { Student } from '@/lib/types/student';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'] as const;
const getCampusLabel = (c: string) =>
  ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

const getNetScore = (s: Student) =>
  (s.penalties || []).reduce(
    (sum, p) => sum + (p.type === 'penalty' ? p.points : -p.points),
    0
  );

export default function PenaltiesPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin');
  };

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStudents(json.data || []);
      }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        loadStudents();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router, loadStudents]);

  const filtered = students
    .filter((s) => campusFilter === 'all' || s.campus === campusFilter)
    .filter((s) => !search.trim() || s.name.includes(search.trim()))
    .sort((a, b) => getNetScore(b) - getNetScore(a));

  const withPenalty = filtered.filter((s) => getNetScore(s) > 0);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <AdminTopNav title="벌점 · 상점 관리" onLogout={handleLogout} />

      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition active:scale-95 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              벌점 · 상점 관리
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              원생 클릭 시 벌점/상점 부여 및 내역 확인
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStudents}
            className="shrink-0 rounded-xl text-xs h-9 bg-white border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>

        {/* 요약 통계 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-3xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[18px] leading-none font-semibold tracking-tight text-red-600">{withPenalty.length}</p>
            <p className="text-[12px] font-medium text-[#86868B] mt-2">벌점 보유 원생</p>
          </div>
          <div className="rounded-3xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[18px] leading-none font-semibold tracking-tight text-[#1d1d1f]">
              {filtered.reduce((s, st) => s + (st.penalties || []).filter((p) => p.type === 'penalty').reduce((a, p) => a + p.points, 0), 0)}
            </p>
            <p className="text-[12px] font-medium text-[#86868B] mt-2">총 벌점</p>
          </div>
          <div className="rounded-3xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[18px] leading-none font-semibold tracking-tight text-emerald-600">
              {filtered.reduce((s, st) => s + (st.penalties || []).filter((p) => p.type === 'bonus').reduce((a, p) => a + p.points, 0), 0)}
            </p>
            <p className="text-[12px] font-medium text-[#86868B] mt-2">총 상점</p>
          </div>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex flex-wrap gap-1.5">
            {CAMPUS_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setCampusFilter(c)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                  campusFilter === c
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 검색"
              className="rounded-xl border border-slate-200 bg-white pl-8 pr-8 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-400 w-36"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 원생 목록 */}
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#0071E3]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Shield className="w-9 h-9 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">해당하는 원생이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-4">원생</th>
                    <th className="px-5 py-4">담당 코멘터</th>
                    <th className="px-5 py-4">누적 벌점</th>
                    <th className="px-5 py-4">내역</th>
                    <th className="px-5 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {filtered.map((s) => {
                    const net = getNetScore(s);
                    const penaltyCount = (s.penalties || []).filter((p) => p.type === 'penalty').length;
                    const bonusCount = (s.penalties || []).filter((p) => p.type === 'bonus').length;
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50/60 cursor-pointer transition"
                        onClick={() => setSelected(s)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800">{s.name}</span>
                            <Badge className="bg-slate-100 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">
                              {getCampusLabel(s.campus)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-bold text-slate-500">{s.manager || '미지정'}</td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-black ${
                            net > 0 ? 'text-red-600' : net < 0 ? 'text-emerald-600' : 'text-slate-400'
                          }`}>
                            {net > 0 ? `+${net}` : net}점
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {penaltyCount > 0 && (
                              <span className="flex items-center gap-0.5 rounded-lg bg-red-50 text-red-600 px-2 py-0.5 text-[10px] font-black">
                                <TrendingDown className="w-2.5 h-2.5" />
                                {penaltyCount}건
                              </span>
                            )}
                            {bonusCount > 0 && (
                              <span className="flex items-center gap-0.5 rounded-lg bg-emerald-50 text-emerald-600 px-2 py-0.5 text-[10px] font-black">
                                <TrendingUp className="w-2.5 h-2.5" />
                                {bonusCount}건
                              </span>
                            )}
                            {penaltyCount === 0 && bonusCount === 0 && (
                              <span className="text-slate-300 font-bold">없음</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelected(s); }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600 hover:border-red-300 hover:text-red-600 transition active:scale-95"
                          >
                            부여 / 조회
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 원생별 벌점 관리 Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-white p-0">
          {selected && (
            <>
              <SheetHeader className="border-b border-black/[0.05] px-5 py-4 sticky top-0 bg-white z-10">
                <SheetTitle className="flex items-center gap-2 text-base font-black text-[#1D1D1F]">
                  <Shield className="w-4 h-4 text-red-500" />
                  {selected.name} · 벌점 관리
                </SheetTitle>
                <SheetDescription className="text-xs font-semibold text-[#86868B]">
                  {getCampusLabel(selected.campus)} · {selected.manager || '담당 미지정'}
                </SheetDescription>
              </SheetHeader>
              <div className="p-5">
                <PenaltyTab
                  student={selected}
                  onUpdate={(updated) => {
                    setSelected(updated);
                    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                  }}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
