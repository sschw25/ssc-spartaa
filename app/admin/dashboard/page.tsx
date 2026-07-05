'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, User, Calendar, BarChart3, Search, LogOut, Loader2,
  AlertTriangle, BookOpen, ClipboardList, X, Play, RefreshCw, Clock,
  CalendarClock, ChevronRight, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { getManagedProgressItems } from '@/lib/progress-plan';
import { buildAwayReplan } from '@/lib/away-impact';
import { kstToday } from '@/lib/leave';
import { isWeeklyGradeMissing, enrollmentDaysLeft } from '@/lib/student-flags';
import { TodayAttendanceWidget } from '@/components/admin/today-attendance-widget';
import { AdminLeaderboard } from '@/components/admin/admin-leaderboard';
import { MissionSummaryWidget } from '@/components/admin/mission-summary-widget';
import { MissingArrivalWidget } from '@/components/admin/missing-arrival-widget';
import { DailyDigestWidget } from '@/components/admin/daily-digest-widget';
import { WorkQueueWidget } from '@/components/admin/work-queue-widget';
import { ScheduledJobsPanel } from '@/components/admin/scheduled-jobs-panel';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { AnimatedNumber } from '@/components/admin/animated-number';
import { motion } from 'framer-motion';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const isCampusFilterValue = (value: string | null): value is string => !!value && CAMPUS_FILTERS.includes(value);

