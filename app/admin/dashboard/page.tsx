'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, User, Calendar, BarChart3, Search, Plus, Minus, LogOut, Loader2, 
  MapPin, AlertTriangle, ChevronRight, SlidersHorizontal, BookOpen, Tv, Settings,
  ArrowLeft, LayoutDashboard, LayoutGrid, Table
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { getManagedProgressItems, getStudentTodayTotalStudyTimeMin } from '@/lib/progress-plan';
import { AddStudentModal } from '@/components/admin/add-student-modal';
import { StudentDetailSheet } from '@/components/admin/student-detail-sheet';
import { TodayAttendanceWidget } from '@/components/admin/today-attendance-widget';
import { AdminLeaderboard } from '@/components/admin/admin-leaderboard';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // 검색 & 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'consultation' | 'behind'>('all');
  const [dashboardTab, setDashboardTab] = useState('cards');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [progressSort, setProgressSort] = useState<'shortage' | 'status' | 'name'>('shortage');
  // 300명+ 대비 점진적 렌더링(더 보기)
  const PAGE_SIZE = 50;
  const [studentLimit, setStudentLimit] = useState(PAGE_SIZE);
  const [progressLimit, setProgressLimit] = useState(PAGE_SIZE);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 디바운스 자동저장 타이머 & 최신 상태 Ref 관리
  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const studentsRef = useRef<Student[]>([]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // 검색/필터/정렬이 바뀌면 "더 보기" 누적을 초기화해 상위 결과부터 보이게
  useEffect(() => {
    setStudentLimit(PAGE_SIZE);
    setProgressLimit(PAGE_SIZE);
  }, [searchTerm, campusFilter, quickFilter, progressSort]);

  // 모달 및 시트 제어 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // 출결 위젯 새로고침 신호 (학생 목록 새로고침 시 함께 갱신)
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);

  const handleOpenStudentById = (id: string) => {
    const target = studentsRef.current.find((s) => s.id === id);
    if (!target) {
      toast.error('해당 원생을 목록에서 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    setSelectedStudent(target);
    setIsDetailOpen(true);
  };

  // 1. 인증 체크
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        // 인증 성공 시 데이터 로드
        loadStudents();
      } catch (err) {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router]);

  // 2. 학생 데이터 로드
  const loadStudents = async () => {
    setLoading(true);
    setAttendanceRefresh((n) => n + 1);
    try {
      const res = await fetch('/api/admin/students');
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

  // 3. 로그아웃
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/admin/auth/logout', { method: 'POST' });
      if (res.ok) {
        toast.success('로그아웃 되었습니다.');
        router.replace('/admin');
      }
    } catch (err) {
      toast.error('로그아웃 실패');
    }
  };

  const handleFocusSearch = () => {
    const searchEl = searchInputRef.current;
    if (!searchEl) return;
    searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => searchEl.focus(), 250);
  };

  const handleShowAllStudents = () => {
    setQuickFilter('all');
    setDashboardTab('cards');
    setSearchTerm('');
    setCampusFilter('all');
    window.setTimeout(() => document.getElementById('student-list-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleShowConsultationStudents = () => {
    setQuickFilter('consultation');
    setDashboardTab('cards');
    setSearchTerm('');
    window.setTimeout(() => document.getElementById('student-list-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleShowBehindMaterials = () => {
    setQuickFilter('behind');
    setDashboardTab('db');
    setSearchTerm('');
    window.setTimeout(() => document.getElementById('progress-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const getProgressDraftKey = (studentId: string, itemId: string) => `${studentId}_${itemId}`;

  // 4. 진도율 테이블 퀵 조절용 API 호출
  const handleQuickAdjustProgress = async (
    studentId: string,
    itemType: 'book' | 'lecture',
    itemId: string,
    direction: 'inc' | 'dec' | 'set',
    exactValue?: number
  ) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const nowStr = new Date().toISOString();
    let updatedBooks = [...student.books];
    let updatedLectures = [...student.lectures];
    let updatedSubjects = student.subjects || [];
    const draftKey = getProgressDraftKey(studentId, itemId);

    const resolveNextCurrent = (current: number, total: number) => {
      if (direction === 'set') {
        return Math.min(total, Math.max(0, Number(exactValue) || 0));
      }
      return direction === 'inc'
        ? Math.min(total, current + 1)
        : Math.max(0, current - 1);
    };

    if (itemType === 'book') {
      const updateBook = (b: any) => {
        if (b.id === itemId) {
          const newCurrent = resolveNextCurrent(b.currentPage, b.totalPages);
          return { ...b, currentPage: newCurrent, updatedAt: nowStr };
        }
        return b;
      };
      updatedBooks = updatedBooks.map(b => {
        if (b.id === itemId) {
          const newCurrent = resolveNextCurrent(b.currentPage, b.totalPages);
          return { ...b, currentPage: newCurrent, updatedAt: nowStr };
        }
        return b;
      });
      updatedSubjects = updatedSubjects.map(subject => ({
        ...subject,
        books: (subject.books || []).map(updateBook),
        updatedAt: nowStr
      }));
    } else {
      const updateLecture = (l: any) => {
        if (l.id === itemId) {
          const newCurrent = resolveNextCurrent(l.completedLectures, l.totalLectures);
          return { ...l, completedLectures: newCurrent, updatedAt: nowStr };
        }
        return l;
      };
      updatedLectures = updatedLectures.map(l => {
        if (l.id === itemId) {
          const newCurrent = resolveNextCurrent(l.completedLectures, l.totalLectures);
          return { ...l, completedLectures: newCurrent, updatedAt: nowStr };
        }
        return l;
      });
      updatedSubjects = updatedSubjects.map(subject => ({
        ...subject,
        lectures: (subject.lectures || []).map(updateLecture),
        updatedAt: nowStr
      }));
    }

    const updatedStudent: Student = {
      ...student,
      books: updatedBooks,
      lectures: updatedLectures,
      subjects: updatedSubjects,
      updatedAt: nowStr
    };

    // 로컬 상태 즉각 반영 (Optimistic UI)
    setStudents(prev => prev.map(s => s.id === studentId ? updatedStudent : s));
    setProgressDrafts(prev => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });

    // 기존 활성화된 디바운스 타이머가 있다면 클리어
    if (debounceTimersRef.current[studentId]) {
      clearTimeout(debounceTimersRef.current[studentId]);
    }

    // 0.5초 디바운스 대기 후 구글 시트에 최종 데이터 전송
    debounceTimersRef.current[studentId] = setTimeout(async () => {
      const currentStudent = studentsRef.current.find(s => s.id === studentId);
      if (!currentStudent) return;

      try {
        const res = await fetch(`/api/admin/students/${studentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentStudent),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error('구글 시트 진도 동기화에 실패했습니다.');
          loadStudents(); // 실패 시 롤백
        }
      } catch (err) {
        toast.error('네트워크 에러로 구글 시트 동기화에 실패했습니다.');
        loadStudents();
      }
    }, 500);
  };

  // 데이터 가공 및 통계 계산
  const totalStudentsCount = students.length;
  
  // 오늘 상담이 예정되었거나 지난 학생들
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingConsultationStudents = students.filter(s => {
    if (!s.nextConsultationDate) return false;
    return s.nextConsultationDate <= todayStr;
  });

  // 진도 관리 항목 단일 소스 (과목 기반). 평균/필터/테이블이 모두 이 값을 공유한다.
  const allProgressItems = getManagedProgressItems(students);

  // 전체 교재/인강 완강 평균 진도율 — 진도표와 동일한 소스로 계산 (수치 불일치 방지)
  const calculateAverageProgress = () => {
    let totalPercent = 0;
    let itemsCount = 0;

    allProgressItems.forEach(item => {
      if (item.total > 0) {
        totalPercent += (item.current / item.total) * 100;
        itemsCount++;
      }
    });

    return itemsCount > 0 ? Math.round(totalPercent / itemsCount) : 0;
  };

  const averageProgress = calculateAverageProgress();

  // 검색 및 필터링된 학생 목록
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCampus = campusFilter === 'all' || s.campus === campusFilter;
    const matchesQuickFilter = quickFilter !== 'consultation' || pendingConsultationStudents.some(target => target.id === s.id);
    return matchesSearch && matchesCampus && matchesQuickFilter;
  });

  // 상태 우선순위 (부족 → 진행중 → 충족 → 계획없음)
  const statusRank: Record<string, number> = { behind: 0, 'on-track': 1, ahead: 2, 'no-plan': 3 };

  // 필터링 + 정렬된 전체 교재 진도 아이템
  const filteredProgressItems = allProgressItems
    .filter(item => {
      const matchesSearch = item.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCampus = campusFilter === 'all' || item.campus === campusFilter;
      const matchesQuickFilter = quickFilter !== 'behind' || item.status === 'behind';
      return matchesSearch && matchesCampus && matchesQuickFilter;
    })
    .sort((a, b) => {
      if (progressSort === 'name') {
        return a.studentName.localeCompare(b.studentName, 'ko');
      }
      if (progressSort === 'status') {
        return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
               (b.shortage ?? -1) - (a.shortage ?? -1);
      }
      // 'shortage' — 부족분 많은 순(데이터 없으면 뒤로), 동률이면 상태순
      return (b.shortage ?? -1) - (a.shortage ?? -1) ||
             (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    });

  // "더 보기" 적용된 렌더 대상 (300명+ 환경에서 한 번에 수천 행 렌더 방지)
  const visibleStudents = filteredStudents.slice(0, studentLimit);
  const visibleProgressItems = filteredProgressItems.slice(0, progressLimit);

  const getProgressStatusStyle = (status: string) => {
    switch (status) {
      case 'behind': return 'bg-red-50 text-red-700 border-red-100';
      case 'ahead': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'on-track': return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getProgressStatusLabel = (status: string) => {
    switch (status) {
      case 'behind': return '부족';
      case 'ahead': return '충족';
      case 'on-track': return '진행중';
      default: return '계획 없음';
    }
  };

  const getCampusLabel = (val: string) => {
    switch(val) {
      case 'wonju': return '원주';
      case 'chuncheon': return '춘천';
      case 'chungju': return '충주';
      default: return '기타';
    }
  };

  const getCampusBadgeColor = (val: string) => {
    switch(val) {
      case 'wonju': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'chuncheon': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'chungju': return 'bg-purple-50 text-purple-700 border-purple-100';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStudentSubjectSummaries = (student: Student) => {
    const subjects = student.subjects && student.subjects.length > 0
      ? student.subjects
      : [{
          id: 'fallback',
          name: '기본',
          learningGoal: '',
          books: student.books || [],
          lectures: student.lectures || [],
          updatedAt: student.updatedAt
        }];

    return subjects
      .map(subject => {
        const items = [
          ...(subject.books || []).map(book => ({
            id: book.id,
            type: 'book' as const,
            title: book.title,
            current: book.currentPage,
            total: book.totalPages,
            unit: 'p',
            updatedAt: book.updatedAt,
            targetDate: book.targetDate,
            percent: book.totalPages > 0 ? Math.round((book.currentPage / book.totalPages) * 100) : 0,
            startDate: book.detailedPlans?.[0]?.startDate || student.createdAt,
          })),
          ...(subject.lectures || []).map(lecture => ({
            id: lecture.id,
            type: 'lecture' as const,
            title: lecture.name,
            current: lecture.completedLectures,
            total: lecture.totalLectures,
            unit: '강',
            updatedAt: lecture.updatedAt,
            targetDate: lecture.targetDate,
            percent: lecture.totalLectures > 0 ? Math.round((lecture.completedLectures / lecture.totalLectures) * 100) : 0,
            startDate: lecture.detailedPlans?.[0]?.startDate || student.createdAt,
          })),
        ].sort((a, b) => {
          const aActive = a.percent < 100 ? 0 : 1;
          const bActive = b.percent < 100 ? 0 : 1;
          return aActive - bActive || b.updatedAt.localeCompare(a.updatedAt);
        });

        return {
          id: subject.id,
          name: subject.name,
          activeItems: items.filter(item => item.percent < 100).slice(0, 2),
          completedItems: items.filter(item => item.percent >= 100).slice(0, 2),
          completedCount: items.filter(item => item.percent >= 100).length,
          totalCount: items.length,
          periodStart: items.map(item => item.startDate).sort()[0],
        };
      })
      .filter(summary => summary.totalCount > 0)
      .slice(0, 3);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">세션 권한 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans selection:bg-black/10 transition-all">
      
      {/* Navbar */}
      <nav className="border-b border-black/[0.05] bg-white/95 backdrop-blur-md sticky top-0 z-30 px-4 md:px-6 py-3 flex justify-between items-center gap-3 admin-mobile-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-extrabold text-sm tracking-tight text-white bg-[#1D1D1F] px-2.5 py-1.5 rounded-lg mr-2">SSC</span>
          <h1 className="admin-fit-text text-sm font-bold tracking-tight">학습 및 진도 체계적 관리 대시보드</h1>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.back()}
            className="admin-fit-button rounded-lg text-xs h-9 px-2.5 hover:bg-[#F5F5F7]"
            title="뒤로가기"
          >
            <ArrowLeft className="w-4 h-4 md:mr-1.5" />
            <span className="hidden md:inline">뒤로</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.replace('/admin/dashboard')}
            className="admin-fit-button rounded-lg border-black/[0.08] hover:bg-[#F5F5F7] text-xs h-9 bg-white px-2.5"
            title="대시보드"
          >
            <LayoutDashboard className="w-4 h-4 md:mr-1.5" />
            <span className="hidden md:inline">대시보드</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleFocusSearch}
            className="admin-fit-button rounded-lg border-black/[0.08] hover:bg-[#F5F5F7] text-xs h-9 bg-white px-2.5"
            title="검색"
          >
            <Search className="w-4 h-4 md:mr-1.5" />
            <span className="hidden md:inline">검색</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadStudents}
            className="admin-fit-button rounded-lg border-black/[0.08] hover:bg-[#F5F5F7] text-xs h-9 bg-white px-2.5"
            title="새로고침"
          >
            <span className="hidden sm:inline">새로고침</span>
            <span className="sm:hidden">새로고침</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleLogout}
            className="admin-fit-button text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs h-9 px-2.5"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        {/* 1. 알림 배너 (상담 필요 학생) */}
        {pendingConsultationStudents.length > 0 && (
          <div className="admin-fit-box bg-amber-50 border border-amber-200 rounded-2xl p-4.5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 animate-pulse-slow shadow-sm">
            <div className="admin-fit-row flex items-start gap-3">
              <AlertTriangle className="admin-fit-icon w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="admin-fit-text admin-fit-label font-bold text-amber-900">상담 일정이 도래한 원생이 존재합니다 ({pendingConsultationStudents.length}명)</h4>
                <p className="admin-fit-caption text-amber-700 mt-1 leading-relaxed">
                  다음 상담일이 오늘이거나 경과되었습니다. 원생명을 클릭해 밀착 상담 및 목표 피드백을 진행해 주세요.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {pendingConsultationStudents.slice(0, 4).map(s => (
                <Badge
                  key={s.id}
                  onClick={() => {
                    setSelectedStudent(s);
                    setIsDetailOpen(true);
                  }}
                  className="admin-fit-button bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 cursor-pointer rounded-lg px-2.5 py-1 text-[10px] font-bold max-w-[9rem]"
                >
                  {s.name} ({getCampusLabel(s.campus)})
                </Badge>
              ))}
              {pendingConsultationStudents.length > 4 && (
                <span className="text-[10px] text-amber-700 font-bold self-center">외 {pendingConsultationStudents.length - 4}명 더 있음</span>
              )}
            </div>
          </div>
        )}

        {/* 2. 대시보드 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card
            onClick={handleShowAllStudents}
            className="admin-fit-box border border-black/[0.05] rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer focus-within:ring-2 focus-within:ring-[#0071E3]/30"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="admin-fit-text admin-fit-label font-bold tracking-wider text-[#86868B] uppercase">총 수강 원생</CardDescription>
              <Users className="admin-fit-icon w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent>
              <div className="admin-fit-number font-bold">{totalStudentsCount} 명</div>
              <p className="admin-fit-caption text-[#86868B] mt-1">
                원주 / 춘천 / 충주 통합 관리 중인 원생 수
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowAllStudents();
                }}
                className="admin-fit-caption text-[#0071E3] mt-2 font-bold hover:underline text-left"
              >
                전체 원생 보기
              </button>
            </CardContent>
          </Card>

          <Card
            onClick={handleShowConsultationStudents}
            className={`admin-fit-box border rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
              quickFilter === 'consultation' ? 'border-[#0071E3] bg-blue-50/50 ring-2 ring-[#0071E3]/20' : 'border-black/[0.05]'
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="admin-fit-text admin-fit-label font-bold tracking-wider text-[#86868B] uppercase">금주 상담 필요</CardDescription>
              <Calendar className="admin-fit-icon w-4 h-4 text-[#F56300]" />
            </CardHeader>
            <CardContent>
              <div className="admin-fit-number font-bold text-amber-600">{pendingConsultationStudents.length} 명</div>
              <p className="admin-fit-caption text-[#86868B] mt-1">
                상담 일지가 작성되어야 할 밀착 통제 대상자
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowConsultationStudents();
                }}
                className="admin-fit-caption text-amber-700 mt-2 font-bold hover:underline text-left"
              >
                대상 원생 보기
              </button>
            </CardContent>
          </Card>

          <Card
            onClick={handleShowBehindMaterials}
            className={`admin-fit-box border rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
              quickFilter === 'behind' ? 'border-[#862bf7] bg-purple-50/40 ring-2 ring-[#862bf7]/20' : 'border-black/[0.05]'
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="admin-fit-text admin-fit-label font-bold tracking-wider text-[#86868B] uppercase">평균 학습 진도율</CardDescription>
              <BarChart3 className="admin-fit-icon w-4 h-4 text-[#862bf7]" />
            </CardHeader>
            <CardContent>
              <div className="admin-fit-number font-bold text-[#862bf7]">{averageProgress}%</div>
              <p className="admin-fit-caption text-[#86868B] mt-1">
                전체 교재 및 인강 완독/완강 진행도 평균
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowBehindMaterials();
                }}
                className="admin-fit-caption text-[#862bf7] mt-2 font-bold hover:underline text-left"
              >
                부족 진도 보기
              </button>
            </CardContent>
          </Card>
        </div>

        {/* 2-1. 오늘 출결 현황 + 주간 순공 랭킹(전체) */}
        <div className="flex justify-end -mb-1">
          <button
            onClick={() => router.push('/admin/attendance')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0071E3] hover:underline"
          >
            출결 상세 표 (등·하원 시간 / 지각 정렬) →
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TodayAttendanceWidget
            campusFilter={campusFilter}
            refreshSignal={attendanceRefresh}
            onSelectStudentId={handleOpenStudentById}
          />
          <AdminLeaderboard
            campusFilter={campusFilter}
            refreshSignal={attendanceRefresh}
            onSelectStudentId={handleOpenStudentById}
          />
        </div>

        {/* 3. 필터 및 검색 바 */}
        <div className="admin-fit-box flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4.5 rounded-2xl border border-black/[0.05] shadow-sm">
          <div className="admin-fit-row flex flex-1 items-center gap-2 admin-mobile-wrap">
            <div className="relative flex-1 max-w-md min-w-[14rem] admin-mobile-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
              <Input
                ref={searchInputRef}
                placeholder="수강생 이름 또는 교재명을 입력해 주세요."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-xl border-black/[0.08] text-xs h-10 bg-[#F5F5F7]"
              />
            </div>
            <div className="flex border border-black/[0.05] bg-[#F5F5F7] p-0.5 rounded-xl min-w-0 overflow-hidden">
              {['all', 'wonju', 'chuncheon', 'chungju'].map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={campusFilter === c ? 'default' : 'ghost'}
                  onClick={() => setCampusFilter(c)}
                  className={`admin-fit-button text-[11px] h-8.5 rounded-lg px-2.5 md:px-3 ${campusFilter === c ? 'bg-white hover:bg-white text-black shadow-sm font-bold' : 'text-[#86868B]'}`}
                >
                  {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="admin-fit-button rounded-xl bg-[#1D1D1F] hover:bg-[#323236] text-white text-xs h-10 px-4 md:px-5 font-bold shadow-sm flex items-center justify-center shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            신규 원생 등록
          </Button>
        </div>

        {/* 4. 메인 대시보드 탭 분기 */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-[#86868B]">스마트 시트 정보 불러오는 중...</p>
          </div>
        ) : (
          <Tabs value={dashboardTab} onValueChange={setDashboardTab} className="w-full" id="student-list-section">
            <div className="admin-fit-row flex justify-between items-center border-b border-black/[0.05] pb-4 mb-4 gap-3 admin-mobile-wrap">
              <TabsList className="bg-white border border-black/[0.06] p-1 grid grid-cols-2 gap-1 h-auto min-w-0 w-full sm:w-auto rounded-full shadow-sm">
                <TabsTrigger 
                  value="cards" 
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <Users className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">원생별 학습 관리</span>
                  <span className="sm:hidden">원생 관리</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="db" 
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <SlidersHorizontal className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">교재/강의 진도 관리</span>
                  <span className="sm:hidden">교재/강의</span>
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                {quickFilter !== 'all' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setQuickFilter('all')}
                    className="admin-fit-button h-7 rounded-full border-black/[0.08] bg-white px-2 text-[10px]"
                  >
                    필터 해제
                  </Button>
                )}
                <span className="admin-fit-caption text-[#86868B] font-semibold">
                  {quickFilter === 'consultation' ? '상담 대상: ' : quickFilter === 'behind' ? '부족 진도: ' : '검색 결과: '}
                  {quickFilter === 'behind' ? filteredProgressItems.length : filteredStudents.length}
                  {quickFilter === 'behind' ? '건' : '명'}
                </span>
              </div>
            </div>

            {/* TAB CONTENT 1: 수강생별 대시보드 카드 */}
            <TabsContent value="cards" className="outline-none space-y-4">
              
              {/* 보기 모드 토글 (카드형 / 표형) */}
              <div className="flex justify-end items-center">
                <div className="flex bg-white border border-black/[0.06] p-0.5 rounded-lg shadow-sm">
                  <Button
                    size="sm"
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    onClick={() => setViewMode('grid')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                      viewMode === 'grid' 
                        ? 'bg-[#1D1D1F] text-white hover:bg-[#1D1D1F]/90 shadow-sm' 
                        : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                    카드형
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    onClick={() => setViewMode('table')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                      viewMode === 'table' 
                        ? 'bg-[#1D1D1F] text-white hover:bg-[#1D1D1F]/90 shadow-sm' 
                        : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5 mr-1" />
                    간략히 (표)
                  </Button>
                </div>
              </div>

              {filteredStudents.length === 0 ? (
                <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
                  검색 조건에 맞는 원생이 없습니다.
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {visibleStudents.map((student) => {
                    const totalItems = student.books.length + student.lectures.length;
                    const subjectSummaries = getStudentSubjectSummaries(student);
                    return (
                      <div
                        key={student.id}
                        onClick={() => {
                          setSelectedStudent(student);
                          setIsDetailOpen(true);
                        }}
                        className="admin-fit-box bg-white border border-black/[0.05] rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-[1px] cursor-pointer transition-all duration-300 flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="admin-fit-row flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="admin-fit-row flex items-center gap-1.5">
                                <h4 className="admin-fit-text admin-fit-title font-bold text-[#1D1D1F]">{student.name}</h4>
                                <Badge className={`admin-fit-button rounded-md text-[9px] px-1.5 py-0.5 border shrink-0 ${getCampusBadgeColor(student.campus)}`}>
                                  {getCampusLabel(student.campus)}
                                </Badge>
                              </div>
                              <p className="admin-fit-text admin-fit-caption text-[#86868B] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>{student.manager || '담당 코치'}</span>
                                <span className="w-1 h-1 rounded-full bg-[#86868B]/40"></span>
                                <span>{student.speedMultiplier ? `${student.speedMultiplier}배속` : '1.0배속'}</span>
                                {(() => {
                                  const todayMin = getStudentTodayTotalStudyTimeMin(student);
                                  if (todayMin <= 0) return null;
                                  const h = Math.floor(todayMin / 60);
                                  const m = Math.round(todayMin % 60);
                                  return (
                                    <>
                                      <span className="w-1 h-1 rounded-full bg-[#86868B]/40"></span>
                                      <span className="text-[#0071E3] font-bold">오늘 {h > 0 ? `${h}시간 ` : ''}{m}분 예상</span>
                                    </>
                                  );
                                })()}
                              </p>
                            </div>
                            <ChevronRight className="admin-fit-icon w-4 h-4 text-[#86868B]" />
                          </div>

                          {/* 과목별 현재 학습 흐름 */}
                          <div className="space-y-2.5 pt-2 border-t border-black/[0.03]">
                            {totalItems === 0 ? (
                              <p className="admin-fit-caption text-[#86868B] italic">진행 중인 교재/인강이 없습니다.</p>
                            ) : (
                              <div className="space-y-2">
                                {subjectSummaries.map((summary) => (
                                  <div key={summary.id} className="rounded-lg bg-[#F5F5F7]/70 p-2.5">
                                    <div className="admin-fit-row flex items-center justify-between gap-2">
                                      <span className="admin-fit-text admin-fit-caption font-black text-[#1D1D1F]">{summary.name}</span>
                                      <span className="admin-fit-caption text-[#86868B] shrink-0">
                                        {summary.periodStart ? `${summary.periodStart.substring(5, 10)}~` : ''}
                                        {summary.completedCount > 0 ? ` 완료 ${summary.completedCount}` : ' 진행중'}
                                      </span>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                      {summary.activeItems.length === 0 ? (
                                        <p className="admin-fit-caption text-emerald-600 font-bold">현재 진행 항목 없음 · 완료 정리 필요</p>
                                      ) : (
                                        summary.activeItems.map((item) => (
                                          <div key={item.id} className="space-y-1">
                                            <div className="admin-fit-row flex items-center justify-between gap-2">
                                              <span className="admin-fit-text admin-fit-caption font-semibold text-[#434345]">
                                                {item.type === 'book' ? '📚' : '💻'} {item.title}
                                              </span>
                                              <span className={`admin-fit-caption font-bold shrink-0 ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#862bf7]'}`}>
                                                현재 {item.current}/{item.total}{item.unit}
                                              </span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-black/[0.03]">
                                              <div
                                                className={`h-full rounded-full ${item.type === 'book' ? 'bg-[#0071E3]' : 'bg-[#862bf7]'}`}
                                                style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                                              />
                                            </div>
                                            <div className="admin-fit-row flex items-center justify-between gap-2">
                                              <span className="admin-fit-caption text-[#86868B] shrink-0">
                                                {item.startDate ? `${item.startDate.substring(5, 10)}~` : '기간 미정'}
                                                {item.targetDate ? item.targetDate.substring(5, 10) : '진행중'}
                                              </span>
                                              <span className={`admin-fit-caption font-bold shrink-0 ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#862bf7]'}`}>
                                                {item.percent}%
                                              </span>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                      {summary.completedItems.length > 0 && (
                                        <p className="admin-fit-text admin-fit-caption text-[#86868B]">
                                          완료: {summary.completedItems.map(item => item.title).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {totalItems > subjectSummaries.reduce((sum, summary) => sum + summary.activeItems.length + summary.completedCount, 0) && (
                                  <p className="admin-fit-text admin-fit-caption text-[#86868B] font-medium">추가 학습 항목이 더 있습니다.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 다음 상담일 정보 */}
                        <div className="admin-fit-row mt-4 pt-3.5 border-t border-black/[0.03] flex justify-between items-center gap-2">
                          <span className="admin-fit-caption text-[#86868B] shrink-0">다음 상담일</span>
                          {student.nextConsultationDate ? (
                            <span className={`admin-fit-text admin-fit-caption font-bold px-2 py-0.5 rounded-md ${student.nextConsultationDate <= todayStr ? 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse-slow' : 'bg-[#F5F5F7] text-[#1D1D1F]'}`}>
                              📅 {student.nextConsultationDate}
                            </span>
                          ) : (
                            <span className="admin-fit-text admin-fit-caption text-[#86868B] italic">상담일 미지정</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 표 뷰 (간략히) */
                <div className="bg-white border border-black/[0.05] rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-black/[0.08] bg-[#F5F5F7] text-[#86868B] font-bold">
                          <th className="p-3.5 pl-6">원생명</th>
                          <th className="p-3.5">캠퍼스</th>
                          <th className="p-3.5">담당 코치</th>
                          <th className="p-3.5">진행 중인 학습 (과목별 현황)</th>
                          <th className="p-3.5 text-center">다음 상담일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStudents.map((student) => {
                          const totalItems = student.books.length + student.lectures.length;
                          const subjectSummaries = getStudentSubjectSummaries(student);
                          return (
                            <tr
                              key={student.id}
                              onClick={() => {
                                setSelectedStudent(student);
                                setIsDetailOpen(true);
                              }}
                              className="border-b border-black/[0.04] hover:bg-black/[0.01] transition-colors align-middle cursor-pointer"
                            >
                              <td className="p-3.5 pl-6 font-bold text-[#1D1D1F]">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-[#86868B] shrink-0" />
                                  <span>{student.name}</span>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <Badge className={`rounded-md text-[9px] px-1.5 py-0.5 border shrink-0 ${getCampusBadgeColor(student.campus)}`}>
                                  {getCampusLabel(student.campus)}
                                </Badge>
                              </td>
                              <td className="p-3.5 text-[#434345]">
                                <div>{student.manager || '담당 코치'}</div>
                                <div className="text-[10px] text-[#86868B] mt-0.5 flex flex-wrap gap-1 items-center">
                                  <span className="bg-[#F5F5F7] px-1.5 py-0.5 rounded text-[9px] font-semibold">{student.speedMultiplier ? `${student.speedMultiplier}배속` : '1.0배속'}</span>
                                  {(() => {
                                    const todayMin = getStudentTodayTotalStudyTimeMin(student);
                                    if (todayMin <= 0) return null;
                                    const h = Math.floor(todayMin / 60);
                                    const m = Math.round(todayMin % 60);
                                    return (
                                      <span className="bg-[#0071E3]/10 text-[#0071E3] px-1.5 py-0.5 rounded text-[9px] font-bold">
                                        오늘 {h > 0 ? `${h}h ` : ''}{m}m
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="p-3.5 min-w-[280px]">
                                {totalItems === 0 ? (
                                  <span className="text-[#86868B] italic">진행 중인 교재/인강 없음</span>
                                ) : (
                                  <div className="space-y-1.5">
                                    {subjectSummaries.map((summary) => (
                                      <div key={summary.id} className="text-[11px] flex flex-wrap items-center gap-x-2">
                                        <span className="font-bold text-[#1D1D1F] bg-[#F5F5F7] px-1.5 py-0.5 rounded text-[10px]">{summary.name}</span>
                                        {summary.activeItems.length === 0 ? (
                                          <span className="text-emerald-600 font-bold">완료 정리 필요</span>
                                        ) : (
                                          summary.activeItems.map((item, idx) => (
                                            <span key={item.id} className="text-[#434345] inline-flex items-center gap-1">
                                              {idx > 0 && <span className="text-black/10">|</span>}
                                              <span className="text-[10px]">{item.type === 'book' ? '📚' : '💻'}</span>
                                              <span>{item.title}</span>
                                              <span className={`font-bold ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#862bf7]'}`}>
                                                ({item.current}/{item.total}{item.unit}, {item.percent}%)
                                              </span>
                                            </span>
                                          ))
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5 text-center">
                                {student.nextConsultationDate ? (
                                  <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] inline-block ${student.nextConsultationDate <= todayStr ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-[#F5F5F7] text-[#1D1D1F]'}`}>
                                    📅 {student.nextConsultationDate}
                                  </span>
                                ) : (
                                  <span className="text-[#86868B] italic">상담일 미지정</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 더 보기 (학생 목록) */}
              {filteredStudents.length > visibleStudents.length && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStudentLimit((n) => n + PAGE_SIZE)}
                    className="rounded-full border-black/[0.08] bg-white text-xs h-9 px-5 font-bold hover:bg-[#F5F5F7]"
                  >
                    더 보기 ({visibleStudents.length}/{filteredStudents.length})
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB CONTENT 2: 인강/교재 진도관리 전체 DB */}
            <TabsContent value="db" className="outline-none space-y-4">

              {/* 정렬 + 보기 모드 토글 */}
              <div className="flex flex-wrap justify-between items-center gap-2">
                {/* 정렬: 오늘 누구부터 챙길지 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] shrink-0">정렬</span>
                  <div className="flex bg-white border border-black/[0.06] p-0.5 rounded-lg shadow-sm">
                    {([
                      { key: 'shortage', label: '부족분 많은순' },
                      { key: 'status', label: '상태순' },
                      { key: 'name', label: '이름순' },
                    ] as const).map(opt => (
                      <Button
                        key={opt.key}
                        size="sm"
                        variant={progressSort === opt.key ? 'default' : 'ghost'}
                        onClick={() => setProgressSort(opt.key)}
                        className={`h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                          progressSort === opt.key
                            ? 'bg-[#1D1D1F] text-white hover:bg-[#1D1D1F]/90 shadow-sm'
                            : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                        }`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex bg-white border border-black/[0.06] p-0.5 rounded-lg shadow-sm">
                  <Button
                    size="sm"
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    onClick={() => setViewMode('grid')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[#1D1D1F] text-white hover:bg-[#1D1D1F]/90 shadow-sm'
                        : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                    카드형
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    onClick={() => setViewMode('table')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                      viewMode === 'table'
                        ? 'bg-[#1D1D1F] text-white hover:bg-[#1D1D1F]/90 shadow-sm'
                        : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5 mr-1" />
                    간략히 (표)
                  </Button>
                </div>
              </div>

              {filteredProgressItems.length === 0 ? (
                <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
                  데이터가 없습니다.
                </div>
              ) : viewMode === 'table' ? (
                <div id="progress-table-section" className="bg-white border border-black/[0.05] rounded-2xl overflow-hidden shadow-sm scroll-mt-28">
                  
                  {/* Notion Table Header */}
                  <div className="bg-[#1D1D1F] text-white p-4.5 flex justify-between items-center">
                    <h3 className="text-xs font-bold tracking-tight">교재/강의별 오늘 기준 진도 관리표</h3>
                    <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-wider">Managed Lines: {filteredProgressItems.length}</span>
                  </div>

                  {/* Table Layout */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-black/[0.08] bg-[#F5F5F7] text-[#86868B] font-bold">
                          <th className="p-3.5 pl-6">교재/강의</th>
                          <th className="p-3.5">수강생</th>
                          <th className="p-3.5 text-center">상태</th>
                          <th className="p-3.5 text-center">부족분</th>
                          <th className="p-3.5 text-center">오늘 기준 권장</th>
                          <th className="p-3.5 text-center">현재 (조절)</th>
                          <th className="p-3.5 pr-6 text-center">상담/목표</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProgressItems.map((item) => (
                          <tr key={`${item.studentId}_${item.itemId}`} className="border-b border-black/[0.04] hover:bg-black/[0.01] transition-colors align-middle">
                            
                            <td className="p-3.5 pl-6 font-bold text-[#1D1D1F] min-w-[240px]">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0">{item.type === 'book' ? '📚' : '💻'}</span>
                                <div className="min-w-0">
                                  <p className="truncate">{item.title}</p>
                                  <p className="text-[10px] text-[#86868B] mt-1">{item.subjectName} · 총 {item.total}{item.type === 'book' ? 'p' : '강'}</p>
                                </div>
                              </div>
                            </td>

                            {/* 수강생 이름 연결 링크 */}
                            <td className="p-3.5">
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const stud = students.find(s => s.id === item.studentId);
                                  if (stud) {
                                    setSelectedStudent(stud);
                                    setIsDetailOpen(true);
                                  }
                                }}
                                className="font-bold text-[#0071E3] hover:underline cursor-pointer flex items-center gap-1 w-fit"
                              >
                                <User className="w-3.5 h-3.5 shrink-0" />
                                {item.studentName}
                              </span>
                              <p className="text-[10px] text-[#86868B] mt-1">{getCampusLabel(item.campus)} · {item.manager || '담당자'}</p>
                            </td>

                            {/* 상태 — 의사결정 우선 컬럼(좌측 고정 배치) */}
                            <td className="p-3.5 text-center">
                              <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${getProgressStatusStyle(item.status)}`}>
                                {getProgressStatusLabel(item.status)}
                              </span>
                            </td>

                            {/* 부족분 */}
                            <td className={`p-3.5 text-center font-bold ${item.shortage && item.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {item.shortage === null ? '-' : item.shortage > 0 ? `${item.shortage}${item.type === 'book' ? 'p' : '강'}` : '없음'}
                            </td>

                            {/* 오늘 기준 권장 */}
                            <td className="p-3.5 text-center font-bold text-[#1D1D1F]">
                              {item.expectedToday === null ? '-' : `${item.expectedToday}${item.type === 'book' ? 'p' : '강'}`}
                            </td>

                            <td className="p-3.5 text-center">
                              <div className="min-w-[170px] space-y-2">
                                <div className="inline-flex items-center justify-center gap-1.5">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'dec');
                                    }}
                                    className="w-6.5 h-6.5 rounded-lg border-black/[0.08] bg-white hover:bg-[#F5F5F7] shrink-0"
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={item.total}
                                    value={progressDrafts[getProgressDraftKey(item.studentId, item.itemId)] ?? item.current}
                                    onChange={(e) => {
                                      const rawValue = Number(e.target.value);
                                      const nextValue = Math.min(item.total, Math.max(0, Number.isFinite(rawValue) ? rawValue : 0));
                                      setProgressDrafts(prev => ({
                                        ...prev,
                                        [getProgressDraftKey(item.studentId, item.itemId)]: nextValue,
                                      }));
                                    }}
                                    onBlur={() => {
                                      const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                      handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                        handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    className="h-7 w-16 rounded-lg border-black/[0.08] bg-white px-2 text-center text-xs font-bold"
                                  />
                                  <span className="text-[10px] font-bold text-[#86868B]">{item.type === 'book' ? 'p' : '강'}</span>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'inc');
                                    }}
                                    className="w-6.5 h-6.5 rounded-lg border-black/[0.08] bg-white hover:bg-[#F5F5F7] shrink-0"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </Button>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={item.total}
                                  value={progressDrafts[getProgressDraftKey(item.studentId, item.itemId)] ?? item.current}
                                  onChange={(e) => {
                                    setProgressDrafts(prev => ({
                                      ...prev,
                                      [getProgressDraftKey(item.studentId, item.itemId)]: Number(e.target.value),
                                    }));
                                  }}
                                  onMouseUp={() => {
                                    const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                    handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                                  }}
                                  onTouchEnd={() => {
                                    const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                    handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                                  }}
                                  className="h-2 w-full cursor-pointer accent-[#0071E3]"
                                />
                              </div>
                            </td>

                            {/* 상담/목표 */}
                            <td className="p-3.5 pr-6 text-center text-[#434345]">
                              <div className="space-y-1">
                                <p className="text-[10px]">상담 {item.daysToConsultation === null ? '-' : item.daysToConsultation < 0 ? `${Math.abs(item.daysToConsultation)}일 경과` : `${item.daysToConsultation}일 남음`}</p>
                                <p className="text-[10px] text-[#86868B]">목표 {item.targetDate || '-'}</p>
                              </div>
                            </td>

                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* 교재/강의 진도 카드형 뷰 */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {visibleProgressItems.map((item) => {
                    const progressPercent = item.total > 0 ? Math.round((item.current / item.total) * 100) : 0;
                    return (
                      <div
                        key={`${item.studentId}_${item.itemId}`}
                        className="bg-white border border-black/[0.05] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* 헤더 */}
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-[#86868B]">{item.subjectName}</span>
                              <h4 className="font-bold text-[#1D1D1F] truncate mt-0.5">
                                {item.type === 'book' ? '📚' : '💻'} {item.title}
                              </h4>
                            </div>
                            <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[9px] font-bold shrink-0 ${getProgressStatusStyle(item.status)}`}>
                              {getProgressStatusLabel(item.status)}
                            </span>
                          </div>

                          {/* 학생 정보 */}
                          <div className="pt-2 border-t border-black/[0.03] space-y-1">
                            <div className="flex items-center justify-between">
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const stud = students.find(s => s.id === item.studentId);
                                  if (stud) {
                                    setSelectedStudent(stud);
                                    setIsDetailOpen(true);
                                  }
                                }}
                                className="font-bold text-[#0071E3] hover:underline cursor-pointer flex items-center gap-1 text-[11px]"
                              >
                                <User className="w-3.5 h-3.5" />
                                {item.studentName}
                              </span>
                              <Badge className={`rounded-md text-[9px] px-1.5 py-0.5 border shrink-0 ${getCampusBadgeColor(item.campus)}`}>
                                {getCampusLabel(item.campus)}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-[#86868B]">담당: {item.manager || '담당자'}</p>
                          </div>

                          {/* 진도 상태 요약 */}
                          <div className="bg-[#F5F5F7] p-2.5 rounded-xl space-y-2">
                            <div className="flex justify-between items-center text-[10px] text-[#86868B]">
                              <span>오늘 기준 권장: <strong className="text-[#1D1D1F]">{item.expectedToday === null ? '-' : `${item.expectedToday}${item.type === 'book' ? 'p' : '강'}`}</strong></span>
                              <span>부족분: <strong className={item.shortage && item.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}>{item.shortage === null ? '-' : item.shortage > 0 ? `${item.shortage}${item.type === 'book' ? 'p' : '강'}` : '없음'}</strong></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-black/[0.03]">
                              <div
                                className={`h-full rounded-full ${item.type === 'book' ? 'bg-[#0071E3]' : 'bg-[#862bf7]'}`}
                                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-[#86868B]">
                              <span>진행도</span>
                              <span className="font-bold text-[#1D1D1F]">{progressPercent}%</span>
                            </div>
                          </div>

                          {/* 진도 조절 UI */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'dec')}
                                className="w-7 h-7 rounded-lg border-black/[0.08] bg-white hover:bg-[#F5F5F7] shrink-0"
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <div className="flex-1 flex items-center justify-center gap-1 bg-[#F5F5F7] rounded-lg h-7 px-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={item.total}
                                  value={progressDrafts[getProgressDraftKey(item.studentId, item.itemId)] ?? item.current}
                                  onChange={(e) => {
                                    const rawValue = Number(e.target.value);
                                    const nextValue = Math.min(item.total, Math.max(0, Number.isFinite(rawValue) ? rawValue : 0));
                                    setProgressDrafts(prev => ({
                                      ...prev,
                                      [getProgressDraftKey(item.studentId, item.itemId)]: nextValue,
                                    }));
                                  }}
                                  onBlur={() => {
                                    const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                    handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                      handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  className="h-5 w-12 border-none bg-transparent p-0 text-center text-xs font-bold focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                                <span className="text-[10px] font-bold text-[#86868B]">/ {item.total}{item.type === 'book' ? 'p' : '강'}</span>
                              </div>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'inc')}
                                className="w-7 h-7 rounded-lg border-black/[0.08] bg-white hover:bg-[#F5F5F7] shrink-0"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={item.total}
                              value={progressDrafts[getProgressDraftKey(item.studentId, item.itemId)] ?? item.current}
                              onChange={(e) => {
                                setProgressDrafts(prev => ({
                                  ...prev,
                                  [getProgressDraftKey(item.studentId, item.itemId)]: Number(e.target.value),
                                }));
                              }}
                              onMouseUp={() => {
                                const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                              }}
                              onTouchEnd={() => {
                                const draftKey = getProgressDraftKey(item.studentId, item.itemId);
                                handleQuickAdjustProgress(item.studentId, item.type, item.itemId, 'set', progressDrafts[draftKey] ?? item.current);
                              }}
                              className="h-2 w-full cursor-pointer accent-[#0071E3]"
                            />
                          </div>
                        </div>

                        {/* 상담 정보 */}
                        <div className="mt-4 pt-3 border-t border-black/[0.03] flex justify-between items-center text-[10px] text-[#86868B]">
                          <span>상담 {item.daysToConsultation === null ? '-' : item.daysToConsultation < 0 ? `${Math.abs(item.daysToConsultation)}일 경과` : `${item.daysToConsultation}일 남음`}</span>
                          <span>목표 {item.targetDate || '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 더 보기 (진도 항목) */}
              {filteredProgressItems.length > visibleProgressItems.length && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setProgressLimit((n) => n + PAGE_SIZE)}
                    className="rounded-full border-black/[0.08] bg-white text-xs h-9 px-5 font-bold hover:bg-[#F5F5F7]"
                  >
                    더 보기 ({visibleProgressItems.length}/{filteredProgressItems.length})
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

      </main>

      {/* 5. 신규 학생 추가 모달 */}
      <AddStudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newStudent) => {
          setStudents(prev => [newStudent, ...prev]);
        }}
        students={students}
      />

      {/* 6. 학생 상세 정보 시트 패널 */}
      <StudentDetailSheet
        student={selectedStudent}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedStudent(null);
        }}
        onUpdate={(updatedStudent) => {
          setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
          setSelectedStudent(updatedStudent);
        }}
        onDelete={(studentId) => {
          setStudents(prev => prev.filter(s => s.id !== studentId));
        }}
        students={students}
      />

    </div>
  );
}
