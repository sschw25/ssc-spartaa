'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Flame, ArrowLeft, RefreshCw, Loader2, Clock, Search, Award, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Row { rank: number; id: string; name: string; campus: string; weekMinutes: number; dayMinutes: number; isOpen: boolean }
interface Data {
  configured: boolean;
  liveCount?: number;
  summary?: { total: number; studied: number; notStudied: number; avgWeekMin: number };
  rows?: Row[];
}

const campusLabel = (v: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[v] || '기타';
const fmt = (m: number) => {
  if (!m || m <= 0) return '0분';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};
const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);

export default function WeeklyLeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/leaderboard', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      } else {
        setError(json.message || '랭킹 데이터를 불러오지 못했습니다.');
      }
    } catch {
      setError('네트워크 오류로 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B] font-bold">주간 순공 랭킹 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans p-4 text-center">
        <p className="text-sm text-red-650 font-bold mb-4">{error}</p>
        <Button onClick={load} className="rounded-xl font-bold bg-[#1D1D1F] text-white">다시 시도</Button>
      </div>
    );
  }

  const allRows = data?.rows || [];
  const scopedRows = allRows.filter((r) => campusFilter === 'all' || r.campus === campusFilter);
  
  // 검색어 필터링
  const filteredRows = scopedRows.filter((r) => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).map((r, index) => ({ ...r, rank: index + 1 }));

  const studiedCount = scopedRows.filter((r) => r.weekMinutes > 0).length;
  const notStudiedCount = scopedRows.filter((r) => r.weekMinutes === 0).length;
  const avgWeekMin = scopedRows.length > 0 
    ? Math.round(scopedRows.reduce((sum, r) => sum + r.weekMinutes, 0) / scopedRows.length) 
    : 0;
  
  const liveCount = scopedRows.filter((r) => r.isOpen).length;

  const getRankBadgeStyle = (rank: number, hasMinutes: boolean) => {
    if (!hasMinutes) return 'bg-[#F5F5F7] text-[#86868B] border border-black/[0.03]';
    switch (rank) {
      case 1:
        return 'bg-amber-100/80 text-amber-800 border border-amber-200/50 font-black shadow-sm';
      case 2:
        return 'bg-slate-100/80 text-slate-800 border border-slate-200/50 font-black shadow-sm';
      case 3:
        return 'bg-orange-100/80 text-orange-850 border border-orange-200/50 font-black shadow-sm';
      default:
        return 'bg-[#F5F5F7] text-[#434345] font-bold border border-black/[0.02]';
    }
  };

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans selection:bg-black/10 transition-all animate-fade-in-up">
      {/* Navbar */}
      <nav className="border-b border-black/[0.03] bg-white/80 backdrop-blur-xl sticky top-0 z-30 px-4 md:px-6 py-3 flex justify-between items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.back()}
            className="rounded-2xl text-xs h-9 px-3 hover:bg-[#F5F5F7] transition-premium"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            <span className="font-bold">뒤로가기</span>
          </Button>
          <span className="w-px h-4 bg-black/[0.08]" />
          <h1 className="text-sm font-black tracking-tight text-[#1D1D1F] flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-[#F56300]" />
            주간 순공 시간 상세 분석
          </h1>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-black/[0.04] bg-[#F5F5F7]/80 p-0.5 shrink-0">
          <span className="hidden sm:inline pl-3.5 pr-1 text-[10px] font-black text-[#86868B] uppercase tracking-wider">센터</span>
          <div className="flex min-w-0 overflow-hidden gap-0.5">
            {['all', 'wonju', 'chuncheon', 'chungju'].map((c) => (
              <Button
                key={c}
                size="sm"
                variant={campusFilter === c ? 'default' : 'ghost'}
                onClick={() => setCampusFilter(c)}
                className={`h-7 rounded-full px-3 text-[11px] transition-premium ${
                  campusFilter === c ? 'bg-white hover:bg-white text-black shadow-[0_2px_6px_rgba(0,0,0,0.05)] font-black border border-black/[0.02]' : 'text-[#86868B] hover:bg-white/60 hover:text-black'
                }`}
              >
                {c === 'all' ? '전체' : campusLabel(c)}
              </Button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        {/* KPI 메트릭 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] relative overflow-hidden text-left">
            <div className="absolute right-2 bottom-1 opacity-[0.04] pointer-events-none">
              <Activity className="w-16 h-16 text-emerald-500" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">누적 학습 인원</span>
              {liveCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-emerald-650">{studiedCount}</span>
              <span className="text-xs font-bold text-emerald-600/80 ml-1">명</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              이번 주 순공 시간이 기록된 원생 수
            </p>
          </Card>

          <Card className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] relative overflow-hidden text-left">
            <div className="absolute right-2 bottom-1 opacity-[0.04] pointer-events-none">
              <Flame className="w-16 h-16 text-amber-500" />
            </div>
            <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">미학습 인원</span>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-amber-650">{notStudiedCount}</span>
              <span className="text-xs font-bold text-amber-600/80 ml-1">명</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              누적 순공 시간이 0분인 원생 수
            </p>
          </Card>

          <Card className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] relative overflow-hidden text-left">
            <div className="absolute right-2 bottom-1 opacity-[0.04] pointer-events-none">
              <Clock className="w-16 h-16 text-blue-500" />
            </div>
            <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">평균 학습 시간</span>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-blue-650">{Math.floor(avgWeekMin / 60)}</span>
              <span className="text-xs font-bold text-blue-600/80 ml-1">시간 {avgWeekMin % 60}분</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              전체 수강생의 주간 평균 순공 시간
            </p>
          </Card>

          <Card className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] relative overflow-hidden text-left">
            <div className="absolute right-2 bottom-1 opacity-[0.04] pointer-events-none">
              <Award className="w-16 h-16 text-purple-500" />
            </div>
            <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">실시간 몰입 인원</span>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-purple-650">{liveCount}</span>
              <span className="text-xs font-bold text-purple-600/80 ml-1">명</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              현재 등원 중인 실시간 학습자 수
            </p>
          </Card>
        </div>

        {/* 랭킹 상세 리스트 테이블 */}
        <Card className="border border-black/[0.04] rounded-3xl bg-white shadow-sm overflow-hidden text-left">
          <CardHeader className="p-6 pb-4 border-b border-black/[0.03] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-sm font-black text-[#1D1D1F]">주간 순공 상세 순위표</CardTitle>
              <CardDescription className="text-xs text-[#86868B] font-semibold mt-1">캠퍼스별 원생들의 누적 순공 시간 랭킹입니다.</CardDescription>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868B]" />
                <Input
                  type="text"
                  placeholder="이름으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8.5 pr-4 py-2 rounded-xl text-xs border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] bg-[#F5F5F7]/50 w-full"
                />
              </div>
              <Button onClick={load} size="sm" variant="outline" className="rounded-xl border-black/[0.06] hover:bg-[#F5F5F7] h-8 shadow-sm">
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-black/[0.02] text-[#86868B] font-extrabold border-b border-black/[0.04]">
                    <th className="px-6 py-3.5 w-16 text-center">순위</th>
                    <th className="px-6 py-3.5">원생 정보</th>
                    <th className="px-6 py-3.5">캠퍼스</th>
                    <th className="px-6 py-3.5">실시간 상태</th>
                    <th className="px-6 py-3.5">오늘 학습 시간</th>
                    <th className="px-6 py-3.5">주간 누적 순공</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-[11px] text-[#86868B] font-semibold text-center py-12">
                        표시할 랭킹 정보가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((student) => (
                      <tr 
                        key={student.id} 
                        onClick={() => router.push(`/admin/consultation?studentId=${student.id}`)}
                        className="border-b border-black/[0.02] hover:bg-black/[0.015] cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 text-center">
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 border ${getRankBadgeStyle(student.rank, student.weekMinutes > 0)}`}>
                            {student.weekMinutes > 0 ? (student.rank <= 3 ? medal(student.rank) : student.rank) : '–'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-[#1D1D1F]">{student.name}</td>
                        <td className="px-6 py-4 text-[#86868B]">{campusLabel(student.campus)}</td>
                        <td className="px-6 py-4">
                          {student.isOpen ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              학습중
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#86868B] bg-[#F5F5F7] border border-black/[0.03] px-2 py-0.5 rounded-full">
                              외출/하원
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[#86868B]">
                          {student.dayMinutes > 0 ? fmt(student.dayMinutes) : '-'}
                        </td>
                        <td className="px-6 py-4 font-black text-slate-800">
                          {student.weekMinutes > 0 ? fmt(student.weekMinutes) : <span className="text-amber-600 font-semibold">미학습</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