export default function AdminDashboardPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // 캠퍼스 필터 상태
  const [campusFilter, setCampusFilter] = useState('all');
  const [campusFilterStorageKey, setCampusFilterStorageKey] = useState('');
  const [adminCampus, setAdminCampus] = useState('all');

  // 모달 제어 상태
  const [analysisTarget, setAnalysisTarget] = useState<{ type: 'subject' | 'book'; name: string } | null>(null);
  // 출결 위젯 새로고침 신호
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [showDailyDigestSchedule, setShowDailyDigestSchedule] = useState(false);

  // 관리자 ID 및 요약 카드 마지막 조회 시각 상태
  const [adminId, setAdminId] = useState('admin');
  const [viewedTimes, setViewedTimes] = useState<Record<string, string>>({});

  const handleOpenStudentById = (id: string) => {
    const target = students.find((s) => s.id === id);
    if (target) {
      openStudent(target, {
        onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
        onDelete: (sid) => setStudents((prev) => prev.filter((s) => s.id !== sid)),
        allStudents: students,
      });
    } else {
      router.push(`/admin/consultation?studentId=${id}`);
    }
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

        const userCampus = json.campus || 'all';
        setAdminCampus(userCampus);

        const storageKey = `ssc-admin-dashboard-campus-filter:${userKey}`;
        if (userCampus !== 'all') {
          setCampusFilter(userCampus);
        } else {
          const savedCampusFilter = window.localStorage.getItem(storageKey);
          if (isCampusFilterValue(savedCampusFilter)) {
            setCampusFilter(savedCampusFilter);
          }
        }
        setCampusFilterStorageKey(storageKey);
      } catch (err) {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    // 인증 확인과 학생 로드를 병렬 시작 — 첫 화면까지의 대기를 한 단계 줄인다.
    // (미인증이면 학생 API가 401로 조용히 끝나고 verifyAuth가 로그인으로 보낸다)
    verifyAuth();
    loadStudents();
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
      } else if (res.status !== 401) {
        // 401은 인증 확인(verifyAuth)이 로그인 화면으로 보내는 중 — 토스트 소음 없이 넘어간다.
        toast.error('학생 정보를 불러오지 못했습니다.');
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
        toast.success('로그아웃했습니다.');
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
    if (adminCampus !== 'all') {
      setCampusFilter(adminCampus);
      return;
    }
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
  const effectiveFilter = adminCampus !== 'all' ? adminCampus : campusFilter;
  const campusScopedStudents = students.filter(s => effectiveFilter === 'all' || s.campus === effectiveFilter);
  const totalStudentsCount = campusScopedStudents.length;
  const selectedCampusLabel = effectiveFilter === 'all' ? '전체 캠퍼스' : getCampusLabel(effectiveFilter);

  // 등록 만료/임박 학생
  const RENEWAL_WARN_DAYS = 5;
  const expiredStudents = campusScopedStudents.filter(s => {
    const d = enrollmentDaysLeft(s.enrollmentEndDate);
    return d !== null && d < 0;
  });
  const renewalWarnStudents = campusScopedStudents.filter(s => {
    const d = enrollmentDaysLeft(s.enrollmentEndDate);
    return d !== null && d >= 0 && d <= RENEWAL_WARN_DAYS;
  });

  // 오늘 상담이 예정되었거나 지난 학생들
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingConsultationStudents = campusScopedStudents.filter(s => {
    if (!s.nextConsultationDate) return false;
    return s.nextConsultationDate <= todayStr;
  });

  // 매주 성적 입력 대상인데 이번 주(월~일) 성적이 아직 없는 학생들
  const weeklyGradeMissingStudents = campusScopedStudents.filter(s => isWeeklyGradeMissing(s));

  // 정기 외출로 계획 재조정이 필요한(아직 미반영) 원생. buildAwayReplan 은 외출 영향 없으면 즉시 [] 반환.
  const awayReplanStudents = campusScopedStudents.filter(s => buildAwayReplan(s, kstToday()).some(it => !it.blocked));

  // 대기중인 변경신청 + 건의사항 + 휴가신청 건수 (타입별 분리)
  const pendingChangeCount = campusScopedStudents.reduce((total, s) =>
    total + (s.consultationLogs || []).filter(log => log.type === 'request' && log.status === 'pending').length, 0);
  const pendingLeaveCount = campusScopedStudents.reduce((total, s) =>
    total + (s.leaveRequests || []).filter(req => req.status === 'pending').length, 0);
  const pendingSuggestionCount = campusScopedStudents.reduce((total, s) =>
    total + (s.consultationLogs || []).filter(log => log.type === 'suggestion' && log.status === 'pending').length, 0);
  const pendingRequestsTotal = pendingChangeCount + pendingLeaveCount + pendingSuggestionCount;
  const pendingStudentCount = campusScopedStudents.filter(s => {
    const hasChange = (s.consultationLogs || []).some(log => (log.type === 'request' || log.type === 'suggestion') && log.status === 'pending');
    const hasLeave = (s.leaveRequests || []).some(req => req.status === 'pending');
    return hasChange || hasLeave;
  }).length;

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

    // 조건 1: 마지막 업데이트가 KST 기준 "오늘"이어야 함.
    // (로컬 자정 Date의 toISOString()은 UTC로 변환되어 KST 오전 9시 이전 판정이 어긋난다 — 날짜 키로 비교)
    const lastUpdateDate = new Date(lastUpdateTime);
    if (Number.isNaN(lastUpdateDate.getTime())) return false; // 비ISO 값이 섞여도 렌더 크래시(Intl RangeError) 방지
    const lastUpdateDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(lastUpdateDate);
    if (lastUpdateDay < kstToday()) return false;

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

  // 진도 지연 원생 (목표 대비 behind 상태 아이템이 하나라도 있는 원생)
  const behindStudentIds = Array.from(new Set(
    allProgressItems.filter(item => item.status === 'behind').map(item => item.studentId)
  ));
  const behindStudentsCount = behindStudentIds.length;

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
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0b0b0c] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-slate-500 dark:text-slate-400">세션 권한 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans selection:bg-black/10">

      <AdminTopNav
        title="학습·진도 관리"
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
              className="admin-fit-button rounded-2xl border-black/[0.05] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10 text-xs h-9.5 bg-white dark:bg-[#1c1c1e] px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
              title="검색"
            >
              <Search className="w-4 h-4 md:mr-1.5 text-slate-500 dark:text-slate-400" />
              <span className="hidden md:inline font-bold">검색</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadStudents}
              className="admin-fit-button rounded-2xl border-black/[0.05] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10 text-xs h-9.5 bg-white dark:bg-[#1c1c1e] px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 md:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline font-bold">새로고침</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              className="admin-fit-button text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl text-xs h-9.5 px-3 transition-premium"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4 mr-1.5 text-red-500" />
              <span className="hidden sm:inline font-bold">로그아웃</span>
            </Button>
          </>
        }
      />

      <main className="stagger-children max-w-7xl mx-auto p-4 md:p-8 pb-28 md:pb-28 space-y-8">

        {/* ── 섹션 1: 알림 현황 (iOS 26 — 차분한 흰 카드 + 의미색은 숫자에만) ── */}
        <div className="space-y-4">
          {/* 헤더 + 보조 지표 칩 */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">알림 현황</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => document.getElementById('work-queue')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                title="아래 '오늘의 작업 큐'에서 유형별 대기 건을 확인하세요"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${pendingRequestsTotal > 0 ? 'bg-amber-500/12 text-amber-700 hover:bg-amber-500/20' : 'bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/10'}`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                대기요청 {pendingRequestsTotal}건
              </button>
              <button
                onClick={() => { handleCardClick('grades'); router.push('/admin/consultation?filter=missing_grade'); }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${weeklyGradeMissingStudents.length > 0 ? 'bg-amber-500/12 text-amber-700 hover:bg-amber-500/20' : 'bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/10'}`}
              >
                성적미입력 {weeklyGradeMissingStudents.length}명
              </button>
              <button
                onClick={() => { handleCardClick('students'); handleShowAllStudents(); }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-black/[0.04] dark:bg-white/5 text-[#0071E3] hover:bg-[#0071E3]/10 dark:hover:bg-[#0071E3]/15 transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                총원생 {totalStudentsCount}명
              </button>
              <button
                onClick={() => { handleCardClick('progress'); handleShowBehindMaterials(); }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-black/[0.04] dark:bg-white/5 text-[#0071E3] hover:bg-[#0071E3]/10 dark:hover:bg-[#0071E3]/15 transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                평균진도 {averageProgress}%
              </button>
              {awayReplanStudents.length > 0 && (
                <button
                  onClick={() => { handleCardClick('students'); handleShowAllStudents(); }}
                  title="정기 외출로 학습 계획 재조정이 필요한 원생 — 상세 열어 '외출 영향' 패널에서 적용"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-amber-500/12 text-amber-700 hover:bg-amber-500/20 transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  외출 조정 {awayReplanStudents.length}명
                </button>
              )}
              <button
                onClick={() => router.push('/admin/calendar')}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-black/[0.04] dark:bg-white/5 text-[#0071E3] hover:bg-[#0071E3]/10 dark:hover:bg-[#0071E3]/15 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                캘린더
              </button>
            </div>
          </div>

          {/* 5개 핵심 알림 카드 (1행) */}
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-5 gap-4"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
          >

            {/* 만료 경고 — 빨강 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
            <Card onClick={() => router.push('/admin/enrollment-expired')} className="admin-fit-box group glass rounded-3xl gap-0 p-5 hover:shadow-[0_10px_32px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer text-left h-full">
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${expiredStudents.length > 0 ? 'bg-red-500/12' : 'bg-black/[0.04] dark:bg-white/5'}`}>
                  <XCircle className={`w-[18px] h-[18px] ${expiredStudents.length > 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`} />
                </div>
                {expiredStudents.length > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1" />}
              </div>
              <div className="mt-3.5 flex items-baseline gap-1">
                <AnimatedNumber value={expiredStudents.length} className={`text-[18px] leading-none font-semibold tracking-tight ${expiredStudents.length > 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`} />
                <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
              </div>
              <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">만료 경고</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">등록 만료일이 지난 원생 · 결제 확인 필요</p>
              <div className="mt-3 text-[13px] font-medium text-[#0071E3] flex items-center gap-0.5">
                {expiredStudents.length > 0 ? '대상 원생 보기' : '해당 없음'} <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Card>
            </motion.div>

            {/* 재등록 임박 — 주황 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
            <Card onClick={() => router.push('/admin/enrollment-warning')} className="admin-fit-box group glass rounded-3xl gap-0 p-5 hover:shadow-[0_10px_32px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer text-left h-full">
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${renewalWarnStudents.length > 0 ? 'bg-amber-500/12' : 'bg-black/[0.04] dark:bg-white/5'}`}>
                  <Clock className={`w-[18px] h-[18px] ${renewalWarnStudents.length > 0 ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}`} />
                </div>
                {renewalWarnStudents.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mt-1" />}
              </div>
              <div className="mt-3.5 flex items-baseline gap-1">
                <AnimatedNumber value={renewalWarnStudents.length} className={`text-[18px] leading-none font-semibold tracking-tight ${renewalWarnStudents.length > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100'}`} />
                <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
              </div>
              <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">재등록 임박</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{RENEWAL_WARN_DAYS}일 이내 등록 종료 예정 원생</p>
              <div className="mt-3 text-[13px] font-medium text-[#0071E3] flex items-center gap-0.5">
                {renewalWarnStudents.length > 0 ? '대상 원생 보기' : '해당 없음'} <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Card>
            </motion.div>

            {/* 상담 도래 — 주황 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
            <Card
              onClick={() => { handleCardClick('consultation'); handleShowConsultationStudents(); }}
              className="admin-fit-box group glass rounded-3xl gap-0 p-5 hover:shadow-[0_10px_32px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer text-left h-full"
            >
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${pendingConsultationStudents.length > 0 ? 'bg-amber-500/12' : 'bg-black/[0.04] dark:bg-white/5'}`}>
                  <Calendar className={`w-[18px] h-[18px] ${pendingConsultationStudents.length > 0 ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}`} />
                </div>
                {shouldShowDot('consultation', lastConsultationUpdate) && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mt-1" />}
              </div>
              <div className="mt-3.5 flex items-baseline gap-1">
                <AnimatedNumber value={pendingConsultationStudents.length} className={`text-[18px] leading-none font-semibold tracking-tight ${pendingConsultationStudents.length > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100'}`} />
                <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
              </div>
              <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">상담 도래</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{selectedCampusLabel} 기준 상담 일지 미작성 대상자</p>
              <div className="mt-3 text-[13px] font-medium text-[#0071E3] flex items-center gap-0.5">대상 원생 보기 <ChevronRight className="w-3.5 h-3.5" /></div>
            </Card>
            </motion.div>

            {/* 진도 지연 — 주황/빨강 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
            <Card
              onClick={handleShowBehindMaterials}
              className="admin-fit-box group glass rounded-3xl gap-0 p-5 hover:shadow-[0_10px_32px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer text-left h-full"
            >
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${behindStudentsCount > 0 ? 'bg-orange-500/12' : 'bg-black/[0.04] dark:bg-white/5'}`}>
                  <AlertTriangle className={`w-[18px] h-[18px] ${behindStudentsCount > 0 ? 'text-orange-500' : 'text-slate-500 dark:text-slate-400'}`} />
                </div>
                {behindStudentsCount > 0 && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse mt-1" />}
              </div>
              <div className="mt-3.5 flex items-baseline gap-1">
                <AnimatedNumber value={behindStudentsCount} className={`text-[18px] leading-none font-semibold tracking-tight ${behindStudentsCount > 0 ? 'text-orange-600' : 'text-slate-900 dark:text-slate-100'}`} />
                <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">명</span>
              </div>
              <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">진도 지연</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">목표 대비 진도가 뒤처진 원생</p>
              <div className="mt-3 text-[13px] font-medium text-[#0071E3] flex items-center gap-0.5">
                {behindStudentsCount > 0 ? '지연 원생 보기' : '지연 없음'} <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Card>
            </motion.div>

            {/* 대기 요청 — 앰버 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}>
            <Card
              onClick={() => router.push('/admin/inbox')}
              className="admin-fit-box group glass rounded-3xl gap-0 p-5 hover:shadow-[0_10px_32px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer text-left h-full"
            >
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${pendingRequestsTotal > 0 ? 'bg-amber-500/12' : 'bg-black/[0.04] dark:bg-white/5'}`}>
                  <ClipboardList className={`w-[18px] h-[18px] ${pendingRequestsTotal > 0 ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}`} />
                </div>
                {pendingStudentCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{pendingStudentCount}명</span>
                )}
              </div>
              <div className="mt-3.5 flex items-baseline gap-1">
                <AnimatedNumber value={pendingRequestsTotal} className={`text-[18px] leading-none font-semibold tracking-tight ${pendingRequestsTotal > 0 ? 'text-amber-700' : 'text-slate-900 dark:text-slate-100'}`} />
                <span className="text-[15px] font-medium text-slate-500 dark:text-slate-400">건</span>
              </div>
              <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-2">대기 요청</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">변경 {pendingChangeCount} · 휴가 {pendingLeaveCount} · 건의 {pendingSuggestionCount}</p>
              <div className="mt-3 text-[13px] font-medium text-[#0071E3] flex items-center gap-0.5">
                {pendingRequestsTotal > 0 ? '인박스 열기' : '대기 없음'} <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Card>
            </motion.div>

          </motion.div>

          {/* 오늘의 작업 큐 — 인박스 밖(자리이동/가입/도시락/상담예약)까지 포함한 유형별 대기 딥링크 */}
          <WorkQueueWidget students={campusScopedStudents} campusFilter={effectiveFilter} studentsLoading={loading} />
        </div>{/* /섹션1 알림현황 */}

        {/* ── 섹션 2: 오늘의 브리핑 (스마트화 Wave1 #2+#3: 연속결석·이탈급증·위험밴드) ── */}
        <div className="space-y-3.5">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">오늘의 브리핑</h2>
            <button
              type="button"
              aria-expanded={showDailyDigestSchedule}
              onClick={() => setShowDailyDigestSchedule((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] dark:bg-white/5 px-3 py-1.5 text-[12px] font-medium text-[#0071E3] transition-colors hover:bg-[#0071E3]/10 dark:hover:bg-[#0071E3]/15"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {showDailyDigestSchedule ? '예약 닫기' : '예약 확인'}
            </button>
          </div>
          <DailyDigestWidget campusFilter={campusFilter} onSelectStudentId={handleOpenStudentById} />
          {/* 일일 브리핑 생성(daily_digest) 예약 설정 — 전체 잡은 /admin/schedules 에서 관리 */}
          {showDailyDigestSchedule && <ScheduledJobsPanel jobIds={['daily_digest']} compact />}
        </div>{/* /섹션2 */}

        {/* ── 섹션 3: 출결 현황 ── */}
        <div className="space-y-3.5">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">출결 현황</h2>
            <button
              type="button"
              onClick={() => router.push('/admin/attendance')}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] dark:bg-white/5 px-3 py-1.5 text-[12px] font-medium text-[#0071E3] transition-colors hover:bg-[#0071E3]/10 dark:hover:bg-[#0071E3]/15"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              출결 상세
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
        <div className="mt-5">
          <MissingArrivalWidget
            campusFilter={campusFilter}
            refreshSignal={attendanceRefresh}
            onSelectStudentId={handleOpenStudentById}
          />
        </div>
        <div className="mt-5">
          <MissionSummaryWidget />
        </div>
        </div>{/* /섹션3 */}

        {/* ── 섹션 4: 학습 현황 ── */}
        <div className="space-y-3.5">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">학습 현황</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="admin-fit-box gap-2 border border-black/[0.05] dark:border-white/10 rounded-2xl bg-gradient-to-br from-white to-[#F5F8FF] dark:from-[#1c1c1e] dark:to-[#1c1c1e] p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition-shadow duration-200 xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-semibold text-slate-900 dark:text-slate-100">많이 공부 중인 과목 (교재)</CardTitle>
              <BookOpen className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularSubjectRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-6 text-center">표시할 과목 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularSubjectRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'subject', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.01] dark:border-white/10 px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/10 hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] dark:bg-white/10 border-transparent text-slate-500 dark:text-slate-400'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{rank.label}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-[3px] rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#0071E3] animate-bar-grow" style={{ width: `${rank.averageProgress}%` }} />
                          </div>
                          <span className="text-[9px] font-semibold text-[#0071E3] shrink-0 w-7 text-right">{rank.averageProgress}%</span>
                        </div>
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">항목 {rank.itemCount}개</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 dark:bg-white/10 border border-black/[0.04] dark:border-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="admin-fit-box gap-2 border border-black/[0.05] dark:border-white/10 rounded-2xl bg-gradient-to-br from-white to-[#F5F8FF] dark:from-[#1c1c1e] dark:to-[#1c1c1e] p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition-shadow duration-200 xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-semibold text-slate-900 dark:text-slate-100">많이 공부 중인 책</CardTitle>
              <ClipboardList className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularBookRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-6 text-center">표시할 책 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularBookRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'book', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.01] dark:border-white/10 px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/10 hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] dark:bg-white/10 border-transparent text-slate-500 dark:text-slate-400'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{rank.label}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-[3px] rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#0071E3] animate-bar-grow" style={{ width: `${rank.averageProgress}%` }} />
                          </div>
                          <span className="text-[9px] font-semibold text-[#0071E3] shrink-0 w-7 text-right">{rank.averageProgress}%</span>
                        </div>
                        <p className="truncate text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{rank.meta || '기타'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 dark:bg-white/10 border border-black/[0.04] dark:border-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="admin-fit-box gap-2 border border-black/[0.05] dark:border-white/10 rounded-2xl bg-gradient-to-br from-white to-[#F5F8FF] dark:from-[#1c1c1e] dark:to-[#1c1c1e] p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition-shadow duration-200 xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-semibold text-slate-900 dark:text-slate-100">많이 듣고 있는 과목 (인강)</CardTitle>
              <Play className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularLectureSubjectRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-6 text-center">표시할 과목 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularLectureSubjectRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'subject', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.01] dark:border-white/10 px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/10 hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] dark:bg-white/10 border-transparent text-slate-500 dark:text-slate-400'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{rank.label}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-[3px] rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#0071E3] animate-bar-grow" style={{ width: `${rank.averageProgress}%` }} />
                          </div>
                          <span className="text-[9px] font-semibold text-[#0071E3] shrink-0 w-7 text-right">{rank.averageProgress}%</span>
                        </div>
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">항목 {rank.itemCount}개</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 dark:bg-white/10 border border-black/[0.04] dark:border-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="admin-fit-box gap-2 border border-black/[0.05] dark:border-white/10 rounded-2xl bg-gradient-to-br from-white to-[#F5F8FF] dark:from-[#1c1c1e] dark:to-[#1c1c1e] p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition-shadow duration-200 xl:col-span-2 text-left">
            <CardHeader className="flex flex-row items-center justify-between px-1 pb-2">
              <CardTitle className="text-xs font-semibold text-slate-900 dark:text-slate-100">많이 듣고 있는 강의</CardTitle>
              <Play className="w-4 h-4 text-[#0071E3]" />
            </CardHeader>
            <CardContent className="px-1">
              {popularLectureRanks.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-6 text-center">표시할 강의 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularLectureRanks.map((rank, index) => (
                    <div
                      key={rank.key}
                      onClick={() => setAnalysisTarget({ type: 'book', name: rank.label })}
                      className="flex items-center gap-2.5 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.01] dark:border-white/10 px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/10 hover:border-black/[0.03] active:scale-[0.98] transition-all duration-200"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border ${
                        index === 0 ? 'bg-orange-50 border-orange-200/50 text-[#F56300]' :
                        index === 1 ? 'bg-blue-50 border-blue-200/50 text-[#0071E3]' :
                        'bg-black/[0.03] dark:bg-white/10 border-transparent text-slate-500 dark:text-slate-400'
                      }`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{rank.label}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-[3px] rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#0071E3] animate-bar-grow" style={{ width: `${rank.averageProgress}%` }} />
                          </div>
                          <span className="text-[9px] font-semibold text-[#0071E3] shrink-0 w-7 text-right">{rank.averageProgress}%</span>
                        </div>
                        <p className="truncate text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{rank.meta || '기타'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/90 dark:bg-white/10 border border-black/[0.04] dark:border-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">{rank.studentCount}명</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </div>{/* /섹션4 */}

      </main>


      {/* 7. 과목/교재 학습 현황 분석 모달 */}
      {analysisTarget && analysisData && (
        <div
          onClick={() => setAnalysisTarget(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-strong rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-left animate-scale-in-up"
          >

            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-black/[0.04] dark:border-white/10 p-5 shrink-0 bg-white/50 dark:bg-white/5">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {analysisData.type === 'subject' ? '과목 분석' : '교재/강의 분석'}
                </span>
                <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight mt-0.5">{analysisData.name}</h2>
              </div>
              <button
                onClick={() => setAnalysisTarget(null)}
                className="rounded-full bg-[#F5F5F7] dark:bg-white/10 hover:bg-[#EAEAEA] dark:hover:bg-white/[0.15] active:scale-95 p-2 transition-all"
              >
                <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            {/* 모달 바디 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">

              {/* 요약 KPI 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.04] dark:border-white/10 p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">학습 학생 수</span>
                  <div className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-2">{analysisData.studentCount}명</div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-blue-500/[0.02] to-blue-500/[0.06] border border-blue-500/10 p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-semibold text-[#0071E3] uppercase">평균 진도율</span>
                  <div className="text-xl font-semibold text-[#0071E3] mt-2">{analysisData.avgProgress}%</div>
                </div>
                <div className="rounded-2xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.04] dark:border-white/10 p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">평균 학습 소요</span>
                  <div className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                    {analysisData.avgDays > 0 ? `${analysisData.avgDays}일` : '-'}
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.02] to-emerald-500/[0.06] border border-emerald-500/10 p-4 flex flex-col justify-between min-h-[90px]">
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase">하루 평균 진도</span>
                  <div className="text-xl font-semibold text-emerald-800 dark:text-emerald-400 mt-2">
                    {analysisData.avgDailyAmount !== '0.0' && analysisData.avgDailyAmount !== '0'
                      ? `${analysisData.avgDailyAmount} ${analysisData.unitLabel || '페이지'}`
                      : '계획 없음'}
                  </div>
                </div>
              </div>

              {/* 학생별 상세 현황 */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">학생별 진도 상세</h3>
                <div className="border border-black/[0.04] dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#1c1c1e]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-black/[0.02] dark:bg-white/5 text-slate-500 dark:text-slate-400 font-semibold border-b border-black/[0.04] dark:border-white/10">
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
                        <tr key={student.id + student.title} className="border-b border-black/[0.02] dark:border-white/[0.06] hover:bg-black/[0.015] dark:hover:bg-white/5">
                          <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-slate-100">{student.name}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{getCampusLabel(student.campus)}</td>
                          {analysisData.type === 'subject' && <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100 truncate max-w-[200px]">{student.title}</td>}
                          <td className="px-4 py-2.5 font-semibold text-[#0071E3]">{student.progress}%</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{student.current} / {student.total}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{student.targetDate || '-'}</td>
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
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">학생 설정 목표</h3>
                  <div className="border border-black/[0.04] dark:border-white/10 rounded-2xl p-4 bg-white dark:bg-[#1c1c1e] space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[250px]">
                    {analysisData.goals.length === 0 ? (
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-8 text-center">등록된 학습 목표가 없습니다.</p>
                    ) : (
                      analysisData.goals.map((g, i) => (
                        <div key={i} className="text-xs leading-relaxed border-b border-black/[0.01] dark:border-white/[0.06] pb-2 last:border-0 last:pb-0">
                          <span className="font-semibold text-[#0071E3] mr-1.5">{g.studentName}</span>
                          <span className="text-slate-900 dark:text-slate-100">{g.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 피드백(상담 기록) 목록 */}
                <div className="space-y-2 flex flex-col">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">관련 피드백 (상담 기록)</h3>
                  <div className="border border-black/[0.04] dark:border-white/10 rounded-2xl p-4 bg-white dark:bg-[#1c1c1e] space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[250px]">
                    {analysisData.feedbacks.length === 0 ? (
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-8 text-center">상담 기록 중 언급된 피드백이 없습니다.</p>
                    ) : (
                      analysisData.feedbacks.map((f, i) => (
                        <div key={i} className="text-xs border-b border-black/[0.02] dark:border-white/[0.06] pb-2.5 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-semibold">
                            <span>{f.studentName} · {f.date}</span>
                            <span>{f.manager} 코멘터</span>
                          </div>
                          <p className="text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">{f.content}</p>
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
