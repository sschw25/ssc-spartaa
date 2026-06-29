'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, ChevronLeft, Search, RefreshCw, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { enrollmentDaysLeft } from '@/lib/student-flags';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

const RENEWAL_WARN_DAYS = 5;
const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];

const getCampusLabel = (campus: string) => {
  switch (campus) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    default: return '기타';
  }
};

export default function EnrollmentWarningPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); } catch {}
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
        if (!res.ok) { router.replace('/admin'); return; }
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

  const campusScopedStudents = campusFilter === 'all'
    ? students
    : students.filter(s => s.campus === campusFilter);

  const warningStudents = campusScopedStudents
    .filter(s => {
      const d = enrollmentDaysLeft(s.enrollmentEndDate);
      return d !== null && d >= 0 && d <= RENEWAL_WARN_DAYS;
    })
    .map(s => ({ student: s, daysLeft: enrollmentDaysLeft(s.enrollmentEndDate)! }))
    .sort((a, b) => a.daysLeft - b.daysLeft); // 마감 임박 순

  const filtered = warningStudents.filter(({ student }) =>
    !searchQuery ||
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (student.manager || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <AdminTopNav title="재등록 임박 원생 목록" onLogout={handleLogout} />

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
                <Clock className="w-5 h-5 text-amber-500" />
                재등록 임박 원생
              </h1>
              <p className="text-xs font-bold text-slate-400 mt-0.5">
                {RENEWAL_WARN_DAYS}일 이내 등록이 종료되는 원생입니다. 재등록 안내가 필요합니다.
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
                    ? 'border-amber-600 bg-amber-600 text-white'
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
              placeholder="원생명 또는 코멘터 검색"
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none transition-all"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 요약 배너 */}
        <div className={`rounded-2xl border px-5 py-4 flex items-center gap-4 ${
          filtered.length > 0 ? 'bg-amber-50 border-amber-200/70' : 'bg-white border-slate-100'
        }`}>
          <Clock className={`w-5 h-5 shrink-0 ${filtered.length > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
          <div>
            <p className={`text-sm font-black ${filtered.length > 0 ? 'text-amber-800' : 'text-slate-400'}`}>
              {filtered.length > 0
                ? `재등록 임박 원생 ${filtered.length}명 · ${RENEWAL_WARN_DAYS}일 이내 종료`
                : '재등록 임박 원생이 없습니다'}
            </p>
            {filtered.length > 0 && (
              <p className="text-[11px] font-semibold text-amber-600 mt-0.5">
                마감 임박 순 정렬 · 원생 클릭 시 상세 시트 열림
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
              {searchQuery ? '검색 결과가 없습니다.' : '재등록 임박 원생이 없습니다'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">원생</th>
                    <th className="px-6 py-4">담당 코멘터</th>
                    <th className="px-6 py-4">등록 종료일</th>
                    <th className="px-6 py-4">남은 기간</th>
                    <th className="px-6 py-4 text-right">상세 보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {filtered.map(({ student, daysLeft }) => (
                    <tr
                      key={student.id}
                      onClick={() => openStudent(student, {
                        onUpdate: updated => setStudents(prev => prev.map(s => s.id === updated.id ? updated : s)),
                        onDelete: id => setStudents(prev => prev.filter(s => s.id !== id)),
                        allStudents: students,
                      })}
                      className="hover:bg-amber-50/40 cursor-pointer transition-colors group"
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
                      <td className="px-6 py-4 font-bold text-slate-600">{student.enrollmentEndDate || '미설정'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 font-black rounded-lg px-2.5 py-1 text-[10px] ${
                          daysLeft === 0
                            ? 'bg-red-100 text-red-700'
                            : daysLeft <= 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {daysLeft === 0 ? 'D-Day' : `D-${daysLeft}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-amber-500 transition-colors" />
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
