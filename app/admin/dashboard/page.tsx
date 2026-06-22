'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, User, Calendar, BarChart3, Search, LogOut, Loader2,
  AlertTriangle, BookOpen, ClipboardList, X, Play, RefreshCw, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { getManagedProgressItems } from '@/lib/progress-plan';
import { isWeeklyGradeMissing } from '@/lib/student-flags';
import { TodayAttendanceWidget } from '@/components/admin/today-attendance-widget';
import { AdminLeaderboard } from '@/components/admin/admin-leaderboard';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { PendingChangeRequestsPanel } from '@/components/admin/pending-change-requests-panel';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const isCampusFilterValue = (value: string | null): value is string => !!value && CAMPUS_FILTERS.includes(value);

export default function AdminDashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // 캠퍼스 필터 상태
  const [campusFilter, setCampusFilter] = useState('all');
  const [campusFilterStorageKey, setCampusFilterStorageKey] = useState('');

  // 모달 제어 상태
  const [analysisTarget, setAnalysisTarget] = useState<{ type: 'subject' | 'book'; name: string } | null>(null);
  // 출결 위젯 새로고침 신호
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);

  // 관리자 ID 및 요약 카드 마지막 조회 시각 상태
  const [adminId, setAdminId] = useState('admin');
  const [viewedTimes, setViewedTimes] = useState<Record<string, string>>({});

  const handleOpenStudentById = (id: string) => {
    router.push(`/admin/consultation?studentId=${id}`);
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
        const json = await res.json();
        const userKey = json.userId || json.username || json.role || 'admin';
        setAdminId(userKey);
        const storageKey = `ssc-admin-dashboard-campus-filter:${userKey}`;
        const savedCampusFilter = window.localStorage.getItem(storageKey);
        if (isCampusFilterValue(savedCampusFilter)) {
          setCampusFilter(savedCampusFilter);
        }
        setCampusFilterStorageKey(storageKey);
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

  useEffect(() => {
    if (!campusFilterStorageKey) return;
    window.localStorage.setItem(campusFilterStorageKey, campusFilter);
  }, [campusFilter, campusFilterStorageKey]);

  // adminId가 설정된 후 viewedTimes 초기 로드
  useEffect(() => {
    if (!adminId) return;
    const keys = ['consultation', 'students', 'grades', 'progress'];
    const times: Record<string, string> = {};
    keys.forEach(key => {
      const saved = window.localStorage.getItem(`ssc-dashboard-view:${adminId}:${key}`);
      if (saved) {
        times[key] = saved;
      }
    });
    setViewedTimes(times);
  }, [adminId]);

  // 요약 카드 클릭 시 조회 시각 업데이트 헬퍼 함수
  const handleCardClick = (cardKey: string) => {
    const now = new Date().toISOString();
    window.localStorage.setItem(`ssc-dashboard-view:${adminId}:${cardKey}`, now);
    setViewedTimes(prev => ({ ...prev, [cardKey]: now }));
  };

  // 2. 학생 데이터 로드
  const loadStudents = async () => {
    setLoading(true);
    setAttendanceRefresh((n) => n + 1);
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
    router.push('/admin/consultation?focus=search');
  };

  const handleCampusFilterChange = (campus: string) => {
    if (!isCampusFilterValue(campus)) return;
    setCampusFilter(campus);
  };

  const handleShowAllStudents = () => {
    router.push('/admin/consultation?filter=all');
  };

  const handleShowConsultationStudents = () => {
    router.push('/admin/consultation?filter=consultation');
  };

  const handleShowBehindMaterials = () => {
    router.push('/admin/consultation?filter=behind');
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

  // 데이터 가공 및 통계 계산
  const campusScopedStudents = students.filter(s => campusFilter === 'all' || s.campus === campusFilter);
  const totalStudentsCount = campusScopedStudents.length;
  const selectedCampusLabel = campusFilter === 'all' ? '전체 캠퍼스' : getCampusLabel(campusFilter);
  
  // 오늘 상담이 예정되었거나 지난 학생들
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingConsultationStudents = campusScopedStudents.filter(s => {
    if (!s.nextConsultationDate) return false;
    return s.nextConsultationDate <= todayStr;
  });

  // 매주 성적 입력 대상인데 이번 주(월~일) 성적이 아직 없는 학생들
  const weeklyGradeMissingStudents = campusScopedStudents.filter(s => isWeeklyGradeMissing(s));

  // 각 카드 데이터 최종 업데이트 시각 계산
  const lastConsultationUpdate = pendingConsultationStudents.reduce((max, s) => s.updatedAt > max ? s.updatedAt : max, '');
  const lastStudentUpdate = campusScopedStudents.reduce((max, s) => s.updatedAt > max ? s.updatedAt : max, '');
  const lastGradeUpdate = weeklyGradeMissingStudents.reduce((max, s) => s.updatedAt > max ? s.updatedAt : max, '');
  
  const getLastProgressUpdate = () => {
    let max = '';
    campusScopedStudents.forEach(s => {
      s.books.forEach(b => { if (b.updatedAt > max) max = b.updatedAt; });
      s.lectures.forEach(l => { if (l.updatedAt > max) max = l.updatedAt; });
    });
    return max;
  };
  const lastProgressUpdate = getLastProgressUpdate();

  const shouldShowDot = (cardKey: string, lastUpdateTime: string) => {
    if (!lastUpdateTime) return false;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const midnightIso = midnight.toISOString();
    
    // 조건 1: 마지막 업데이트가 오늘 자정 이후여야 함
    if (lastUpdateTime < midnightIso) return false;
    
    // 조건 2: 사용자가 해당 카드를 마지막으로 조회한 시각이 마지막 업데이트 시각보다 이전이어야 함
    const viewedTime = viewedTimes[cardKey];
    if (!viewedTime) return true;
    
    return viewedTime < lastUpdateTime;
  };

  // 진도 관리 항목 단일 소스 (과목 기반). 평균/필터/테이블이 모두 이 값을 공유한다.
  const allProgressItems = getManagedProgressItems(campusScopedStudents);

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
  const activeProgressItems = allProgressItems.filter(item => item.total > 0 && item.current < item.total);

  type PopularStudyRank = {
    key: string;
    label: string;
    meta?: string;
    studentCount: number;
    itemCount: number;
    averageProgress: number;
  };

  const buildPopularRanks = (
    items: typeof activeProgressItems,
    keyOf: (item: typeof activeProgressItems[number]) => string,
    labelOf: (item: typeof activeProgressItems[number]) => string,
    metaOf?: (item: typeof activeProgressItems[number]) => string
  ): PopularStudyRank[] => {
    const groups = new Map<string, {
      label: string;
      meta?: string;
      students: Set<string>;
      itemCount: number;
      progressTotal: number;
    }>();

    items.forEach((item) => {
      const key = keyOf(item).trim() || '기타';
      const existing = groups.get(key) || {
        label: labelOf(item).trim() || '기타',
        meta: metaOf?.(item),
        students: new Set<string>(),
        itemCount: 0,
        progressTotal: 0,
      };
      existing.students.add(item.studentId);
      existing.itemCount += 1;
      existing.progressTotal += Math.round((item.current / item.total) * 100);
      groups.set(key, existing);
    });

    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        label: group.label,
        meta: group.meta,
        studentCount: group.students.size,
        itemCount: group.itemCount,
        averageProgress: group.itemCount > 0 ? Math.round(group.progressTotal / group.itemCount) : 0,
      }))
      .sort((a, b) => b.studentCount - a.studentCount || b.itemCount - a.itemCount || b.averageProgress - a.averageProgress || a.label.localeCompare(b.label, 'ko'))
      .slice(0, 5);
  };

  const popularSubjectRanks = buildPopularRanks(
    activeProgressItems.filter(item => item.type === 'book'),
    (item) => item.subjectName,
    (item) => item.subjectName
  );
  const popularBookRanks = buildPopularRanks(
    activeProgressItems.filter(item => item.type === 'book'),
    (item) => item.title,
    (item) => item.title,
    (item) => item.subjectName
  );
  const popularLectureSubjectRanks = buildPopularRanks(
    activeProgressItems.filter(item => item.type === 'lecture'),
    (item) => item.subjectName,
    (item) => item.subjectName
  );
  const popularLectureRanks = buildPopularRanks(
    activeProgressItems.filter(item => item.type === 'lecture'),
    (item) => item.title,
    (item) => item.title,
    (item) => item.subjectName
  );

  // 과목/교재 상세 분석 데이터 연산
  const getAnalysisData = () => {
    if (!analysisTarget) return null;
    const { type, name } = analysisTarget;

    if (type === 'subject') {
      const subjectItems = allProgressItems.filter(
        (item) => item.subjectName.trim() === name.trim()
      );
      const studentIds = Array.from(new Set(subjectItems.map((item) => item.studentId)));
      const filteredStudentsForSubject = campusScopedStudents.filter((s) => studentIds.includes(s.id));

      const validItems = subjectItems.filter((item) => item.total > 0);
      const avgProgress = validItems.length > 0
        ? Math.round(validItems.reduce((acc, item) => acc + (item.current / item.total) * 100, 0) / validItems.length)
        : 0;

      let totalDays = 0;
      let daysCount = 0;
      let totalDailyAmount = 0;
      let dailyAmountCount = 0;
      let unitLabel = '페이지';

      filteredStudentsForSubject.forEach((s) => {
        const sub = s.subjects?.find((sub) => sub.name === name);
        const books = sub ? sub.books : (name === '기본' ? s.books : []);
        const lectures = sub ? sub.lectures : (name === '기본' ? s.lectures : []);

        books.forEach((b) => {
          if (b.targetDate && s.createdAt) {
            const start = new Date(s.createdAt);
            const end = new Date(b.targetDate);
            const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > 0) {
              totalDays += diff;
              daysCount++;
            }
          }
          if (b.unit) unitLabel = b.unit;
          if (b.detailedPlans && b.detailedPlans.length > 0) {
            b.detailedPlans.forEach((p) => {
              if (p.dailyAmount) {
                totalDailyAmount += p.dailyAmount;
                dailyAmountCount++;
              }
            });
          }
        });

        lectures.forEach((l) => {
          if (l.targetDate && s.createdAt) {
            const start = new Date(s.createdAt);
            const end = new Date(l.targetDate);
            const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > 0) {
              totalDays += diff;
              daysCount++;
            }
          }
          if (l.detailedPlans && l.detailedPlans.length > 0) {
            l.detailedPlans.forEach((p) => {
              if (p.dailyAmount) {
                totalDailyAmount += p.dailyAmount;
                dailyAmountCount++;
              }
            });
          }
        });
      });

      const avgDays = daysCount > 0 ? Math.round(totalDays / daysCount) : 0;
      const avgDailyAmount = dailyAmountCount > 0 ? (totalDailyAmount / dailyAmountCount).toFixed(1) : '0';

      const goals: Array<{ studentName: string; text: string }> = [];
      filteredStudentsForSubject.forEach((s) => {
        const sub = s.subjects?.find((sub) => sub.name === name);
        if (sub?.learningGoal) {
          goals.push({ studentName: s.name, text: sub.learningGoal });
        }
        const books = sub ? sub.books : (name === '기본' ? s.books : []);
        books.forEach((b) => {
          if (b.goalDescription) {
            goals.push({ studentName: s.name, text: `[${b.title}] ${b.goalDescription}` });
          }
        });
        const lectures = sub ? sub.lectures : (name === '기본' ? s.lectures : []);
        lectures.forEach((l) => {
          if (l.goalDescription) {
            goals.push({ studentName: s.name, text: `[${l.name}] ${l.goalDescription}` });
          }
        });
      });

      const feedbacks: Array<{ studentName: string; date: string; manager: string; content: string }> = [];
      filteredStudentsForSubject.forEach((s) => {
        if (s.consultationLogs) {
          s.consultationLogs.forEach((log) => {
            if (log.content.includes(name)) {
              feedbacks.push({
                studentName: s.name,
                date: log.date,
                manager: log.manager,
                content: log.content,
              });
            }
          });
        }
      });

      const studentList = subjectItems.map((item) => {
        return {
          id: item.studentId,
          name: item.studentName,
          campus: item.campus,
          title: item.title,
          progress: item.total > 0 ? Math.round((item.current / item.total) * 100) : 0,
          current: item.current,
          total: item.total,
          status: item.status,
          targetDate: item.targetDate,
        };
      });

      return {
        type,
        name,
        studentCount: studentIds.length,
        avgProgress,
        avgDays,
        avgDailyAmount,
        unitLabel,
        goals,
        feedbacks,
        studentList,
      };
    } else {
      const bookItems = allProgressItems.filter(
        (item) => item.title.trim() === name.trim()
      );
      const studentIds = Array.from(new Set(bookItems.map((item) => item.studentId)));
      const filteredStudentsForBook = campusScopedStudents.filter((s) => studentIds.includes(s.id));

      const validItems = bookItems.filter((item) => item.total > 0);
      const avgProgress = validItems.length > 0
        ? Math.round(validItems.reduce((acc, item) => acc + (item.current / item.total) * 100, 0) / validItems.length)
        : 0;

      let totalDays = 0;
      let daysCount = 0;
      let totalDailyAmount = 0;
      let dailyAmountCount = 0;
      let unitLabel = '페이지';

      filteredStudentsForBook.forEach((s) => {
        const findBook = s.books?.find((b) => b.title === name) || 
                         s.subjects?.flatMap((sub) => sub.books).find((b) => b?.title === name);
        const findLecture = s.lectures?.find((l) => l.name === name) ||
                            s.subjects?.flatMap((sub) => sub.lectures).find((l) => l?.name === name);
        
        const mat = findBook || findLecture;
        if (mat) {
          if (findBook && findBook.unit) unitLabel = findBook.unit;
          if (findLecture) unitLabel = '강';

          if (mat.targetDate && s.createdAt) {
            const start = new Date(s.createdAt);
            const end = new Date(mat.targetDate);
            const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > 0) {
              totalDays += diff;
              daysCount++;
            }
          }

          if (mat.detailedPlans && mat.detailedPlans.length > 0) {
            mat.detailedPlans.forEach((p) => {
              if (p.dailyAmount) {
                totalDailyAmount += p.dailyAmount;
                dailyAmountCount++;
              }
            });
          }
        }
      });

      const avgDays = daysCount > 0 ? Math.round(totalDays / daysCount) : 0;
      const avgDailyAmount = dailyAmountCount > 0 ? (totalDailyAmount / dailyAmountCount).toFixed(1) : '0';

      const goals: Array<{ studentName: string; text: string }> = [];
      filteredStudentsForBook.forEach((s) => {
        const findBook = s.books?.find((b) => b.title === name) || 
                         s.subjects?.flatMap((sub) => sub.books).find((b) => b?.title === name);
        const findLecture = s.lectures?.find((l) => l.name === name) ||
                            s.subjects?.flatMap((sub) => sub.lectures).find((l) => l?.name === name);
        
        const mat = findBook || findLecture;
        if (mat?.goalDescription) {
          goals.push({ studentName: s.name, text: mat.goalDescription });
        }
      });

      const feedbacks: Array<{ studentName: string; date: string; manager: string; content: string }> = [];
      filteredStudentsForBook.forEach((s) => {
        if (s.consultationLogs) {
          s.consultationLogs.forEach((log) => {
            if (log.content.includes(name)) {
              feedbacks.push({
                studentName: s.name,
                date: log.date,
                manager: log.manager,
                content: log.content,
              });
            }
          });
        }
      });

      const studentList = bookItems.map((item) => {
        return {
          id: item.studentId,
          name: item.studentName,
          campus: item.campus,
          title: item.title,
          progress: item.total > 0 ? Math.round((item.current / item.total) * 100) : 0,
          current: item.current,
          total: item.total,
          status: item.status,
          targetDate: item.targetDate,
        };
      });

      return {
        type,
        name,
        studentCount: studentIds.length,
        avgProgress,
        avgDays,
        avgDailyAmount,
        unitLabel,
        goals,
        feedbacks,
        studentList,
      };
    }
  };

  const analysisData = getAnalysisData();

  function getCampusLabel(val: string) {
    switch(val) {
      case 'wonju': return '원주';
      case 'chuncheon': return '춘천';
      case 'chungju': return '충주';
      default: return '기타';
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">세션 권한 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans selection:bg-black/10 transition-all animate-fade-in-up">
      
      <AdminTopNav
        title="학습 및 진도 체계적 관리 대시보드"
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : getCampusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={handleCampusFilterChange}
        onStudentSearch={handleFocusSearch}
        onStudentAdd={() => router.push('/admin/consultation?action=add')}
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

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        <PendingChangeRequestsPanel
          students={campusScopedStudents}
          maxRows={4}
          getCampusLabel={getCampusLabel}
          onOpenStudent={handleOpenStudentById}
          description={`${selectedCampusLabel} 기준 학습 변경, 반차/휴가, 건의사항을 기존 상세 시트에서 바로 확인하고 처리할 수 있습니다.`}
        />

        {/* 1. 출결 우선 카드 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        {/* 2. 알림 배너 (상담 필요 학생) */}
        {pendingConsultationStudents.length > 0 && (
          <div className="admin-fit-box bg-gradient-to-br from-amber-500/[0.03] to-amber-500/[0.07] border border-amber-500/15 rounded-3xl p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shadow-[0_2px_8px_rgba(245,99,0,0.02)] backdrop-blur-sm transition-all duration-300 hover:border-amber-500/25">
            <div className="admin-fit-row flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 shrink-0">
                <AlertTriangle className="admin-fit-icon w-5 h-5 shrink-0" />
              </div>
              <div className="min-w-0">
                <h4 className="admin-fit-text text-sm font-black text-amber-900 tracking-tight">상담 일정이 도래한 원생이 존재합니다 ({pendingConsultationStudents.length}명)</h4>
                <p className="admin-fit-caption text-xs font-semibold text-amber-700/90 mt-1 leading-relaxed">
                  다음 상담일이 오늘이거나 이미 경과되었습니다. 원생명을 클릭해 밀착 상담 및 목표 피드백을 진행해 주세요.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {pendingConsultationStudents.slice(0, 4).map(s => (
                <Badge
                  key={s.id}
                  onClick={() => router.push(`/admin/consultation?studentId=${s.id}`)}
                  className="admin-fit-button bg-amber-100/80 hover:bg-amber-200 text-amber-900 border border-amber-200/50 cursor-pointer rounded-xl px-3 py-1.5 text-[10px] font-extrabold max-w-[9rem] shadow-sm hover:scale-[1.02] transition-transform"
                >
                  {s.name} ({getCampusLabel(s.campus)})
                </Badge>
              ))}
              {pendingConsultationStudents.length > 4 && (
                <span className="text-[10px] text-amber-700 font-extrabold self-center px-1">외 {pendingConsultationStudents.length - 4}명 더 있음</span>
              )}
            </div>
          </div>
        )}

        {/* 2-2. 알림 배너 (이번 주 성적 미입력) */}
        {weeklyGradeMissingStudents.length > 0 && (
          <div className="admin-fit-box bg-gradient-to-br from-amber-500/[0.03] to-amber-500/[0.07] border border-amber-500/15 rounded-3xl p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shadow-[0_2px_8px_rgba(245,99,0,0.02)] backdrop-blur-sm transition-all duration-300 hover:border-amber-500/25">
            <div className="admin-fit-row flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 shrink-0">
                <ClipboardList className="admin-fit-icon w-5 h-5 shrink-0" />
              </div>
              <div className="min-w-0">
                <h4 className="admin-fit-text text-sm font-black text-amber-900 tracking-tight">이번 주 성적 미입력 원생이 존재합니다 ({weeklyGradeMissingStudents.length}명)</h4>
                <p className="admin-fit-caption text-xs font-semibold text-amber-700/90 mt-1 leading-relaxed">
                  매주 성적 입력 대상이지만 이번 주(월~일) 성적이 아직 등록되지 않았습니다. 원생명을 클릭해 성적을 입력해 주세요.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {weeklyGradeMissingStudents.slice(0, 4).map(s => (
                <Badge
                  key={s.id}
                  onClick={() => router.push(`/admin/consultation?studentId=${s.id}`)}
                  className="admin-fit-button bg-amber-100/80 hover:bg-amber-200 text-amber-900 border border-amber-200/50 cursor-pointer rounded-xl px-3 py-1.5 text-[10px] font-extrabold max-w-[9rem] shadow-sm hover:scale-[1.02] transition-transform"
                >
                  {s.name} ({getCampusLabel(s.campus)})
                </Badge>
              ))}
              {weeklyGradeMissingStudents.length > 4 && (
                <span className="text-[10px] text-amber-700 font-extrabold self-center px-1">외 {weeklyGradeMissingStudents.length - 4}명 더 있음</span>
              )}
            </div>
          </div>
        )}

        {/* 3. 상담/관리 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card
            onClick={() => {
              handleCardClick('consultation');
              handleShowConsultationStudents();
            }}
            className="admin-fit-box group border border-black/[0.04] rounded-2xl bg-gradient-to-br from-white to-[#FDFBF7] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative overflow-hidden text-left"
          >
            <div className="absolute right-2 bottom-1 opacity-[0.04] group-hover:opacity-[0.07] group-hover:scale-105 transition-all duration-500 pointer-events-none">
              <Calendar className="w-16 h-16 text-[#F56300]" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">금주 상담 필요</span>
              {shouldShowDot('consultation', lastConsultationUpdate) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-amber-600">
                {pendingConsultationStudents.length}
              </span>
              <span className="text-xs font-bold text-amber-600/80 ml-1">명</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              {selectedCampusLabel} 기준 상담 일지 미작성 대상자
            </p>
            <div className="mt-3 text-[10px] text-amber-700 font-extrabold group-hover:underline flex items-center gap-0.5">
              대상 원생 보기 &rarr;
            </div>
          </Card>

          <Card
            onClick={() => {
              handleCardClick('students');
              handleShowAllStudents();
            }}
            className="admin-fit-box group border border-black/[0.04] rounded-2xl bg-gradient-to-br from-white to-[#F5F8FC] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative overflow-hidden text-left"
          >
            <div className="absolute right-2 bottom-1 opacity-[0.04] group-hover:opacity-[0.07] group-hover:scale-105 transition-all duration-500 pointer-events-none">
              <Users className="w-16 h-16 text-[#0071E3]" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">총 수강 원생</span>
              {shouldShowDot('students', lastStudentUpdate) && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </div>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-blue-600">
                {totalStudentsCount}
              </span>
              <span className="text-xs font-bold text-blue-600/80 ml-1">명</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              {selectedCampusLabel} 기준 관리 중인 원생 수
            </p>
            <div className="mt-3 text-[10px] text-blue-700 font-extrabold group-hover:underline flex items-center gap-0.5">
              전체 원생 보기 &rarr;
            </div>
          </Card>

          <Card
            onClick={() => {
              handleCardClick('grades');
              if (weeklyGradeMissingStudents[0]) {
                router.push(`/admin/consultation?studentId=${weeklyGradeMissingStudents[0].id}`);
              } else {
                router.push('/admin/consultation');
              }
            }}
            className="admin-fit-box group border border-black/[0.04] rounded-2xl bg-gradient-to-br from-white to-[#FFF8F2] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative overflow-hidden text-left"
          >
            <div className="absolute right-2 bottom-1 opacity-[0.04] group-hover:opacity-[0.07] group-hover:scale-105 transition-all duration-500 pointer-events-none">
              <ClipboardList className="w-16 h-16 text-amber-600" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">성적 미입력</span>
              {shouldShowDot('grades', lastGradeUpdate) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </div>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-amber-600">
                {weeklyGradeMissingStudents.length}
              </span>
              <span className="text-xs font-bold text-amber-600/80 ml-1">명</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              이번 주 성적 입력 대상 중 미등록 원생
            </p>
            <div className="mt-3 text-[10px] text-amber-700 font-extrabold group-hover:underline flex items-center gap-0.5">
              {weeklyGradeMissingStudents.length > 0 ? '첫 원생 열기' : '미입력 없음'} &rarr;
            </div>
          </Card>

          <Card
            onClick={() => {
              handleCardClick('progress');
              handleShowBehindMaterials();
            }}
            className="admin-fit-box group border border-black/[0.04] rounded-2xl bg-gradient-to-br from-white to-[#F5F8FC] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative overflow-hidden text-left"
          >
            <div className="absolute right-2 bottom-1 opacity-[0.04] group-hover:opacity-[0.07] group-hover:scale-105 transition-all duration-500 pointer-events-none">
              <BarChart3 className="w-16 h-16 text-blue-600" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider text-[#86868B] uppercase">평균 학습 진도율</span>
              {shouldShowDot('progress', lastProgressUpdate) && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </div>
            <div className="mt-3 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-blue-600">
                {averageProgress}
              </span>
              <span className="text-xs font-bold text-blue-600/80 ml-1">%</span>
            </div>
            <p className="text-[10px] font-semibold text-[#86868B] mt-1.5 leading-snug">
              {selectedCampusLabel} 기준 교재 및 인강 진행도 평균
            </p>
            <div className="mt-3 text-[10px] text-blue-700 font-extrabold group-hover:underline flex items-center gap-0.5">
              부족 진도 보기 &rarr;
            </div>
          </Card>
        </div>

        {/* 4. 과목/교재/인강 랭킹 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="admin-fit-box gap-2 border border-black/[0.04] rounded-2xl bg-white p-4.5 shadow-sm xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-black text-[#1D1D1F]">많이 공부 중인 과목 (교재)</CardTitle>
              <BookOpen className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularSubjectRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-[#86868B] py-6 text-center">표시할 과목 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularSubjectRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'subject', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] border border-black/[0.01] px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] border-transparent text-[#86868B]'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#1D1D1F]">{rank.label}</p>
                        <p className="text-[10px] font-bold text-[#86868B]">진행 항목 {rank.itemCount}개 · 평균 {rank.averageProgress}%</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 border border-black/[0.04] px-2 py-0.5 text-[10px] font-black text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="admin-fit-box gap-2 border border-black/[0.04] rounded-2xl bg-white p-4.5 shadow-sm xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-black text-[#1D1D1F]">많이 공부 중인 책</CardTitle>
              <ClipboardList className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularBookRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-[#86868B] py-6 text-center">표시할 책 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularBookRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'book', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] border border-black/[0.01] px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] border-transparent text-[#86868B]'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#1D1D1F]">{rank.label}</p>
                        <p className="truncate text-[10px] font-bold text-[#86868B]">{rank.meta || '기타'} · 평균 {rank.averageProgress}%</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 border border-black/[0.04] px-2 py-0.5 text-[10px] font-black text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="admin-fit-box gap-2 border border-black/[0.04] rounded-2xl bg-white p-4.5 shadow-sm xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-black text-[#1D1D1F]">많이 듣고 있는 과목 (인강)</CardTitle>
              <Play className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularLectureSubjectRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-[#86868B] py-6 text-center">표시할 과목 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularLectureSubjectRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'subject', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] border border-black/[0.01] px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] border-transparent text-[#86868B]'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#1D1D1F]">{rank.label}</p>
                        <p className="text-[10px] font-bold text-[#86868B]">진행 항목 {rank.itemCount}개 · 평균 {rank.averageProgress}%</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 border border-black/[0.04] px-2 py-0.5 text-[10px] font-black text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="admin-fit-box gap-2 border border-black/[0.04] rounded-2xl bg-white p-4.5 shadow-sm xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-black text-[#1D1D1F]">많이 듣고 있는 강의</CardTitle>
              <Play className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularLectureRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-[#86868B] py-6 text-center">표시할 강의 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularLectureRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'book', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] border border-black/[0.01] px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] border-transparent text-[#86868B]'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#1D1D1F]">{rank.label}</p>
                        <p className="truncate text-[10px] font-bold text-[#86868B]">{rank.meta || '기타'} · 평균 {rank.averageProgress}%</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 border border-black/[0.04] px-2 py-0.5 text-[10px] font-black text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </main>

      {/* 7. 과목/교재 학습 현황 분석 모달 */}
      {analysisTarget && analysisData && (
        <div 
          onClick={() => setAnalysisTarget(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white/95 border border-black/[0.06] shadow-2xl rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden backdrop-blur-md text-left"
          >
            
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-black/[0.04] p-5 shrink-0 bg-white/50">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#86868B]">
                  {analysisData.type === 'subject' ? '과목 분석' : '교재/강의 분석'}
                </span>
                <h2 className="text-lg font-black text-[#1D1D1F] tracking-tight mt-0.5">{analysisData.name}</h2>
              </div>
              <button
                onClick={() => setAnalysisTarget(null)}
                className="rounded-full bg-[#F5F5F7] hover:bg-[#EAEAEA] active:scale-95 p-2 transition-all"
              >
                <X className="w-4 h-4 text-[#86868B]" />
              </button>
            </div>

            {/* 모달 바디 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
              
              {/* 요약 KPI 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-black/[0.02] border border-black/[0.04] p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-extrabold text-[#86868B] uppercase">학습 학생 수</span>
                  <div className="text-xl font-black text-[#1D1D1F] mt-2">{analysisData.studentCount}명</div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-blue-500/[0.02] to-blue-500/[0.06] border border-blue-500/10 p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-extrabold text-[#0071E3] uppercase">평균 진도율</span>
                  <div className="text-xl font-black text-[#0071E3] mt-2">{analysisData.avgProgress}%</div>
                </div>
                <div className="rounded-2xl bg-black/[0.02] border border-black/[0.04] p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-extrabold text-[#86868B] uppercase">평균 학습 소요</span>
                  <div className="text-xl font-black text-[#1D1D1F] mt-2">
                    {analysisData.avgDays > 0 ? `${analysisData.avgDays}일` : '-'}
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.02] to-emerald-500/[0.06] border border-emerald-500/10 p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-extrabold text-emerald-600 uppercase">하루 평균 진도</span>
                  <div className="text-xl font-black text-emerald-800 mt-2">
                    {analysisData.avgDailyAmount !== '0.0' && analysisData.avgDailyAmount !== '0' 
                      ? `${analysisData.avgDailyAmount} ${analysisData.unitLabel || '페이지'}` 
                      : '계획 없음'}
                  </div>
                </div>
              </div>

              {/* 학생별 상세 현황 */}
              <div className="space-y-2">
                <h3 className="text-xs font-black text-[#1D1D1F]">학생별 진도 상세</h3>
                <div className="border border-black/[0.04] rounded-2xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-black/[0.02] text-[#86868B] font-extrabold border-b border-black/[0.04]">
                        <th className="px-4 py-2.5">이름</th>
                        <th className="px-4 py-2.5">캠퍼스</th>
                        {analysisData.type === 'subject' && <th className="px-4 py-2.5">학습 교재/강의</th>}
                        <th className="px-4 py-2.5">진도율</th>
                        <th className="px-4 py-2.5">완료/목표</th>
                        <th className="px-4 py-2.5">목표일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisData.studentList.map((student) => (
                        <tr key={student.id + student.title} className="border-b border-black/[0.02] hover:bg-black/[0.015]">
                          <td className="px-4 py-2.5 font-bold text-[#1D1D1F]">{student.name}</td>
                          <td className="px-4 py-2.5 text-[#86868B]">{getCampusLabel(student.campus)}</td>
                          {analysisData.type === 'subject' && <td className="px-4 py-2.5 text-[#1D1D1F] truncate max-w-[200px]">{student.title}</td>}
                          <td className="px-4 py-2.5 font-black text-[#0071E3]">{student.progress}%</td>
                          <td className="px-4 py-2.5 text-[#86868B]">{student.current} / {student.total}</td>
                          <td className="px-4 py-2.5 text-[#86868B]">{student.targetDate || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2단 그리드: 학습 목표 & 피드백 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 학습 목표 목록 */}
                <div className="space-y-2 flex flex-col">
                  <h3 className="text-xs font-black text-[#1D1D1F]">학생 설정 목표</h3>
                  <div className="border border-black/[0.04] rounded-2xl p-4 bg-white space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[250px]">
                    {analysisData.goals.length === 0 ? (
                      <p className="text-[11px] font-semibold text-[#86868B] py-8 text-center">등록된 학습 목표가 없습니다.</p>
                    ) : (
                      analysisData.goals.map((g, i) => (
                        <div key={i} className="text-xs leading-relaxed border-b border-black/[0.01] pb-2 last:border-0 last:pb-0">
                          <span className="font-extrabold text-[#0071E3] mr-1.5">{g.studentName}</span>
                          <span className="text-[#1D1D1F]">{g.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 피드백(상담 기록) 목록 */}
                <div className="space-y-2 flex flex-col">
                  <h3 className="text-xs font-black text-[#1D1D1F]">관련 피드백 (상담 기록)</h3>
                  <div className="border border-black/[0.04] rounded-2xl p-4 bg-white space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[250px]">
                    {analysisData.feedbacks.length === 0 ? (
                      <p className="text-[11px] font-semibold text-[#86868B] py-8 text-center">상담 기록 중 언급된 피드백이 없습니다.</p>
                    ) : (
                      analysisData.feedbacks.map((f, i) => (
                        <div key={i} className="text-xs border-b border-black/[0.02] pb-2.5 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between text-[10px] text-[#86868B] mb-1 font-extrabold">
                            <span>{f.studentName} · {f.date}</span>
                            <span>{f.manager} 코치</span>
                          </div>
                          <p className="text-[#1D1D1F] leading-relaxed whitespace-pre-wrap">{f.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
