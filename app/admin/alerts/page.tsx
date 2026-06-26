'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, ChevronLeft, Search, Clock, Calendar, User, 
  ArrowRight, ShieldAlert, Sparkles, HelpCircle 
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { getManagedProgressItems } from '@/lib/progress-plan';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { AnimatedNumber } from '@/components/admin/animated-number';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];

const getCampusLabel = (campus: string) => {
  switch (campus) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    default: return '기타';
  }
};

function AdminAlertsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openStudent } = useAdminGlobalSheet();
  
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 캠퍼스 및 알림 유형 필터 상태
  const [campusFilter, setCampusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'stagnant' | 'delayed' | 'consultation'>('stagnant');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. 인증 체크 및 초기 탭 설정
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        
        // 쿼리 파라미터에 따른 초기 탭 매핑
        const typeParam = searchParams.get('type');
        if (typeParam === 'stagnant' || typeParam === 'delayed' || typeParam === 'consultation') {
          setActiveTab(typeParam);
        }
        
        loadStudents();
      } catch (err) {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router, searchParams]);

  // 2. 로그아웃
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {}
    router.replace('/admin');
  };

  // 3. 학생 데이터 로드
  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStudents(json.data || []);
        }
      } else {
        toast.error('학생 데이터를 가져오는 데 실패했습니다.');
      }
    } catch (err) {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 3. 진도 데이터 마지막 업데이트 탐색 헬퍼
  const getStudentLastUpdate = (s: Student) => {
    let max = s.updatedAt || s.createdAt || '';
    if (s.books) {
      s.books.forEach(b => {
        if (b.updatedAt && b.updatedAt > max) max = b.updatedAt;
      });
    }
    if (s.lectures) {
      s.lectures.forEach(l => {
        if (l.updatedAt && l.updatedAt > max) max = l.updatedAt;
      });
    }
    if (s.subjects) {
      s.subjects.forEach(sub => {
        if (sub.books) {
          sub.books.forEach(b => {
            if (b.updatedAt && b.updatedAt > max) max = b.updatedAt;
          });
        }
        if (sub.lectures) {
          sub.lectures.forEach(l => {
            if (l.updatedAt && l.updatedAt > max) max = l.updatedAt;
          });
        }
      });
    }
    return max;
  };

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F9FA]">
        <div className="flex items-center gap-2 text-sm font-black text-slate-400">
          <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          인증 확인 중...
        </div>
      </div>
    );
  }

  // 캠퍼스별 필터링
  const campusScopedStudents = students.filter(s => campusFilter === 'all' || s.campus === campusFilter);

  // 4. 알림 대상자 연산 및 분류
  const now = new Date();
  const allProgressItems = getManagedProgressItems(campusScopedStudents);

  const stagnantAndSlow = campusScopedStudents.map(student => {
    const lastUpdateStr = getStudentLastUpdate(student);
    const lastUpdate = lastUpdateStr ? new Date(lastUpdateStr) : new Date(student.createdAt);
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    const isStagnant24h = hoursSinceUpdate >= 24;

    const studentItems = allProgressItems.filter(item => item.studentId === student.id);
    const slowItems = studentItems.filter(item => item.status === 'behind');
    const worstShortage = slowItems.reduce((max, item) => Math.max(max, item.shortage ?? 0), 0);

    return {
      student,
      lastUpdateStr,
      hoursSinceUpdate,
      isStagnant24h,
      isSlow: slowItems.length > 0,
      slowItems,
      worstShortage
    };
  });

  // (1) 24시간 초과 정체 (🔴 긴급)
  const stagnantList = stagnantAndSlow.filter(r => r.isStagnant24h);
  // (2) 진도 지연 원생 (🟠 주의) - 지연량이 많은 순으로 정렬
  const delayedList = stagnantAndSlow
    .filter(r => !r.isStagnant24h && r.isSlow)
    .sort((a, b) => b.worstShortage - a.worstShortage);

  // (3) 상담 도래 원생 (⚪ 중립)
  const todayStr = now.toISOString().split('T')[0];
  const consultationList = campusScopedStudents.filter(s => {
    if (!s.nextConsultationDate) return false;
    return s.nextConsultationDate <= todayStr;
  });

  // 검색어 필터링
  const filterBySearch = (name: string, manager: string) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || manager.toLowerCase().includes(query);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-12 font-sans text-[#1D1D1F]">
      <AdminTopNav title="원생 진도 및 일정 관리 케어" onLogout={handleLogout} />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        {/* 헤더 및 필터 영역 */}
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
              <h1 className="text-xl font-black tracking-tight md:text-2xl">원생 진도 및 일정 관리 케어</h1>
              <p className="text-xs font-bold text-slate-400 mt-0.5">정체 원생, 지연 원생 및 상담 예정자를 밀착 마크하고 솔루션을 제공하세요.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CAMPUS_FILTERS.map(campus => (
              <button
                key={campus}
                onClick={() => setCampusFilter(campus)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                  campusFilter === campus
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {campus === 'all' ? '전체 캠퍼스' : getCampusLabel(campus)}
              </button>
            ))}
          </div>
        </div>

        {/* 3열 요약 탭 칩스 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* 정체 카드 🔴 */}
          <button
            onClick={() => setActiveTab('stagnant')}
            className={`text-left p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-md ${
              activeTab === 'stagnant'
                ? 'border-red-500/20 bg-red-500/[0.03] shadow-[0_4px_16px_rgba(239,68,68,0.04)]'
                : 'border-slate-100 bg-white shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="p-2 rounded-2xl bg-red-500/10 text-red-600">
                <Clock className="w-5 h-5" />
              </span>
              <Badge className="bg-red-100 text-red-800 border-none font-black rounded-lg">🔴 긴급</Badge>
            </div>
            <h3 className="text-base font-black text-slate-800 mt-4">24시간 진도 정체</h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">하루 동안 진도 갱신이 없는 원생</p>
            <p className="text-2xl font-black text-red-600 mt-2"><AnimatedNumber value={stagnantList.length} suffix="명" /></p>
          </button>

          {/* 지연 카드 🟠 */}
          <button
            onClick={() => setActiveTab('delayed')}
            className={`text-left p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-md ${
              activeTab === 'delayed'
                ? 'border-amber-500/20 bg-amber-50/[0.03] shadow-[0_4px_16px_rgba(245,99,0,0.04)]'
                : 'border-slate-100 bg-white shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="p-2 rounded-2xl bg-amber-500/10 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <Badge className="bg-amber-100 text-amber-800 border-none font-black rounded-lg">🟠 주의</Badge>
            </div>
            <h3 className="text-base font-black text-slate-800 mt-4">진도 지연 원생</h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">목표 계획 대비 진도가 뒤처진 원생</p>
            <p className="text-2xl font-black text-amber-600 mt-2"><AnimatedNumber value={delayedList.length} suffix="명" /></p>
          </button>

          {/* 상담 카드 ⚪ */}
          <button
            onClick={() => setActiveTab('consultation')}
            className={`text-left p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-md ${
              activeTab === 'consultation'
                ? 'border-slate-900/20 bg-slate-50 shadow-[0_4px_16px_rgba(29,29,31,0.04)]'
                : 'border-slate-100 bg-white shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="p-2 rounded-2xl bg-slate-100 text-slate-600">
                <Calendar className="w-5 h-5" />
              </span>
              <Badge className="bg-slate-100 text-slate-700 border-none font-black rounded-lg">⚪ 도래</Badge>
            </div>
            <h3 className="text-base font-black text-slate-800 mt-4">상담 일정 도래</h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">오늘 혹은 과거 상담 예정일 원생</p>
            <p className="text-2xl font-black text-slate-700 mt-2"><AnimatedNumber value={consultationList.length} suffix="명" /></p>
          </button>
        </div>

        {/* 상세 목록 테이블 영역 */}
        <Card className="rounded-2xl border-slate-100 bg-white shadow-sm">
          <CardHeader className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-100">
            <div>
              <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                {activeTab === 'stagnant' && <span className="w-2 h-2 rounded-full bg-red-500" />}
                {activeTab === 'delayed' && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                {activeTab === 'consultation' && <span className="w-2 h-2 rounded-full bg-slate-400" />}
                {activeTab === 'stagnant' ? '24시간 동안 진도가 정체된 원생 목록 (🔴 긴급)' : 
                 activeTab === 'delayed' ? '계획보다 진도가 뒤처진 원생 목록 (🟠 주의)' : 
                 '상담 예정일이 오늘이거나 경과된 원생 목록 (⚪ 중립)'}
              </CardTitle>
              <CardDescription className="text-[11px] font-bold text-slate-400 mt-1">행을 누르면 원생 상세 시트가 열립니다.</CardDescription>
            </div>

            {/* 검색바 */}
            <div className="relative shrink-0 w-full sm:w-64">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="원생명 또는 코치 검색"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-8.5 pr-4 py-2 text-xs font-semibold text-slate-800 focus:border-slate-300 focus:bg-white focus:outline-none transition-all"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin" />
                <span className="text-xs font-bold text-slate-400">데이터를 로드하는 중...</span>
              </div>
            ) : (
              <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                  <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">원생 정보</th>
                      <th className="px-6 py-4">담당 코치</th>
                      {activeTab === 'stagnant' && <th className="px-6 py-4">마지막 업데이트 시각</th>}
                      {activeTab === 'stagnant' && <th className="px-6 py-4">진도 미갱신 시간</th>}
                      {activeTab === 'delayed' && <th className="px-6 py-4">지연된 학습 항목 및 지연도</th>}
                      {activeTab === 'consultation' && <th className="px-6 py-4">상담 예정일</th>}
                      <th className="px-6 py-4 text-right">피드백 이동</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    {/* (1) 진도 정체 목록 */}
                    {activeTab === 'stagnant' && stagnantList
                      .filter(r => filterBySearch(r.student.name, r.student.manager))
                      .map(r => (
                        <tr
                          key={r.student.id}
                          onClick={() => openStudent(r.student, {
                            onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
                            onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
                            allStudents: students,
                          })}
                          className="hover:bg-slate-50/60 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4 font-black text-slate-800">
                            <span className="flex items-center gap-2">
                              {r.student.name}
                              <Badge className="bg-slate-100 hover:bg-slate-200 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">{getCampusLabel(r.student.campus)}</Badge>
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-500">{r.student.manager || '미지정'}</td>
                          <td className="px-6 py-4 text-slate-400 font-bold">
                            {r.lastUpdateStr ? new Date(r.lastUpdateStr).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '갱신 기록 없음'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-red-600 font-black flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {Math.floor(r.hoursSinceUpdate)}시간 경과
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-[#0071E3] transition-colors" />
                          </td>
                        </tr>
                    ))}

                    {/* (2) 진도 지연 목록 */}
                    {activeTab === 'delayed' && delayedList
                      .filter(r => filterBySearch(r.student.name, r.student.manager))
                      .map(r => (
                        <tr
                          key={r.student.id}
                          onClick={() => openStudent(r.student, {
                            onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
                            onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
                            allStudents: students,
                          })}
                          className="hover:bg-slate-50/60 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4 font-black text-slate-800">
                            <span className="flex items-center gap-2">
                              {r.student.name}
                              <Badge className="bg-slate-100 hover:bg-slate-200 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">{getCampusLabel(r.student.campus)}</Badge>
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-500">{r.student.manager || '미지정'}</td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {r.slowItems.slice(0, 2).map((item, idx) => {
                                const expectedToday = item.expectedToday || 0;
                                const behind = expectedToday - item.current;
                                const pct = expectedToday > 0 ? Math.round((behind / expectedToday) * 100) : 0;
                                const unit = item.type === 'book' ? 'p' : '강';
                                return (
                                  <div key={idx} className="flex items-center gap-2 text-[10px]">
                                    <span className="bg-amber-50 text-amber-700 font-black px-1.5 py-0.5 rounded border border-amber-100">{item.subjectName}</span>
                                    <span className="text-slate-700 font-black">{item.title}</span>
                                    <span className="text-red-500 font-extrabold">{behind}{unit} 밀림 ({pct}% 지연)</span>
                                  </div>
                                );
                              })}
                              {r.slowItems.length > 2 && (
                                <p className="text-[9px] text-slate-400 font-bold">외 {r.slowItems.length - 2}개 과목 더 밀림</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-[#0071E3] transition-colors" />
                          </td>
                        </tr>
                    ))}

                    {/* (3) 상담 도래 목록 */}
                    {activeTab === 'consultation' && consultationList
                      .filter(s => filterBySearch(s.name, s.manager))
                      .map(s => (
                        <tr
                          key={s.id}
                          onClick={() => openStudent(s, {
                            onUpdate: (updated) => setStudents((prev) => prev.map((st) => st.id === updated.id ? updated : st)),
                            onDelete: (id) => setStudents((prev) => prev.filter((st) => st.id !== id)),
                            allStudents: students,
                          })}
                          className="hover:bg-slate-50/60 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4 font-black text-slate-800">
                            <span className="flex items-center gap-2">
                              {s.name}
                              <Badge className="bg-slate-100 hover:bg-slate-200 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">{getCampusLabel(s.campus)}</Badge>
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-500">{s.manager || '미지정'}</td>
                          <td className="px-6 py-4">
                            <span className="text-[#F56300] font-black flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {s.nextConsultationDate || '지정되지 않음'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-[#0071E3] transition-colors" />
                          </td>
                        </tr>
                    ))}

                    {/* 데이터가 비어 있을 때 */}
                    {((activeTab === 'stagnant' && stagnantList.length === 0) ||
                      (activeTab === 'delayed' && delayedList.length === 0) ||
                      (activeTab === 'consultation' && consultationList.length === 0)) && (
                      <tr>
                        <td colSpan={5} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <span className="text-3xl animate-float-y">🟢</span>
                            <p className="text-xs font-bold text-slate-400">이 조건에 해당하는 알림 원생이 없습니다. 아주 훌륭합니다!</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </motion.div>
              </AnimatePresence>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function AdminAlertsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-[#F8F9FA]">
        <div className="text-sm font-black text-slate-400">로딩 중...</div>
      </div>
    }>
      <AdminAlertsContent />
    </Suspense>
  );
}
