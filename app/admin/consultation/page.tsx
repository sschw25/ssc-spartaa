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
  LayoutGrid, Table, RefreshCw
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
        <p className="text-sm text-[#86868B]">?ÅÎã¥?ºÏ? Î°úÎìú Ï§?..</p>
      </div>
    }>
      <ConsultationContent />
    </Suspense>
  );
}

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

  // Í≤Ä??& ?ÑÌÑ∞ ?ÅÌÉú
  const [searchTerm, setSearchTerm] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [campusFilterStorageKey, setCampusFilterStorageKey] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'consultation' | 'behind'>('all');
  const [dashboardTab, setDashboardTab] = useState('cards');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [progressSort, setProgressSort] = useState<'shortage' | 'status' | 'name'>('shortage');

  // 300Î™? ?ÄÎπ??êÏßÑ???åÎçîÎß???Î≥¥Í∏∞)
  const PAGE_SIZE = 50;
  const [studentLimit, setStudentLimit] = useState(PAGE_SIZE);
  const [progressLimit, setProgressLimit] = useState(PAGE_SIZE);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ?îÎ∞î?¥Ïä§ ?êÎèô?Ä???Ä?¥Î®∏ & ÏµúÏã† ?ÅÌÉú Ref Í¥ÄÎ¶?  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const studentsRef = useRef<Student[]>([]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // Í≤Ä???ÑÌÑ∞/?ïÎ†¨??Î∞îÎÄåÎ©¥ "??Î≥¥Í∏∞" ?ÑÏ†Å??Ï¥àÍ∏∞?îÌï¥ ?ÅÏúÑ Í≤∞Í≥ºÎ∂Ä??Î≥¥Ïù¥Í≤?  useEffect(() => {
    setStudentLimit(PAGE_SIZE);
    setProgressLimit(PAGE_SIZE);
  }, [searchTerm, campusFilter, quickFilter, progressSort]);

  // Î™®Îã¨ ?úÏñ¥ ?ÅÌÉú
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // 1. ?∏Ï¶ù Ï≤¥ÌÅ¨
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
        // ?∏Ï¶ù ?±Í≥µ ???∞Ïù¥??Î°úÎìú
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

  // 2. ?åÎùºÎØ∏ÌÑ∞ Ï≤òÎ¶¨
  useEffect(() => {
    if (filterParam) {
      if (filterParam === 'consultation') {
        setQuickFilter('consultation');
        setDashboardTab('cards');
      } else if (filterParam === 'behind') {
        setQuickFilter('behind');
        setDashboardTab('db');
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

  // 3. ?ôÏÉù ?∞Ïù¥??Î°úÎìú
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
        toast.error('?ôÏÉù ?∞Ïù¥?∞Î? Í∞Ä?∏Ïò§?????§Ìå®?àÏäµ?àÎã§.');
      }
    } catch (err) {
      toast.error('?§Ìä∏?åÌÅ¨ ?êÎü¨Í∞Ä Î∞úÏÉù?àÏäµ?àÎã§.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Î°úÍ∑∏?ÑÏõÉ
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/admin/auth/logout', { method: 'POST' });
      if (res.ok) {
        toast.success('Î°úÍ∑∏?ÑÏõÉ ?òÏóà?µÎãà??');
        router.replace('/admin');
      }
    } catch (err) {
      toast.error('Î°úÍ∑∏?ÑÏõÉ ?§Ìå®');
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

  const handleQuickFilterChange = (filter: 'all' | 'consultation' | 'behind') => {
    setQuickFilter(filter);
  };

  const handleDashboardTabChange = (tab: string) => {
    setDashboardTab(tab);
  };

  const handleOpenStudentDetail = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    if (!target) return;
    openStudent(target, {
      onUpdate: (updated) => {
        setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s));
      },
      onDelete: (id) => {
        setStudents((prev) => prev.filter((s) => s.id !== id));
      },
      allStudents: students,
    });
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

  // 5. ÏßÑÎèÑ???åÏù¥Î∏???Ï°∞Ï†à??API ?∏Ï∂ú
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

    // Î°úÏª¨ ?ÅÌÉú Ï¶âÍ∞Å Î∞òÏòÅ (Optimistic UI)
    setStudents(prev => prev.map(s => s.id === studentId ? updatedStudent : s));
    setProgressDrafts(prev => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });

    if (debounceTimersRef.current[studentId]) {
      clearTimeout(debounceTimersRef.current[studentId]);
    }

    // 0.5Ï¥??îÎ∞î?¥Ïä§ ?ÄÍ∏???Íµ¨Í? ?úÌä∏??ÏµúÏ¢Ö ?∞Ïù¥???ÑÏÜ°
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
          toast.error('Íµ¨Í? ?úÌä∏ ÏßÑÎèÑ ?ôÍ∏∞?îÏóê ?§Ìå®?àÏäµ?àÎã§.');
          loadStudents(); // ?§Ìå® ??Î°§Î∞±
        }
      } catch (err) {
        toast.error('?§Ìä∏?åÌÅ¨ ?êÎü¨Î°?Íµ¨Í? ?úÌä∏ ?ôÍ∏∞?îÏóê ?§Ìå®?àÏäµ?àÎã§.');
        loadStudents();
      }
    }, 500);
  };

  // ?∞Ïù¥??Í∞ÄÍ≥?Î∞??µÍ≥Ñ Í≥ÑÏÇ∞
  const campusScopedStudents = students.filter(s => campusFilter === 'all' || s.campus === campusFilter);
  const selectedCampusLabel = campusFilter === 'all' ? '?ÑÏ≤¥ Ï∫†Ìçº?? : getCampusLabel(campusFilter);
  
  // ?§Îäò ?ÅÎã¥???àÏ†ï?òÏóàÍ±∞ÎÇò ÏßÄ???ôÏÉù??  const todayStr = new Date().toISOString().split('T')[0];
  const pendingConsultationStudents = campusScopedStudents.filter(s => {
    if (!s.nextConsultationDate) return false;
    return s.nextConsultationDate <= todayStr;
  });

  // ÏßÑÎèÑ Í¥ÄÎ¶???™© ?®Ïùº ?åÏä§ (Í≥ºÎ™© Í∏∞Î∞ò)
  const allProgressItems = getManagedProgressItems(campusScopedStudents);

  function getCampusLabel(val: string) {
    switch(val) {
      case 'wonju': return '?êÏ£º';
      case 'chuncheon': return 'Ï∂òÏ≤ú';
      case 'chungju': return 'Ï∂©Ï£º';
      default: return 'Í∏∞Ì?';
    }
  }

  // Ï∫†Ìçº?§Îäî Î∂ÑÎ•ò(?ùÎ≥Ñ)?©Ïù¥???òÎ???Ï¥àÎ°ù=?ëÌò∏/?åÎûë=?ïÎ≥¥)Í≥?Î∂ÑÎ¶¨??Ï§ëÎ¶Ω ?§Ì??ºÎ°ú ?µÏùº.
  // ?ùÎ≥Ñ?Ä Î±ÉÏ? ?çÏä§???êÏ£º/Ï∂òÏ≤ú/Ï∂©Ï£º)Í∞Ä ?¥Îãπ?òÎ©∞, ???ÑÎ∞ò??Ï∫†Ìçº???úÍ∏∞(?åÏÉâ)?Ä???ºÏπò.
  const getCampusBadgeColor = (_val: string) => 'bg-[#F5F5F7] text-[#86868B] border-black/[0.06]';

  const getStudentSubjectSummaries = (student: Student) => {
    const subjects = student.subjects && student.subjects.length > 0
      ? student.subjects
      : [{
          id: 'fallback',
          name: 'Í∏∞Î≥∏',
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
            unit: 'Í∞?,
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

  // Í≤Ä??Î∞??ÑÌÑ∞ÎßÅÎêú ?ôÏÉù Î™©Î°ù
  const filteredStudents = campusScopedStudents.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesQuickFilter = true;
    if (quickFilter === 'consultation') {
      matchesQuickFilter = pendingConsultationStudents.some(target => target.id === s.id);
    } else if (quickFilter === 'behind') {
      const studentProgressItems = allProgressItems.filter(item => item.studentId === s.id);
      matchesQuickFilter = studentProgressItems.some(item => item.status === 'behind');
    }
    
    return matchesSearch && matchesQuickFilter;
  });

  // ?ÅÌÉú ?∞ÏÑ†?úÏúÑ (Î∂ÄÏ°???ÏßÑÌñâÏ§???Ï∂©Ï°± ??Í≥ÑÌöç?ÜÏùå)
  const statusRank: Record<string, number> = { behind: 0, 'on-track': 1, ahead: 2, 'no-plan': 3 };

  // ?ÑÌÑ∞Îß?+ ?ïÎ†¨???ÑÏ≤¥ ÍµêÏû¨ ÏßÑÎèÑ ?ÑÏù¥??  const filteredProgressItems = allProgressItems
    .filter(item => {
      const matchesSearch = item.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.title.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesQuickFilter = true;
      if (quickFilter === 'behind') {
        matchesQuickFilter = item.status === 'behind';
      } else if (quickFilter === 'consultation') {
        matchesQuickFilter = pendingConsultationStudents.some(target => target.id === item.studentId);
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
      case 'behind': return 'Î∂ÄÏ°?;
      case 'ahead': return 'Ï∂©Ï°±';
      case 'on-track': return 'ÏßÑÌñâÏ§?;
      default: return 'Í≥ÑÌöç ?ÜÏùå';
    }
  };

  return (
    <div className="admin-fluid-ui min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans selection:bg-black/10">
      
      {/* Navbar */}
      <AdminTopNav
        title="?ÅÎã¥?ºÏ? Î∞?ÏßÑÎèÑ Í¥ÄÎ¶?
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '?ÑÏ≤¥' : getCampusLabel(c) }))}
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
              title="Í≤Ä??
            >
              <Search className="w-4 h-4 md:mr-1.5 text-[#86868B]" />
              <span className="hidden md:inline font-bold">Í≤Ä??/span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadStudents}
              className="admin-fit-button rounded-2xl border-black/[0.05] hover:bg-[#F5F5F7] text-xs h-9.5 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-premium"
              title="?àÎ°úÍ≥†Ïπ®"
            >
              <RefreshCw className={`w-3.5 h-3.5 md:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline font-bold">?àÎ°úÍ≥†Ïπ®</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              className="admin-fit-button text-red-600 hover:text-red-700 hover:bg-red-50 rounded-2xl text-xs h-9.5 px-3 transition-premium"
              title="Î°úÍ∑∏?ÑÏõÉ"
            >
              <LogOut className="w-4 h-4 mr-1.5 text-red-500" />
              <span className="hidden sm:inline font-bold">Î°úÍ∑∏?ÑÏõÉ</span>
            </Button>
          </>
        }
      />

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        
        {/* ?ÑÌÑ∞ Î∞?Í≤Ä??Î∞?*/}
        <div className="admin-fit-box flex flex-col gap-3.5 bg-white p-5 rounded-2xl border border-black/[0.05] shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <div className="relative flex-1 max-w-md admin-mobile-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
              <Input
                ref={searchInputRef}
                placeholder="?òÍ∞ï???¥Î¶Ñ ?êÎäî ÍµêÏû¨Î™ÖÏùÑ ?ÖÎ†•??Ï£ºÏÑ∏??"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-xl border-black/[0.08] text-xs h-10 bg-[#F5F5F7]"
              />
            </div>

            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="admin-fit-button rounded-xl bg-[#1D1D1F] hover:bg-[#323236] text-white text-xs h-10 px-4 md:px-5 font-bold shadow-sm flex items-center justify-center shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              ?†Í∑ú ?êÏÉù ?±Î°ù
            </Button>
          </div>

          <div className="h-px bg-black/[0.04] my-0.5" />

          {/* ?ÑÌÑ∞ ?†ÌÉù ?ÅÏó≠ (Ï∫†Ìçº???ÑÌÑ∞ + ???ÑÌÑ∞) */}
          <div className="flex flex-wrap items-center gap-5 text-xs">
            {/* Ï∫†Ìçº???ºÌÑ∞) ?ÑÌÑ∞ */}
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-[#86868B] shrink-0">Ï∫†Ìçº??/span>
              <div className="flex items-center bg-[#F5F5F7] p-1 rounded-xl border border-black/[0.04] shrink-0">
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
                    {c === 'all' ? '?ÑÏ≤¥' : getCampusLabel(c)}
                  </Button>
                ))}
              </div>
            </div>

            {/* ???ÑÌÑ∞ (?ÅÎã¥/ÏßÑÎèÑ) */}
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-[#86868B] shrink-0">?ÅÌÉú ?ÑÌÑ∞</span>
              <div className="flex items-center bg-[#F5F5F7] p-1 rounded-xl border border-black/[0.04] shrink-0">
                <Button
                  variant={quickFilter === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('all')}
                  className={`h-7.5 rounded-lg px-3 text-[11px] font-bold transition-premium ${
                    quickFilter === 'all' ? 'bg-white hover:bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'
                  }`}
                >
                  ?ÑÏ≤¥
                </Button>
                <Button
                  variant={quickFilter === 'consultation' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('consultation')}
                  className={`h-7.5 rounded-lg px-3 text-[11px] font-bold transition-premium ${
                    quickFilter === 'consultation' ? 'bg-white hover:bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'
                  }`}
                >
                  ?ÅÎã¥ ?Ä??                </Button>
                <Button
                  variant={quickFilter === 'behind' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleQuickFilterChange('behind')}
                  className={`h-7.5 rounded-lg px-3 text-[11px] font-bold transition-premium ${
                    quickFilter === 'behind' ? 'bg-white hover:bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'
                  }`}
                >
                  ÏßÑÎèÑ Î∂ÄÏ°?                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ?ÄÍ∏∞ÏöîÏ≤??®ÎÑê: ?µÌïÑ?∞Í? ?ÅÎã¥/ÏßÑÎèÑ ?ÑÏö©?¥Î©¥ ?®Í≤® Í¥Ä???ÜÎäî ?∞Ïù¥???∏Ï∂ú Î∞©Ï? */}
        {quickFilter === 'all' && (
          <PendingChangeRequestsPanel
            students={campusScopedStudents}
            getCampusLabel={getCampusLabel}
            onOpenStudent={handleOpenStudentDetail}
            description={`${selectedCampusLabel} Í∏∞Ï? ?ôÏäµ Î≥ÄÍ≤? Î∞òÏ∞®/?¥Í?, Í±¥Ïùò?¨Ìï≠ ?ÄÍ∏??îÏ≤≠?ÖÎãà?? Î∞îÎ°ú ?¥Î©¥ Í∏∞Ï°¥ ?µÎ? UIÍ∞Ä ?àÎäî ?ôÏÉù ?ÅÏÑ∏ ?úÌä∏Î°??¥Îèô?©Îãà??`}
          />
        )}

        {/* Î©îÏù∏ ?Ä?úÎ≥¥????Î∂ÑÍ∏∞ */}
        {loading ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-[#86868B]">?§Îßà???úÌä∏ ?ïÎ≥¥ Î∂àÎü¨?§Îäî Ï§?..</p>
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
                  <span className="hidden sm:inline">?êÏÉùÎ≥??ôÏäµ Í¥ÄÎ¶?/span>
                  <span className="sm:hidden">?êÏÉù</span>
                </TabsTrigger>
                <TabsTrigger
                  value="db"
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <SlidersHorizontal className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">ÍµêÏû¨/Í∞ïÏùò ÏßÑÎèÑ Í¥ÄÎ¶?/span>
                  <span className="sm:hidden">ÏßÑÎèÑ</span>
                </TabsTrigger>
                <TabsTrigger
                  value="calendar"
                  className="admin-fit-button text-sm font-bold !rounded-full border border-transparent data-[state=active]:border-black/[0.06] data-[state=active]:!bg-[#1D1D1F] data-[state=active]:!text-white data-[state=active]:shadow-sm px-4 py-2 h-10 w-full"
                >
                  <Calendar className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">?ÅÎã¥ Ï∫òÎ¶∞??/span>
                  <span className="sm:hidden">Ï∫òÎ¶∞??/span>
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
                    ?ÑÌÑ∞ ?¥Ï†ú
                  </Button>
                )}
                <span className="admin-fit-caption text-[#86868B] font-semibold">
                  {quickFilter === 'consultation' ? '?ÅÎã¥ ?Ä?? ' : quickFilter === 'behind' ? 'Î∂ÄÏ°?ÏßÑÎèÑ: ' : 'Í≤Ä??Í≤∞Í≥º: '}
                  {quickFilter === 'behind' ? filteredProgressItems.length : filteredStudents.length}
                  {quickFilter === 'behind' ? 'Í±? : 'Î™?}
                </span>
              </div>
            </div>

            {/* TAB CONTENT 1: ?òÍ∞ï?ùÎ≥Ñ ?Ä?úÎ≥¥??Ïπ¥Îìú */}
            <TabsContent value="cards" className="outline-none space-y-4">
              
              {/* Î≥¥Í∏∞ Î™®Îìú ?†Í? (Ïπ¥Îìú??/ ?úÌòï) */}
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
                    Ïπ¥Îìú??                  </Button>
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
                    Í∞ÑÎûµ??(??
                  </Button>
                </div>
              </div>

              {filteredStudents.length === 0 ? (
                <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
                  Í≤Ä??Ï°∞Í±¥??ÎßûÎäî ?êÏÉù???ÜÏäµ?àÎã§.
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
                                <span>{student.manager || '?¥Îãπ ÏΩîÏπò'}</span>
                                {(() => {
                                  const todayMin = getStudentTodayTotalStudyTimeMin(student);
                                  if (todayMin <= 0) return null;
                                  const h = Math.floor(todayMin / 60);
                                  const m = Math.round(todayMin % 60);
                                  return (
                                    <>
                                      <span className="w-1 h-1 rounded-full bg-[#86868B]/40"></span>
                                      <span className="text-[#0071E3] font-bold">?§Îäò {h > 0 ? `${h}?úÍ∞Ñ ` : ''}{m}Î∂??àÏÉÅ</span>
                                    </>
                                  );
                                })()}
                              </p>
                            </div>
                            <ChevronRight className="admin-fit-icon w-4 h-4 text-[#86868B]" />
                          </div>

                          {/* Í≥ºÎ™©Î≥??ÑÏû¨ ?ôÏäµ ?êÎ¶Ñ */}
                          <div className="space-y-2.5 pt-2 border-t border-black/[0.03]">
                            {totalItems === 0 ? (
                              <p className="admin-fit-caption text-[#86868B] italic">ÏßÑÌñâ Ï§ëÏù∏ ÍµêÏû¨/?∏Í∞ï???ÜÏäµ?àÎã§.</p>
                            ) : (
                              <div className="space-y-2">
                                {subjectSummaries.map((summary) => (
                                  <div key={summary.id} className="rounded-lg bg-[#F5F5F7]/70 p-2.5">
                                    <div className="admin-fit-row flex items-center justify-between gap-2">
                                      <span className="admin-fit-text admin-fit-caption font-black text-[#1D1D1F]">{summary.name}</span>
                                      <span className="admin-fit-caption text-[#86868B] shrink-0">
                                        {summary.periodStart ? `${summary.periodStart.substring(5, 10)}~` : ''}
                                        {summary.completedCount > 0 ? ` ?ÑÎ£å ${summary.completedCount}` : ' ÏßÑÌñâÏ§?}
                                      </span>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                      {summary.activeItems.length === 0 ? (
                                        <p className="admin-fit-caption text-emerald-600 font-bold">?ÑÏû¨ ÏßÑÌñâ ??™© ?ÜÏùå ¬∑ ?ÑÎ£å ?ïÎ¶¨ ?ÑÏöî</p>
                                      ) : (
                                        summary.activeItems.map((item) => (
                                          <div key={item.id} className="space-y-1">
                                            <div className="admin-fit-row flex items-center justify-between gap-2">
                                              <span className="admin-fit-text admin-fit-caption font-semibold text-[#434345]">
                                                {item.type === 'book' ? '?ìö' : '?íª'} {item.title}
                                              </span>
                                              <span className={`admin-fit-caption font-bold shrink-0 ${item.type === 'book' ? 'text-[#0071E3]' : 'text-[#0071E3]'}`}>
                                                ?ÑÏû¨ {item.current}/{item.total}{item.unit}
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
                                                {item.startDate ? `${item.startDate.substring(5, 10)}~` : 'Í∏∞Í∞Ñ ÎØ∏Ï†ï'}
                                                {item.targetDate ? item.targetDate.substring(5, 10) : 'ÏßÑÌñâÏ§?}
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
                                          ?ÑÎ£å: {summary.completedItems.map(item => item.title).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {totalItems > subjectSummaries.reduce((sum, summary) => sum + summary.activeItems.length + summary.completedCount, 0) && (
                                  <p className="admin-fit-text admin-fit-caption text-[#86868B] font-medium">Ï∂îÍ? ?ôÏäµ ??™©?????àÏäµ?àÎã§.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ?§Ïùå ?ÅÎã¥???ïÎ≥¥ */}
                        <div className="admin-fit-row mt-4 pt-3.5 border-t border-black/[0.03] flex justify-between items-center gap-2">
                          <span className="admin-fit-caption text-[#86868B] shrink-0">?§Ïùå ?ÅÎã¥??/span>
                          {student.nextConsultationDate ? (
                            <span className={`admin-fit-text admin-fit-caption font-bold px-2 py-0.5 rounded-md ${student.nextConsultationDate <= todayStr ? 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse-slow' : 'bg-[#F5F5F7] text-[#1D1D1F]'}`}>
                              ?ìÖ {student.nextConsultationDate}
                            </span>
                          ) : (
                            <span className="admin-fit-text admin-fit-caption text-[#86868B] italic">?ÅÎã¥??ÎØ∏Ï???/span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ??Î∑?(Í∞ÑÎûµ?? */
                <div className="bg-white border border-black/[0.05] rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-black/[0.08] bg-[#F5F5F7] text-[#86868B] font-bold">
                          <th className="p-3.5 pl-6">?êÏÉùÎ™?/th>
                          <th className="p-3.5">Ï∫†Ìçº??/th>
                          <th className="p-3.5">?¥Îãπ ÏΩîÏπò</th>
                          <th className="p-3.5">ÏßÑÌñâ Ï§ëÏù∏ ?ôÏäµ (Í≥ºÎ™©Î≥??ÑÌô©)</th>
                          <th className="p-3.5 text-center">?§Ïùå ?ÅÎã¥??/th>
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
                              <td className="p-3.5 text-[#434345]">
                                <div>{student.manager || '?¥Îãπ ÏΩîÏπò'}</div>
                                <div className="text-[10px] text-[#86868B] mt-0.5 flex flex-wrap gap-1 items-center">
                                  {(() => {
                                    const todayMin = getStudentTodayTotalStudyTimeMin(student);
                                    if (todayMin <= 0) return null;
                                    const h = Math.floor(todayMin / 60);
                                    const m = Math.round(todayMin % 60);
                                    return (
                                      <span className="bg-[#0071E3]/10 text-[#0071E3] px-1.5 py-0.5 rounded text-[9px] font-bold">
                                        ?§Îäò {h > 0 ? `${h}h ` : ''}{m}m
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="p-3.5 min-w-[280px]">
                                {totalItems === 0 ? (
                                  <span className="text-[#86868B] italic">ÏßÑÌñâ Ï§ëÏù∏ ÍµêÏû¨/?∏Í∞ï ?ÜÏùå</span>
                                ) : (
                                  <div className="space-y-1.5">
                                    {subjectSummaries.map((summary) => (
                                      <div key={summary.id} className="text-[11px] flex flex-wrap items-center gap-x-2">
                                        <span className="font-bold text-[#1D1D1F] bg-[#F5F5F7] px-1.5 py-0.5 rounded text-[10px]">{summary.name}</span>
                                        {summary.activeItems.length === 0 ? (
                                          <span className="text-emerald-600 font-bold">?ÑÎ£å ?ïÎ¶¨ ?ÑÏöî</span>
                                        ) : (
                                          summary.activeItems.map((item, idx) => (
                                            <span key={item.id} className="text-[#434345] inline-flex items-center gap-1">
                                              {idx > 0 && <span className="text-black/10">|</span>}
                                              <span className="text-[10px]">{item.type === 'book' ? '?ìö' : '?íª'}</span>
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
                                  <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] inline-block ${student.nextConsultationDate <= todayStr ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-[#F5F5F7] text-[#1D1D1F]'}`}>
                                    ?ìÖ {student.nextConsultationDate}
                                  </span>
                                ) : (
                                  <span className="text-[#86868B] italic">?ÅÎã¥??ÎØ∏Ï???/span>
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

              {/* ??Î≥¥Í∏∞ (?ôÏÉù Î™©Î°ù) */}
              {filteredStudents.length > visibleStudents.length && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStudentLimit((n) => n + PAGE_SIZE)}
                    className="rounded-full border-black/[0.08] bg-white text-xs h-9 px-5 font-bold hover:bg-[#F5F5F7]"
                  >
                    ??Î≥¥Í∏∞ ({visibleStudents.length}/{filteredStudents.length})
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB CONTENT 2: ?∏Í∞ï/ÍµêÏû¨ ÏßÑÎèÑÍ¥ÄÎ¶??ÑÏ≤¥ DB */}
            <TabsContent value="db" className="outline-none space-y-4">

              {/* ?ïÎ†¨ + Î≥¥Í∏∞ Î™®Îìú ?†Í? */}
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] shrink-0">?ïÎ†¨</span>
                  <div className="flex bg-white border border-black/[0.06] p-0.5 rounded-lg shadow-sm">
                    {([
                      { key: 'shortage', label: 'Î∂ÄÏ°±Î∂Ñ ÎßéÏ??? },
                      { key: 'status', label: '?ÅÌÉú?? },
                      { key: 'name', label: '?¥Î¶Ñ?? },
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
                    Ïπ¥Îìú??                  </Button>
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
                    Í∞ÑÎûµ??(??
                  </Button>
                </div>
              </div>

              {filteredProgressItems.length === 0 ? (
                <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-[#86868B]">
                  ?∞Ïù¥?∞Í? ?ÜÏäµ?àÎã§.
                </div>
              ) : viewMode === 'table' ? (
                <div id="progress-table-section" className="bg-white border border-black/[0.05] rounded-2xl overflow-hidden shadow-sm scroll-mt-28">
                  
                  <div className="bg-[#1D1D1F] text-white p-4.5 flex justify-between items-center">
                    <h3 className="text-xs font-bold tracking-tight">ÍµêÏû¨/Í∞ïÏùòÎ≥??§Îäò Í∏∞Ï? ÏßÑÎèÑ Í¥ÄÎ¶¨Ìëú</h3>
                    <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-wider">Managed Lines: {filteredProgressItems.length}</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-black/[0.08] bg-[#F5F5F7] text-[#86868B] font-bold">
                          <th className="p-3.5 pl-6">ÍµêÏû¨/Í∞ïÏùò</th>
                          <th className="p-3.5">?òÍ∞ï??/th>
                          <th className="p-3.5 text-center">?ÅÌÉú</th>
                          <th className="p-3.5 text-center">Î∂ÄÏ°±Î∂Ñ</th>
                          <th className="p-3.5 text-center">?§Îäò Í∏∞Ï? Í∂åÏû•</th>
                          <th className="p-3.5 text-center">?ÑÏû¨ (Ï°∞Ï†à)</th>
                          <th className="p-3.5 pr-6 text-center">?ÅÎã¥/Î™©Ìëú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProgressItems.map((item) => (
                          <tr key={`${item.studentId}_${item.itemId}`} className="border-b border-black/[0.04] hover:bg-black/[0.01] transition-colors align-middle">
                            
                            <td className="p-3.5 pl-6 font-bold text-[#1D1D1F] min-w-[240px]">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0">{item.type === 'book' ? '?ìö' : '?íª'}</span>
                                <div className="min-w-0">
                                  <p className="truncate">{item.title}</p>
                                  <p className="text-[10px] text-[#86868B] mt-1">{item.subjectName} ¬∑ Ï¥?{item.total}{item.type === 'book' ? 'p' : 'Í∞?}</p>
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
                              <p className="text-[10px] text-[#86868B] mt-1">{getCampusLabel(item.campus)} ¬∑ {item.manager || '?¥Îãπ??}</p>
                            </td>

                            <td className="p-3.5 text-center">
                              <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${getProgressStatusStyle(item.status)}`}>
                                {getProgressStatusLabel(item.status)}
                              </span>
                            </td>

                            <td className={`p-3.5 text-center font-bold ${item.shortage && item.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {item.shortage === null ? '-' : item.shortage > 0 ? `${item.shortage}${item.type === 'book' ? 'p' : 'Í∞?}` : '?ÜÏùå'}
                            </td>

                            <td className="p-3.5 text-center font-bold text-[#1D1D1F]">
                              {item.expectedToday === null ? '-' : `${item.expectedToday}${item.type === 'book' ? 'p' : 'Í∞?}`}
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
                                  <span className="text-[10px] font-bold text-[#86868B]">{item.type === 'book' ? 'p' : 'Í∞?}</span>
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
                                <p className="text-[10px]">?ÅÎã¥ {item.daysToConsultation === null ? '-' : item.daysToConsultation < 0 ? `${Math.abs(item.daysToConsultation)}??Í≤ΩÍ≥º` : `${item.daysToConsultation}???®Ïùå`}</p>
                                <p className="text-[10px] text-[#86868B]">Î™©Ìëú {item.targetDate || '-'}</p>
                              </div>
                            </td>

                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ÍµêÏû¨/Í∞ïÏùò ÏßÑÎèÑ Ïπ¥Îìú??Î∑?*/
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
                                {item.type === 'book' ? '?ìö' : '?íª'} {item.title}
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
                            <p className="text-[10px] text-[#86868B]">?¥Îãπ: {item.manager || '?¥Îãπ??}</p>
                          </div>

                          <div className="bg-[#F5F5F7] p-2.5 rounded-xl space-y-2">
                            <div className="flex justify-between items-center text-[10px] text-[#86868B]">
                              <span>?§Îäò Í∏∞Ï? Í∂åÏû•: <strong className="text-[#1D1D1F]">{item.expectedToday === null ? '-' : `${item.expectedToday}${item.type === 'book' ? 'p' : 'Í∞?}`}</strong></span>
                              <span>Î∂ÄÏ°±Î∂Ñ: <strong className={item.shortage && item.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}>{item.shortage === null ? '-' : item.shortage > 0 ? `${item.shortage}${item.type === 'book' ? 'p' : 'Í∞?}` : '?ÜÏùå'}</strong></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-black/[0.03]">
                              <div
                                className={`h-full rounded-full ${item.type === 'book' ? 'bg-[#0071E3]' : 'bg-[#0071E3]'}`}
                                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-[#86868B]">
                              <span>ÏßÑÌñâ??/span>
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
                                <span className="text-[10px] font-bold text-[#86868B]">/ {item.total}{item.type === 'book' ? 'p' : 'Í∞?}</span>
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
                          <span>?ÅÎã¥ {item.daysToConsultation === null ? '-' : item.daysToConsultation < 0 ? `${Math.abs(item.daysToConsultation)}??Í≤ΩÍ≥º` : `${item.daysToConsultation}???®Ïùå`}</span>
                          <span>Î™©Ìëú {item.targetDate || '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ??Î≥¥Í∏∞ (ÏßÑÎèÑ ??™©) */}
              {filteredProgressItems.length > visibleProgressItems.length && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setProgressLimit((n) => n + PAGE_SIZE)}
                    className="rounded-full border-black/[0.08] bg-white text-xs h-9 px-5 font-bold hover:bg-[#F5F5F7]"
                  >
                    ??Î≥¥Í∏∞ ({visibleProgressItems.length}/{filteredProgressItems.length})
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB CONTENT 3: ?ÅÎã¥ Ï∫òÎ¶∞??*/}
            <TabsContent value="calendar" className="outline-none">
              <ConsultationCalendar
                students={campusScopedStudents}
                onOpenStudent={handleOpenStudentDetail}
              />
            </TabsContent>

          </Tabs>
        )}

      </main>

      {/* ?†Í∑ú ?ôÏÉù Ï∂îÍ? Î™®Îã¨ */}
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
