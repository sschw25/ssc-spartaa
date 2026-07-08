'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Flame, RefreshCw, Loader2, Clock, Search, Award, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { Donut, VizLegend, CompareBar } from '@/components/admin/viz-kit';

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
const medal = (rank: number) => `${rank}`;

export default function WeeklyLeaderboardPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openingStudentId, setOpeningStudentId] = useState<string | null>(null);

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
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const handleOpenStudentById = async (id: string) => {
    setOpeningStudentId(id);
    try {
      const res = await fetch(`/api/admin/students/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        openStudent(json.data, {
          onUpdate: () => {},
          onDelete: () => {},
        });
        return;
      }
    } catch {}
    finally {
      setOpeningStudentId(null);
    }
    router.push(`/admin/consultation?studentId=${id}`);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-white/5 flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">주간 순공 랭킹 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-white/5 flex flex-col items-center justify-center font-sans p-4 text-center">
        <p className="text-sm text-red-600 font-bold mb-4">{error}</p>
        <Button onClick={load} className="rounded-xl font-bold bg-slate-900 text-white">다시 시도</Button>
      </div>
    );
  }

  const allRows = data?.rows || [];
  const scopedRows = allRows.filter((r) => campusFilter === 'all' || r.campus === campusFilter);

  // 순위(rank)는 캠퍼스 스코프 기준으로 먼저 부여한다. 검색은 그 뒤에 '필터'만 하므로
  // 검색으로 한 명만 남아도 그 학생의 실제 순위·메달이 유지된다(검색이 재랭킹이 되지 않게).
  const rankedRows = scopedRows.map((r, index) => ({ ...r, rank: index + 1 }));
  const filteredRows = searchQuery
    ? rankedRows.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : rankedRows;

  const studiedCount = scopedRows.filter((r) => r.weekMinutes > 0).length;
  const notStudiedCount = scopedRows.filter((r) => r.weekMinutes === 0).length;
  const avgWeekMin = scopedRows.length > 0
    ? Math.round(scopedRows.reduce((sum, r) => sum + r.weekMinutes, 0) / scopedRows.length)
    : 0;

  const liveCount = scopedRows.filter((r) => r.isOpen).length;

  const getRankBadgeStyle = (rank: number, hasMinutes: boolean) => {
    if (!hasMinutes) return 'bg-[#F5F5F7] dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-black/[0.03] dark:border-white/10';
    switch (rank) {
      case 1:
        return 'bg-amber-100/80 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-500/25 font-black shadow-sm';
      case 2:
        return 'bg-slate-100/80 dark:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-white/10 font-black shadow-sm';
      case 3:
        return 'bg-orange-100/80 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300 border border-orange-200/50 dark:border-orange-500/25 font-black shadow-sm';
      default:
        return 'bg-[#F5F5F7] dark:bg-white/5 text-slate-700 dark:text-slate-300 font-bold border border-black/[0.02] dark:border-white/10';
    }
  };

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans selection:bg-black/10">
      <AdminTopNav
        title="주간 순공 시간 상세 분석"
        titleIcon={<Trophy className="w-4 h-4 text-[#F56300]" />}
        campusOptions={['all', 'wonju', 'chuncheon', 'chungju'].map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            className="admin-fit-button rounded-2xl border-black/[0.05] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5 text-xs h-9.5 bg-white dark:bg-[#1c1c1e] px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 md:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline font-bold">새로고침</span>
          </Button>
        }
      />

      <main className="stagger-children max-w-6xl mx-auto p-4 md:p-8 pb-28 space-y-6">
        {/* KPI 메트릭 요약 카드 — iOS 26 (앱아이콘 타일 + semibold 숫자) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] gap-0 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)] text-left">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-emerald-500/12 flex items-center justify-center"><Activity className="w-[18px] h-[18px] text-emerald-500" /></div>
              {liveCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mt-1" />}
            </div>
            <div className="mt-3.5 flex items-baseline gap-1">
              <span className="text-[18px] leading-none font-semibold tracking-tight text-emerald-600">{studiedCount}</span>
              <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
            </div>
            <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">누적 학습 인원</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">이번 주 순공 시간이 기록된 학생 수</p>
          </Card>

          <Card className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] gap-0 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)] text-left">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/12 flex items-center justify-center"><Flame className="w-[18px] h-[18px] text-amber-500" /></div>
            </div>
            <div className="mt-3.5 flex items-baseline gap-1">
              <span className="text-[18px] leading-none font-semibold tracking-tight text-amber-600">{notStudiedCount}</span>
              <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
            </div>
            <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">미학습 인원</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">누적 순공 시간이 0분인 학생 수</p>
          </Card>

          <Card className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] gap-0 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)] text-left">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-blue-500/12 flex items-center justify-center"><Clock className="w-[18px] h-[18px] text-blue-500" /></div>
            </div>
            <div className="mt-3.5 flex items-baseline gap-1">
              <span className="text-[18px] leading-none font-semibold tracking-tight text-blue-600">{Math.floor(avgWeekMin / 60)}</span>
              <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">시간 {avgWeekMin % 60}분</span>
            </div>
            <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">평균 학습 시간</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">전체 수강생의 주간 평균 순공 시간</p>
          </Card>

          <Card className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] gap-0 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)] text-left">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-blue-500/12 flex items-center justify-center"><Award className="w-[18px] h-[18px] text-blue-500" /></div>
              {liveCount > 0 && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mt-1" />}
            </div>
            <div className="mt-3.5 flex items-baseline gap-1">
              <span className="text-[18px] leading-none font-semibold tracking-tight text-blue-600">{liveCount}</span>
              <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
            </div>
            <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">실시간 몰입 인원</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">현재 등원 중인 실시간 학습자 수</p>
          </Card>
        </div>

        {/* 학습 현황 시각화 (viz-kit) */}
        {scopedRows.length > 0 && (() => {
          const total = scopedRows.length;
          const studyRate = Math.round((studiedCount / total) * 100);
          const studySegs = [
            { label: '학습', value: studiedCount, color: '#34C759' },
            { label: '미학습', value: notStudiedCount, color: '#FF9500' },
          ];
          return (
            <Card className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] gap-0 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)] text-left">
              <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-5">학습 현황 한눈에</p>
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] items-center gap-7">
                <div className="flex flex-col items-center gap-4 mx-auto">
                  <Donut segments={studySegs} centerTop={`${studyRate}%`} centerBottom="학습 참여" />
                  <VizLegend segments={studySegs} />
                </div>
                <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
                  <CompareBar label="학습 참여율" value={studyRate} color="#34C759" />
                  <CompareBar label="실시간 몰입" value={liveCount} max={total} color="#0071E3" suffix="명" />
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    전체 {total}명 중 <b className="font-semibold text-[#34C759]">{studiedCount}명</b>이 이번 주 순공 시간을 기록했고, <b className="font-semibold text-[#FF9500]">{notStudiedCount}명</b>은 아직 미학습입니다.
                  </p>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* 랭킹 상세 리스트 테이블 */}
        <Card className="border border-black/[0.04] dark:border-white/10 rounded-3xl bg-white dark:bg-[#1c1c1e] shadow-sm overflow-hidden text-left">
          <CardHeader className="p-6 pb-4 border-b border-black/[0.03] dark:border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-sm font-black text-slate-900 dark:text-slate-100">주간 순공 상세 순위표</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">캠퍼스별 학생들의 누적 순공 시간 랭킹입니다.</CardDescription>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <Input
                  type="text"
                  placeholder="이름으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl text-xs border-black/[0.08] dark:border-white/10 focus:border-[#0071E3] focus:ring-[#0071E3] bg-[#F5F5F7]/50 dark:bg-white/5 w-full"
                />
              </div>
              <Button onClick={load} size="sm" variant="outline" className="rounded-xl border-black/[0.06] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5 h-8 shadow-sm">
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-black/[0.02] dark:bg-white/5 text-slate-500 dark:text-slate-400 font-extrabold border-b border-black/[0.04] dark:border-white/10">
                    <th className="px-6 py-3.5 w-16 text-center">순위</th>
                    <th className="px-6 py-3.5">학생 정보</th>
                    <th className="px-6 py-3.5">캠퍼스</th>
                    <th className="px-6 py-3.5">실시간 상태</th>
                    <th className="px-6 py-3.5">오늘 학습 시간</th>
                    <th className="px-6 py-3.5">주간 누적 순공</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold text-center py-12">
                        표시할 랭킹 정보가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((student) => (
                      <tr
                        key={student.id}
                        onClick={() => handleOpenStudentById(student.id)}
                        className={`border-b border-black/[0.02] dark:border-white/10 hover:bg-black/[0.015] dark:hover:bg-white/5 cursor-pointer transition-colors ${openingStudentId === student.id ? 'opacity-60' : ''}`}
                      >
                        <td className="px-6 py-4 text-center">
                          {openingStudentId === student.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#0071E3] mx-auto" />
                          ) : (
                            <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 border ${getRankBadgeStyle(student.rank, student.weekMinutes > 0)}`}>
                              {student.weekMinutes > 0 ? (student.rank <= 3 ? medal(student.rank) : student.rank) : '–'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{student.name}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{campusLabel(student.campus)}</td>
                        <td className="px-6 py-4">
                          {student.isOpen ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/25 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              학습중
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-[#F5F5F7] dark:bg-white/5 border border-black/[0.03] dark:border-white/10 px-2 py-0.5 rounded-full">
                              외출/하원
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                          {student.dayMinutes > 0 ? fmt(student.dayMinutes) : '-'}
                        </td>
                        <td className="px-6 py-4 font-black text-slate-800 dark:text-slate-200">
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
