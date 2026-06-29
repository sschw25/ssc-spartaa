'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, User, Calendar, BarChart3, Search, Plus, Minus, LogOut, Loader2,
  AlertTriangle, ChevronRight, SlidersHorizontal, BookOpen,
  LayoutGrid, Table, RefreshCw, Monitor
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { getManagedProgressItems, getStudentTodayTotalStudyTimeMin } from '@/lib/progress-plan';
import { isWeeklyGradeMissing } from '@/lib/student-flags';
import { AddStudentModal } from '@/components/admin/add-student-modal';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { PendingChangeRequestsPanel } from '@/components/admin/pending-change-requests-panel';
import { ConsultationCalendar } from '@/components/admin/consultation-calendar';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const isCampusFilterValue = (value: string | null): value is string => !!value && CAMPUS_FILTERS.includes(value);

export default function AdminConsultationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">상담일지 로드 중...</p>
      </div>
    }>
      <ConsultationContent />
    </Suspense>
  );
}

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

const isStagnant24h = (s: Student) => {
  const lastUpdateStr = getStudentLastUpdate(s);
  const lastUpdate = lastUpdateStr ? new Date(lastUpdateStr) : new Date(s.createdAt);
  const hoursSinceUpdate = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
  return hoursSinceUpdate >= 24;
};

function ConsultationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openStudent, closeSheet, isSheetOpen } = useAdminGlobalSheet();

  const studentIdParam = searchParams.get('studentId');
  const focusParam = searchParams.get('focus');
  const actionParam = searchParams.get('action');
  const filterParam = searchParams.get('filter');

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // 검색 & 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [campusFilterStorageKey, setCampusFilterStorageKey] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'consultation' | 'behind' | 'stagnant' | 'missing_grade'>('all');
  const [dashboardTab, setDashboardTab] = useState('cards');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [progressSort, setProgressSort] = useState<'shortage' | 'status' | 'name'>('shortage');

  // 학생 목록 정렬 상태 추가
  const [studentSortField, setStudentSortField] = useState<'name' | 'campus' | 'manager'>('name');
  const [studentSortOrder, setStudentSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSortStudents = (field: 'name' | 'campus' | 'manager') => {
    if (studentSortField === field) {
      setStudentSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStudentSortField(field);
      setStudentSortOrder('asc');
    }
  };

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

  // 모달 제어 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // 1. 인증 체크
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        const json = await res.json();
        const userKey = json.userId || json.username || json.role || 'admin';
        const storageKey = `ssc-admin-dashboard-campus-filter:${userKey}`;
        const savedCampusFilter = window.localStorage.getItem(storageKey);
        if (isCampusFilterValue(savedCampusFilter)) {
          setCampusFilter(savedCampusFilter);
        }
        setCampusFilterStorageKey(storageKey);
        // 인증 성공 시 데이터 로드
        await loadStudents();
      } catch (err) {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router]);

  useEffect(() => {
    if (!campusFilterStorageKey) return;
    window.localStorage.setItem(campusFilterStorageKey, campusFilter);
  }, [campusFilter, campusFilterStorageKey]);

  // 2. 파라미터 처리
  useEffect(() => {
    if (filterParam) {
      if (filterParam === 'consultation') {
        setQuickFilter('consultation');
        setDashboardTab('cards');
      } else if (filterParam === 'behind') {
        setQuickFilter('behind');
        setDashboardTab('db');
      } else if (filterParam === 'stagnant') {
        setQuickFilter('stagnant');
        setDashboardTab('cards');
      } else if (filterParam === 'missing_grade') {
        setQuickFilter('missing_grade');
        setDashboardTab('cards');
      } else if (filterParam === 'all') {
        setQuickFilter('all');
      }
    }
  }, [filterParam]);

  useEffect(() => {
    if (focusParam === 'search') {
      handleFocusSearch();
    }
  }, [focusParam, loading]);

  useEffect(() => {
    if (actionParam === 'add') {
      setIsAddModalOpen(true);
    }
  }, [actionParam]);

  useEffect(() => {
    if (studentIdParam && students.length > 0) {
      const target = students.find((s) => s.id === studentIdParam);
      if (target) {
        handleOpenStudentDetail(target.id);
      }
    }
  }, [studentIdParam, students]);

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

  // 4. 로그아웃
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

  const handleCampusFilterChange = (campus: string) => {
    if (!isCampusFilterValue(campus)) return;
    setCampusFilter(campus);
  };

  const handleQuickFilterChange = (filter: 'all' | 'consultation' | 'behind' | 'stagnant' | 'missing_grade') => {
    setQuickFilter(filter);
  };

  const handleDashboardTabChange = (tab: string) => {
    setDashboardTab(tab);
  };

  const handleOpenStudentDetail = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    if (!target) return;
    openStudent(target, {
      defaultTab: 'info',
      onUpdate: (updated) => {
        setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s));
      },
      onDelete: (id) => {
        setStudents((prev) => prev.filter((s) => s.id !== id));
      },
      allStudents: students,
    });
  };

  const handleInlineStudentUpdate = async (
    student: Student,
    patch: Partial<Pick<Student, 'manager' | 'contact' | 'studentPhone' | 'parentPhone' | 'seatNumber'>>
  ) => {
    const normalizedPatch = { ...patch };
    if (normalizedPatch.seatNumber !== undefined && !Number.isFinite(Number(normalizedPatch.seatNumber))) {
      normalizedPatch.seatNumber = undefined;
    }

    const hasChange = Object.entries(normalizedPatch).some(([key, value]) => {
      const current = student[key as keyof Student];
      return String(current ?? '') !== String(value ?? '');
    });
    if (!hasChange) return;

    const previous = student;
    const updatedStudent: Student = {
      ...student,
      ...normalizedPatch,
      updatedAt: new Date().toISOString(),
    };

    setStudents((prev) => prev.map((item) => item.id === student.id ? updatedStudent : item));
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || '저장 실패');
      if (json.data) {
        setStudents((prev) => prev.map((item) => item.id === student.id ? json.data : item));
      }
      toast.success('원생 정보가 저장되었습니다.');
    } catch (error) {
      setStudents((prev) => prev.map((item) => item.id === student.id ? previous : item));
      toast.error(error instanceof Error ? error.message : '원생 정보 저장에 실패했습니다.');
    }
  };

  useEffect(() => {
    if (checkingAuth) return;

    const reloadVisibleDashboard = () => {
      if (document.visibilityState === 'visible') {
        loadStudents();
      }
    };

    window.addEventListener('focus', loadStudents);
    document.addEventListener('visibilitychange', reloadVisibleDashboard);
    return () => {
      window.removeEventListener('focus', loadStudents);
      document.removeEventListener('visibilitychange', reloadVisibleDashboard);
    };
  }, [checkingAuth]);

  const getProgressDraftKey = (studentId: string, itemId: string) => `${studentId}_${itemId}`;

  // 5. 진도율 테이블 퀵 조절용 API 호출
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

    if (debounceTimersRef.current[studentId]) {
      clearTimeout(debounceTimersRef.current[studentId]);
    }

    // 0.5초 디바운스 대기 후 서버에 최종 데이터 저장
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
          toast.error('진도 저장에 실패했습니다.');
          loadStudents(); // 실패 시 롤백
        }
      } catch (err) {
        toast.error('네트워크 오류로 진도 저장에 실패했습니다.');
        loadStudents();
      }
    }, 500);
  };

  // 데이터 가공 및 통계 계산
  const campusScopedStudents = students.filter(s => campusFilter === 'all' || s.campus === campusFilter);
  const selectedCampusLabel = campusFilter === 'all' ? '전체 캠퍼스' : getCampusLabel(campusFilter);
  
  // 오늘 상담이 예정되었거나 지난 학생들
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingConsultationStudents = campusScopedStudents.filter(s => {
    if (!s.nextConsultationDate) return false;
    return s.nextConsultationDate <= todayStr;
  });

  // 진도 관리 항목 단일 소스 (과목 기반)
  const allProgressItems = getManagedProgressItems(campusScopedStudents);

  function getCampusLabel(val: string) {
    switch(val) {
      case 'wonju': return '원주';
      case 'chuncheon': return '춘천';
      case 'chungju': return '충주';
      default: return '기타';
    }
  }

  // 캠퍼스는 분류(식별)용이라 의미색(초록=양호/파랑=정보)과 분리해 중립 스타일로 통일.
  // 식별은 뱃지 텍스트(원주/춘천/충주)가 담당하며, 앱 전반의 캠퍼스 표기(회색)와도 일치.
  const getCampusBadgeColor = (_val: string) => 'bg-[#F5F5F7] text-[#86868B] border-black/[0.06]';

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

  // 5대 퀵 필터용 실시간 카운트 집계
  const stagnantCount = campusScopedStudents.filter(s => isStagnant24h(s)).length;
  const behindCount = campusScopedStudents.filter(s => {
    const items = allProgressItems.filter(item => item.studentId === s.id);
    return items.some(item => item.status === 'behind');
  }).length;
  const missingGradeCount = campusScopedStudents.filter(s => isWeeklyGradeMissing(s)).length;
  const consultationCount = pendingConsultationStudents.length;

  // 검색 및 필터링된 학생 목록
  const filteredStudents = campusScopedStudents.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesQuickFilter = true;
    if (quickFilter === 'consultation') {
      matchesQuickFilter = pendingConsultationStudents.some(target => target.id === s.id);
    } else if (quickFilter === 'behind') {
      const studentProgressItems = allProgressItems.filter(item => item.studentId === s.id);
      matchesQuickFilter = studentProgressItems.some(item => item.status === 'behind');
    } else if (quickFilter === 'stagnant') {
      matchesQuickFilter = isStagnant24h(s);
    } else if (quickFilter === 'missing_grade') {
      matchesQuickFilter = isWeeklyGradeMissing(s);
    }
    
    return matchesSearch && matchesQuickFilter;
  });

  // 정렬된 학생 목록
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let valA = '';
    let valB = '';
      
    if (studentSortField === 'name') {
      valA = a.name || '';
      valB = b.name || '';
    } else if (studentSortField === 'campus') {
      valA = a.campus || '';
      valB = b.campus || '';
    } else if (studentSortField === 'manager') {
      valA = a.manager || '';
      valB = b.manager || '';
    }

    const comparison = valA.localeCompare(valB, 'ko');
    return studentSortOrder === 'asc' ? comparison : -comparison;
  });

  // 상태 우선순위 (부족 → 진행중 → 충족 → 계획없음)
  const statusRank: Record<string, number> = { behind: 0, 'on-track': 1, ahead: 2, 'no-plan': 3 };

  // 필터링 + 정렬된 전체 교재 진도 아이템
  const filteredProgressItems = allProgressItems
    .filter(item => {
      const matchesSearch = item.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.title.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesQuickFilter = true;
      if (quickFilter === 'behind') {
        matchesQuickFilter = item.status === 'behind';
      } else if (quickFilter === 'consultation') {
        matchesQuickFilter = pendingConsultationStudents.some(target => target.id === item.studentId);
      } else if (quickFilter === 'stagnant') {
        const student = campusScopedStudents.find(s => s.id === item.studentId);
        matchesQuickFilter = student ? isStagnant24h(student) : false;
      } else if (quickFilter === 'missing_grade') {
        const student = campusScopedStudents.find(s => s.id === item.studentId);
        matchesQuickFilter = student ? isWeeklyGradeMissing(student) : false;
      }
      
      return matchesSearch && matchesQuickFilter;
    })
    .sort((a, b) => {
      if (progressSort === 'name') {
        return a.studentName.localeCompare(b.studentName, 'ko');
      }
      if (progressSort === 'status') {
        return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
               (b.shortage ?? -1) - (a.shortage ?? -1);
      }
      return (b.shortage ?? -1) - (a.shortage ?? -1) ||
             (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    });

  const visibleStudents = sortedStudents.slice(0, studentLimit);
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

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-[#1D1D1F] font-sans selection:bg-black/10">
      
      {/* Navbar */}
      <AdminTopNav
        title="상담일지 및 진도 관리"
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : getCampusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={handleCampusFilterChange}
        onStudentSearch={handleFocusSearch}
        onStudentAdd={() => setIsAddModalOpen(true)}
        onLogout={handleLogout}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFocusSearch}
              className="admin-fit-button rounded-2xl border-black/[0.05] hover:bg-[#F5F5F7] text-xs h-9.5 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
              title="검색"
            >
              <Search className="w-4 h-4 md:mr-1.5 text-[#86868B]" />
              <span className="hidden md:inline font-bold">검색</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadStudents}
              className="admin-fit-button rounded-2xl border-black/[0.05] hover:bg-[#F5F5F7] text-xs h-9.5 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 md:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline font-bold">새로고침</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              className="admin-fit-button text-red-600 hover:text-red-700 hover:bg-red-50 rounded-2xl text-xs h-9.5 px-3 transition-premium"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4 mr-1.5 text-red-500" />
              <span className="hidden sm:inline font-bold">로그아웃</span>
            </Button>
          </>
        }
      />

      <main className="max-w-7xl mx-auto p-4 md:p-8 pb-28 space-y-6">

        {/* 필터 및 검색 바 */}
        <div className="admin-fit-box flex flex-col gap-3.5 bg-white p-5 rounded-3xl border border-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <div className="relative flex-1 max-w-md admin-mobile-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
              <Input
                ref={searchInputRef}
                placeholder="수강생 이름 또는 교재명을 입력해 주세요."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-2xl border-transparent text-[13px] h-11 bg-black/[0.04]"
              />
            </div>

            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="admin-fit-button rounded-xl bg-[#1D1D1F] hover:bg-[#323236] text-white text-xs h-10 px-4 md:px-5 font-bold shadow-sm flex items-center justify-center shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              신규 원생 등록
            </Button>
          </div>

          <div className="h-px bg-black/[0.04] my-0.5" />

          {/* 필터 선택 영역 (캠퍼스 필터 + 퀵 필터) */}
          <div className="flex flex-wrap items-center gap-5 text-xs">
            {/* 캠퍼스(센터) 필터 */}
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-[#86868B] shrink-0">캠퍼스</span>
              <div className="glass-capsule flex items-center p-1 rounded-full shrink-0">
                {CAMPUS_FILTERS.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={campusFilter === c ? 'default' : 'ghost'}
                    onClick={() => handleCampusFilterChange(c)}
                    className={`h-7.5 rounded-lg px-3 text-[11px] font-bold transition-premium ${
                      campusFilter === c 
                        ? 'bg-white hover:bg-white text-black shadow-sm' 
                        : 'text-[#86868B] hover:text-black'
                    }`}
                  >
                    {c === 'all' ? '전체' : getCampusLabel(c)}
                  </Button>
                ))}
              </div>
            </div>

            {/* 퀵 필터 (상담/진도/정체/미입력) */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-extrabold text-[#86868B] shrink-0">상태 필터</span>
              <div className="glass-capsule flex flex-wrap items-center p-1 rounded-2xl gap-0.5">
                <Button
                  variant={quickFilter === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('all')}
                  className={`h-7.5 rounded-lg px-3 text-[11px] font-bold transition-premium ${
                    quickFilter === 'all' ? 'bg-white hover:bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'
                  }`}
                >
                  전체
                </Button>
                
                <Button
                  variant={quickFilter === 'stagnant' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('stagnant')}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold transition-premium ${
                    quickFilter === 'stagnant' 
                      ? 'bg-red-50 hover:bg-red-50 text-red-600 shadow-sm border border-red-100' 
                      : 'text-[#86868B] hover:text-red-500 hover:bg-red-50/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 inline-block" />
                  진도 정체 {stagnantCount > 0 && <span className="ml-0.5 bg-red-500/15 text-red-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">{stagnantCount}</span>}
                </Button>
                
                <Button
                  variant={quickFilter === 'behind' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('behind')}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold transition-premium ${
                    quickFilter === 'behind' 
                      ? 'bg-orange-50 hover:bg-orange-50 text-orange-600 shadow-sm border border-orange-100' 
                      : 'text-[#86868B] hover:text-orange-500 hover:bg-orange-50/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5 inline-block" />
                  진도 지연 {behindCount > 0 && <span className="ml-0.5 bg-orange-500/15 text-orange-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">{behindCount}</span>}
                </Button>

                <Button
                  variant={quickFilter === 'missing_grade' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('missing_grade')}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold transition-premium ${
                    quickFilter === 'missing_grade' 
                      ? 'bg-amber-50 hover:bg-amber-50 text-amber-600 shadow-sm border border-amber-100' 
                      : 'text-[#86868B] hover:text-amber-600 hover:bg-amber-50/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 inline-block" />
                  성적 미입력 {missingGradeCount > 0 && <span className="ml-0.5 bg-amber-500/15 text-amber-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">{missingGradeCount}</span>}
                </Button>

                <Button
                  variant={quickFilter === 'consultation' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('consultation')}
                  className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold transition-premium ${
                    quickFilter === 'consultation' 
                      ? 'bg-blue-50 hover:bg-blue-50 text-[#0071E3] shadow-sm border border-blue-100' 
                      : 'text-[#86868B] hover:text-[#0071E3] hover:bg-blue-50/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] mr-1.5 inline-block" />
                  상담 대상 {consultationCount > 0 && <span className="ml-0.5 bg-[#0071E3]/15 text-[#0071E3] rounded-full px-1.5 py-0.5 text-[10px] font-semibold">{consultationCount}</span>}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 메인 대시보드 탭 분기 */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-[#86868B]">스마트 시트 정보 불러오는 중...</p>
          </div>
        ) : (
          <Tabs value={dashboardTab} onValueChange={handleDashboardTabChange} className="w-full" id="student-list-section">
            <div className="admin-fit-row flex justify-between items-center border-b border-black/[0.05] pb-4 mb-4 gap-3 admin-mobile-wrap">
              <TabsList className="bg-white border border-black/[0.06] p-1 grid grid-cols-3 gap-1 h-auto min-w-0 w-full sm:w-auto rounded-full shadow-sm">
                <TabsTrigger
                  value="cards"
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <Users className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">원생별 학습 관리</span>
                  <span className="sm:hidden">원생</span>
                </TabsTrigger>
                <TabsTrigger
                  value="db"
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <SlidersHorizontal className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">교재/강의 진도 관리</span>
                  <span className="sm:hidden">진도</span>
                </TabsTrigger>
                <TabsTrigger
                  value="calendar"
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <Calendar className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">상담 캘린더</span>
                  <span className="sm:hidden">캘린더</span>
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
                  {quickFilter === 'consultation' ? '상담 대상: ' :
                   quickFilter === 'behind' ? '진도 지연: ' :
                   quickFilter === 'stagnant' ? '진도 정체: ' :
                   quickFilter === 'missing_grade' ? '성적 미입력: ' : '검색 결과: '}
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
                        onClick={() => handleOpenStudentDetail(student.id)}
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
                                                {item.type === 'book' ? <BookOpen className="inline-block w-3.5 h-3.5 align-[-2px]" /> : <Monitor className="inline-block w-3.5 h-3.5 align-[-2px]" />} {item.title}
                                              </span>
                                              <span className={`admin-fit-caption font-bold shrink-0 ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#0071E3]'}`}>
                                                현재 {item.current}/{item.total}{item.unit}
                                              </span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-black/[0.03]">
                                              <div
                                                className={`h-full rounded-full ${item.type === 'book' ? 'bg-[#0071E3]' : 'bg-[#0071E3]'}`}
                                                style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                                              />
                                            </div>
                                            <div className="admin-fit-row flex items-center justify-between gap-2">
                                              <span className="admin-fit-caption text-[#86868B] shrink-0">
                                                {item.startDate ? `${item.startDate.substring(5, 10)}~` : '기간 미정'}
                                                {item.targetDate ? item.targetDate.substring(5, 10) : '진행중'}
                                              </span>
                                              <span className={`admin-fit-caption font-bold shrink-0 ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#0071E3]'}`}>
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
                            <span className={`admin-fit-text admin-fit-caption font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${student.nextConsultationDate <= todayStr ? 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse-slow' : 'bg-[#F5F5F7] text-[#1D1D1F]'}`}>
                              <Calendar className="h-3 w-3" aria-hidden="true" />
                              {student.nextConsultationDate}
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
                    <table className="min-w-[1120px] w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-black/[0.08] bg-[#F5F5F7] text-[#86868B] font-bold">
                          <th 
                            className="p-3.5 pl-6 cursor-pointer hover:bg-black/[0.03] transition-colors select-none"
                            onClick={() => handleSortStudents('name')}
                          >
                            <div className="flex items-center gap-1">
                              원생명 {studentSortField === 'name' && (studentSortOrder === 'asc' ? '▲' : '▼')}
                            </div>
                          </th>
                          <th 
                            className="p-3.5 cursor-pointer hover:bg-black/[0.03] transition-colors select-none"
                            onClick={() => handleSortStudents('campus')}
                          >
                            <div className="flex items-center gap-1">
                              캠퍼스 {studentSortField === 'campus' && (studentSortOrder === 'asc' ? '▲' : '▼')}
                            </div>
                          </th>
                          <th 
                            className="p-3.5 cursor-pointer hover:bg-black/[0.03] transition-colors select-none"
                            onClick={() => handleSortStudents('manager')}
                          >
                            <div className="flex items-center gap-1">
                              담당 코치 {studentSortField === 'manager' && (studentSortOrder === 'asc' ? '▲' : '▼')}
                            </div>
                          </th>
                          <th className="p-3.5 text-center">좌석</th>
                          <th className="p-3.5">목표시험</th>
                          <th className="p-3.5">연락처</th>
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
                              onClick={() => handleOpenStudentDetail(student.id)}
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
                              <td className="p-3.5 text-[#434345]" onClick={(e) => e.stopPropagation()}>
                                <input
                                  defaultValue={student.manager || ''}
                                  placeholder="담당 코치"
                                  onBlur={(event) => handleInlineStudentUpdate(student, { manager: event.currentTarget.value.trim() })}
                                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                  className="h-8 w-full rounded-lg border border-black/[0.06] bg-white px-2 text-[11px] font-semibold text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
                                />
                                <div className="text-[10px] text-[#86868B] mt-0.5 flex flex-wrap gap-1 items-center">
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
                              <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min={0}
                                  defaultValue={student.seatNumber ?? ''}
                                  placeholder="-"
                                  onBlur={(event) => {
                                    const value = event.currentTarget.value.trim();
                                    handleInlineStudentUpdate(student, { seatNumber: value ? Number(value) : undefined });
                                  }}
                                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                  className="h-8 w-16 rounded-lg border border-black/[0.06] bg-white px-2 text-center text-[11px] font-semibold text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
                                />
                              </td>
                              <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  defaultValue={student.contact || ''}
                                  placeholder="목표시험"
                                  onBlur={(event) => handleInlineStudentUpdate(student, { contact: event.currentTarget.value.trim() })}
                                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                  className="h-8 w-full rounded-lg border border-black/[0.06] bg-white px-2 text-[11px] font-semibold text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
                                />
                              </td>
                              <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                                <div className="grid grid-cols-1 gap-1.5">
                                  <input
                                    defaultValue={student.studentPhone || ''}
                                    placeholder="본인전화"
                                    onBlur={(event) => handleInlineStudentUpdate(student, { studentPhone: event.currentTarget.value.trim() })}
                                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                    className="h-8 w-full rounded-lg border border-black/[0.06] bg-white px-2 text-[11px] font-semibold text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
                                  />
                                  <input
                                    defaultValue={student.parentPhone || ''}
                                    placeholder="부모전화"
                                    onBlur={(event) => handleInlineStudentUpdate(student, { parentPhone: event.currentTarget.value.trim() })}
                                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                    className="h-8 w-full rounded-lg border border-black/[0.06] bg-white px-2 text-[11px] font-semibold text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
                                  />
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
                                              <span className="text-[10px]">{item.type === 'book' ? <BookOpen className="inline-block w-3.5 h-3.5 align-[-2px]" /> : <Monitor className="inline-block w-3.5 h-3.5 align-[-2px]" />}</span>
                                              <span>{item.title}</span>
                                              <span className={`font-bold ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#0071E3]'}`}>
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
                                  <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] inline-flex items-center gap-1 ${student.nextConsultationDate <= todayStr ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-[#F5F5F7] text-[#1D1D1F]'}`}>
                                    <Calendar className="h-3 w-3" aria-hidden="true" />
                                    {student.nextConsultationDate}
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
                  
                  <div className="bg-[#1D1D1F] text-white p-4.5 flex justify-between items-center">
                    <h3 className="text-xs font-bold tracking-tight">교재/강의별 오늘 기준 진도 관리표</h3>
                    <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-wider">Managed Lines: {filteredProgressItems.length}</span>
                  </div>

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
                                <span className="shrink-0">{item.type === 'book' ? <BookOpen className="inline-block w-3.5 h-3.5 align-[-2px]" /> : <Monitor className="inline-block w-3.5 h-3.5 align-[-2px]" />}</span>
                                <div className="min-w-0">
                                  <p className="truncate">{item.title}</p>
                                  <p className="text-[10px] text-[#86868B] mt-1">{item.subjectName} · 총 {item.total}{item.type === 'book' ? 'p' : '강'}</p>
                                </div>
                              </div>
                            </td>

                            <td className="p-3.5">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenStudentDetail(item.studentId);
                                }}
                                className="font-bold text-[#0071E3] hover:underline cursor-pointer flex items-center gap-1 w-fit"
                              >
                                <User className="w-3.5 h-3.5 shrink-0" />
                                {item.studentName}
                              </span>
                              <p className="text-[10px] text-[#86868B] mt-1">{getCampusLabel(item.campus)} · {item.manager || '담당자'}</p>
                            </td>

                            <td className="p-3.5 text-center">
                              <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${getProgressStatusStyle(item.status)}`}>
                                {getProgressStatusLabel(item.status)}
                              </span>
                            </td>

                            <td className={`p-3.5 text-center font-bold ${item.shortage && item.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {item.shortage === null ? '-' : item.shortage > 0 ? `${item.shortage}${item.type === 'book' ? 'p' : '강'}` : '없음'}
                            </td>

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
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-[#86868B]">{item.subjectName}</span>
                              <h4 className="font-bold text-[#1D1D1F] truncate mt-0.5">
                                {item.type === 'book' ? <BookOpen className="inline-block w-3.5 h-3.5 align-[-2px]" /> : <Monitor className="inline-block w-3.5 h-3.5 align-[-2px]" />} {item.title}
                              </h4>
                            </div>
                            <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[9px] font-bold shrink-0 ${getProgressStatusStyle(item.status)}`}>
                              {getProgressStatusLabel(item.status)}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-black/[0.03] space-y-1">
                            <div className="flex items-center justify-between">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenStudentDetail(item.studentId);
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

                          <div className="bg-[#F5F5F7] p-2.5 rounded-xl space-y-2">
                            <div className="flex justify-between items-center text-[10px] text-[#86868B]">
                              <span>오늘 기준 권장: <strong className="text-[#1D1D1F]">{item.expectedToday === null ? '-' : `${item.expectedToday}${item.type === 'book' ? 'p' : '강'}`}</strong></span>
                              <span>부족분: <strong className={item.shortage && item.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}>{item.shortage === null ? '-' : item.shortage > 0 ? `${item.shortage}${item.type === 'book' ? 'p' : '강'}` : '없음'}</strong></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-black/[0.03]">
                              <div
                                className={`h-full rounded-full ${item.type === 'book' ? 'bg-[#0071E3]' : 'bg-[#0071E3]'}`}
                                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-[#86868B]">
                              <span>진행도</span>
                              <span className="font-bold text-[#1D1D1F]">{progressPercent}%</span>
                            </div>
                          </div>

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

            {/* TAB CONTENT 3: 상담 캘린더 */}
            <TabsContent value="calendar" className="outline-none">
              <ConsultationCalendar
                students={campusScopedStudents}
                onOpenStudent={handleOpenStudentDetail}
              />
            </TabsContent>

          </Tabs>
        )}

      </main>

      {/* 신규 학생 추가 모달 */}
      <AddStudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newStudent) => {
          setStudents(prev => [newStudent, ...prev]);
        }}
        students={students}
      />

    </div>
  );
}
