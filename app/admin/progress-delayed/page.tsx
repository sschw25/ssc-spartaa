'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, ChevronLeft, Search, RefreshCw, Loader2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { getManagedProgressItems, ManagedProgressItem } from '@/lib/progress-plan';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];

const getCampusLabel = (campus: string) => {
  switch (campus) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    default: return '기타';
  }
};

type BehindStudent = {
  student: Student;
  behindItems: ManagedProgressItem[];
  worstShortage: number;
};

export default function ProgressDelayedPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {}
    router.replace('/admin');
  };

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        loadStudents();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStudents(json.data || []);
      } else {
        toast.error('학생 데이터를 가져오는 데 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  const campusScopedStudents = students.filter(s => campusFilter === 'all' || s.campus === campusFilter);
  const allProgressItems = getManagedProgressItems(campusScopedStudents);

  // 진도 지연 원생 목록: status === 'behind' 항목이 하나라도 있는 원생
  const behindStudents: BehindStudent[] = campusScopedStudents
    .map(student => {
      const behindItems = allProgressItems.filter(
        item => item.studentId === student.id && item.status === 'behind'
      );
      const worstShortage = behindItems.reduce((max, item) => Math.max(max, item.shortage ?? 0), 0);
      return { student, behindItems, worstShortage };
    })
    .filter(r => r.behindItems.length > 0)
    .sort((a, b) => b.worstShortage - a.worstShortage);

  const filtered = behindStudents.filter(r =>
    !searchQuery ||
    r.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.student.manager || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans">
      <AdminTopNav title="진도 지연 원생 목록" onLogout={handleLogout} />

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push('/admin/dashboard')}
              className="h-9 w-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition active:scale-95 shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                진도 지연 원생
              </h1>
              <p className="text-xs font-bold text-slate-400 mt-0.5">
                목표 대비 진도가 뒤처진 원생만 표시합니다. 지연량이 많은 순으로 정렬됩니다.
              </p>
            </div>
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

        {/* 캠퍼스 + 검색 필터 */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {CAMPUS_FILTERS.map(c => (
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
          <div className="relative w-full sm:w-56">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="원생명 또는 코치 검색"
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none transition-all"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 요약 배너 */}
        <div className={`rounded-2xl border px-5 py-4 flex items-center gap-4 ${
          filtered.length > 0
            ? 'bg-orange-50 border-orange-200/70'
            : 'bg-white border-slate-100'
        }`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 ${filtered.length > 0 ? 'text-orange-500' : 'text-slate-300'}`} />
          <div>
            <p className={`text-sm font-black ${filtered.length > 0 ? 'text-orange-800' : 'text-slate-400'}`}>
              {filtered.length > 0
                ? `진도 지연 원생 ${filtered.length}명 확인됨`
                : '진도 지연 원생이 없습니다 🟢'}
            </p>
            {filtered.length > 0 && (
              <p className="text-[11px] font-semibold text-orange-600 mt-0.5">
                지연량 기준 내림차순 정렬 · 원생 클릭 시 상세 시트 열림
              </p>
            )}
          </div>
        </div>

        {/* 목록 테이블 */}
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-xs font-bold text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#0071E3]" />
              데이터를 불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm font-bold text-slate-400">
              {searchQuery ? '검색 결과가 없습니다.' : '진도 지연 원생이 없습니다. 아주 훌륭합니다! 🟢'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">원생</th>
                    <th className="px-6 py-4">담당 코치</th>
                    <th className="px-6 py-4">지연 항목</th>
                    <th className="px-6 py-4 text-right">상세 보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {filtered.map(({ student, behindItems, worstShortage }) => (
                    <tr
                      key={student.id}
                      onClick={() => openStudent(student, {
                        onUpdate: updated => setStudents(prev => prev.map(s => s.id === updated.id ? updated : s)),
                        onDelete: id => setStudents(prev => prev.filter(s => s.id !== id)),
                        allStudents: students,
                      })}
                      className="hover:bg-orange-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800">{student.name}</span>
                          <Badge className="bg-slate-100 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">
                            {getCampusLabel(student.campus)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-500">{student.manager || '미지정'}</td>
                      <td className="px-6 py-4">
                        <div className="space-y-1.5">
                          {behindItems.slice(0, 3).map((item, idx) => {
                            const shortage = item.shortage ?? 0;
                            const unit = item.type === 'book' ? 'p' : '강';
                            const progressPct = item.total > 0 ? Math.round((item.current / item.total) * 100) : 0;
                            return (
                              <div key={idx} className="flex items-center gap-2 flex-wrap text-[10px]">
                                <span className="bg-orange-50 border border-orange-200/60 text-orange-700 font-black px-1.5 py-0.5 rounded">
                                  {item.subjectName}
                                </span>
                                <span className="font-bold text-slate-700 truncate max-w-[140px]">{item.title}</span>
                                <span className="font-extrabold text-slate-500">{progressPct}%</span>
                                {shortage > 0 && (
                                  <span className="text-red-600 font-extrabold">
                                    -{shortage}{unit} 지연
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {behindItems.length > 3 && (
                            <p className="text-[9px] text-slate-400 font-bold">
                              외 {behindItems.length - 3}개 항목 더 지연
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-orange-500 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
