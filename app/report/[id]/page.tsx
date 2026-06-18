'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Tv, Calendar, FileText, Printer, MessageSquare, AlertCircle, CheckCircle2, Clock, LayoutDashboard, Sparkles, Award, User, Target } from 'lucide-react';
import { Student, DetailedPlan } from '@/lib/types/student';
import {
  MaterialBenchmarkMap,
  formatPaceComparison,
  getMaterialBenchmark,
  getMaterialDailyPace,
} from '@/lib/material-benchmark';
import { STUDY_TIME_SLOTS, getStudyTimeSlot } from '@/lib/academy-timetable';
import { getGradeChartData, getGradeSubjects } from '@/lib/grade-chart';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { StudyStatsCard } from '@/components/report/study-stats-card';

export default function StudentReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = params.id as string;
  const audience = searchParams.get('audience') === 'student' ? 'student' : 'parent';
  const isStudentReport = audience === 'student';
  const isParentReport = audience === 'parent';

  const [student, setStudent] = useState<Student | null>(null);
  const [materialBenchmarks, setMaterialBenchmarks] = useState<MaterialBenchmarkMap>({});
  const [studyStats, setStudyStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visiblePlanWeeks, setVisiblePlanWeeks] = useState(1);

  useEffect(() => {
    setMounted(true);
    async function loadReport() {
      try {
        const res = await fetch(`/api/report/${studentId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setStudent(json.data);
            setMaterialBenchmarks(json.materialBenchmarks || {});
            setStudyStats(json.studyStats || null);
          } else {
            setError(true);
          }
        } else {
          setError(true);
        }
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (studentId) {
      loadReport();
    }
  }, [studentId]);

  const getCampusLabel = (val: string) => {
    switch(val) {
      case 'wonju': return '원주 캠퍼스';
      case 'chuncheon': return '춘천 캠퍼스';
      case 'chungju': return '충주 캠퍼스';
      default: return '학습 센터';
    }
  };

  // 인쇄 대화 상자 열기
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-9 h-9 text-[#0071E3] animate-spin mb-4" />
        <p className="text-xs text-[#86868B] font-medium tracking-tight">결과 리포트 카드 불러오는 중...</p>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center font-sans px-4">
        <div className="text-center space-y-4 max-w-md p-8 bg-white rounded-3xl border border-black/[0.04] shadow-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold tracking-tight text-[#1D1D1F]">리포트를 불러올 수 없습니다.</h2>
          <p className="text-xs text-[#86868B] leading-relaxed">
            리포트 공유 주소가 올바르지 않거나, 삭제된 학생일 수 있습니다. 학원 관리자에게 다시 문의해 주시기 바랍니다.
          </p>
        </div>
      </div>
    );
  }

  const chartData = getGradeChartData(student.grades);
  const gradeSubjects = getGradeSubjects(student.grades);

  const getExpectedAmountFromPlans = (plans?: DetailedPlan[]) => {
    if (!plans || plans.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    const currentPlan = plans.find((plan) => plan.startDate <= today && today <= plan.endDate);
    const plan = currentPlan || plans.find((item) => item.endDate >= today) || plans[plans.length - 1];
    if (!plan?.rangeText) return null;
    const values = plan.rangeText.match(/\d+/g)?.map(Number) || [];
    return values.length > 0 ? values[values.length - 1] : null;
  };

  const getPlanStatus = (current: number, expected: number | null) => {
    if (expected === null) return null;
    if (current === expected) return '계획대로 진행';
    if (current > expected) return '계획보다 빠름';
    return current === 0 ? '진도 정체' : '계획보다 느림';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case '계획보다 빠름':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case '계획대로 진행':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '계획보다 느림':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case '진도 정체':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };


  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const doesPlanStartInRange = (plan: DetailedPlan, start: Date, end: Date) => {
    const planStart = new Date(plan.startDate);
    planStart.setHours(0, 0, 0, 0);
    return start <= planStart && planStart <= end;
  };

  const collectPlans = (start: Date, end: Date) => {
    return (student.subjects || []).flatMap((subject) => [
      ...(subject.books || []).flatMap((book) =>
        (book.detailedPlans || [])
          .filter((plan) => doesPlanStartInRange(plan, start, end))
          .map((plan) => ({ ...plan, subject: subject.name, title: book.title, type: '교재' }))
      ),
      ...(subject.lectures || []).flatMap((lecture) =>
        (lecture.detailedPlans || [])
          .filter((plan) => doesPlanStartInRange(plan, start, end))
          .map((plan) => ({ ...plan, subject: subject.name, title: lecture.name, type: '인강' }))
      ),
    ]);
  };

  const weeklyPlans = collectPlans(weekStart, weekEnd);
  const monthlyPlans = collectPlans(monthStart, monthEnd);

  // 오늘 기준 1개월치 상세 계획 필터링 (지난 1주 ~ 향후 3주, 약 4~5주 분량)
  const getOneMonthPlans = (plans: DetailedPlan[] | undefined) => {
    if (!plans || plans.length === 0) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startLimit = new Date(today);
    startLimit.setDate(today.getDate() - 7);
    const endLimit = new Date(today);
    endLimit.setDate(today.getDate() + 24);

    const filtered = plans.filter(plan => {
      const pStart = new Date(plan.startDate);
      const pEnd = new Date(plan.endDate);
      pStart.setHours(0, 0, 0, 0);
      pEnd.setHours(0, 0, 0, 0);
      return pStart <= endLimit && pEnd >= startLimit;
    });

    if (filtered.length === 0) {
      return plans.slice(-4);
    }
    return filtered;
  };

  // 모든 상세 계획에서 가장 늦은 종료예정일 탐색
  const allEndDates = (student?.subjects || []).flatMap(sub => [
    ...(sub.books || []).flatMap(b => (b.detailedPlans || []).map(p => p.endDate)),
    ...(sub.lectures || []).flatMap(l => (l.detailedPlans || []).map(p => p.endDate))
  ]);

  const finishDateStr = allEndDates.length > 0
    ? allEndDates.reduce((max, cur) => cur > max ? cur : max, allEndDates[0])
    : null;

  let nextConsultationText = '추후 안내';
  if (finishDateStr) {
    const finishDate = new Date(finishDateStr);
    const startDate = new Date(finishDate);
    startDate.setDate(finishDate.getDate() - 7);

    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    nextConsultationText = `${formatDate(startDate)} ~ ${finishDateStr} 예정`;
  }

  const studyTimeSlots = [
    ...STUDY_TIME_SLOTS.map((slot) => ({
      key: slot.key,
      label: slot.displayLabel,
      timeRange: slot.timeRange,
      periodLabel: slot.periodLabel,
      description: slot.description,
    })),
    { key: '', label: '미지정', timeRange: '', periodLabel: '시간대 미지정', description: '아직 학원 시간표 구간이 배정되지 않았습니다.' },
  ] as const;
  const weekDaySlots = [
    { key: 'mon', label: '월요일' },
    { key: 'tue', label: '화요일' },
    { key: 'wed', label: '수요일' },
    { key: 'thu', label: '목요일' },
    { key: 'fri', label: '금요일' },
    { key: 'sat', label: '토요일' },
    { key: 'sun', label: '일요일' },
  ] as const;

  // 요일별 은은한 캡슐 색상 헬퍼
  const planWeekOptions = [1, 2, 3, 4, 5, 6, 7, 8];
  const studyTimeOrder: Record<string, number> = { morning: 0, afternoon: 1, night: 2, '': 3 };
  const studyTimeLabels: Record<string, string> = {
    morning: getStudyTimeSlot('morning')?.displayLabel || '오전',
    afternoon: getStudyTimeSlot('afternoon')?.displayLabel || '오후',
    night: getStudyTimeSlot('night')?.displayLabel || '야간',
    '': '미지정',
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatShortDate = (date: Date) =>
    `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

  const getDailyAmountLabel = (plan: DetailedPlan) => {
    const amount = plan.dailyAmount || Math.ceil(plan.targetAmount / 6);
    const range = plan.rangeText || '';
    const rangeWithoutPass = range.replace(/\d+회독/g, '');
    const unit =
      range.includes('문제') ? '문제' :
      range.includes('강') ? '강' :
      range.toLowerCase().includes('p') ? 'p' :
      rangeWithoutPass.includes('회') ? '회' :
      '';
    return `하루 ${amount}${unit}`;
  };

  const isPlanActiveOnDate = (plan: DetailedPlan, dateKey: string) =>
    plan.startDate <= dateKey && dateKey <= plan.endDate;

  const weeklyDailyPlans = Array.from({ length: visiblePlanWeeks }, (_, weekOffset) => {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() + weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const days = weekDaySlots.map((day, dayIndex) => {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + dayIndex);
      const dateKey = formatDateKey(currentDate);

      const entries = (student.subjects || [])
        .filter((subject) => {
          const days = subject.studyDays || [];
          return days.length === 0 || days.includes(day.key);
        })
        .sort((a, b) => {
          const timeDiff = studyTimeOrder[a.studyTime || ''] - studyTimeOrder[b.studyTime || ''];
          return timeDiff || a.name.localeCompare(b.name);
        })
        .flatMap((subject) => {
          const lectures = (subject.lectures || []).flatMap((lecture) =>
            (lecture.detailedPlans || [])
              .filter((plan) => isPlanActiveOnDate(plan, dateKey))
              .map((plan) => ({
                id: `${subject.id}_${lecture.id}_${plan.id}`,
                subject: subject.name,
                title: lecture.name,
                type: '강의',
                studyTime: subject.studyTime || '',
                rangeText: plan.rangeText,
                dailyLabel: getDailyAmountLabel(plan),
              }))
          );
          const books = (subject.books || []).flatMap((book) =>
            (book.detailedPlans || [])
              .filter((plan) => isPlanActiveOnDate(plan, dateKey))
              .map((plan) => ({
                id: `${subject.id}_${book.id}_${plan.id}`,
                subject: subject.name,
                title: book.title,
                type: '교재',
                studyTime: subject.studyTime || '',
                rangeText: plan.rangeText,
                dailyLabel: getDailyAmountLabel(plan),
              }))
          );
          return [...lectures, ...books];
        });

      return {
        key: day.key,
        label: day.label,
        dateLabel: formatShortDate(currentDate),
        entries,
      };
    });

    return {
      weekNumber: weekOffset + 1,
      rangeLabel: `${formatShortDate(start)} ~ ${formatShortDate(end)}`,
      days,
    };
  });

  const getSubjectColorClass = (subjectName: string) => {
    const hash = subjectName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      'bg-[#E8F1FF] text-[#0071E3] border-[#B8D7FF]',
      'bg-[#F2E8FF] text-[#862BF7] border-[#E2CBFF]',
      'bg-[#E8FFF3] text-[#10B981] border-[#BFFFD9]',
      'bg-[#FFF0E8] text-[#F56300] border-[#FFD5C2]',
      'bg-[#FFFDE8] text-[#D9A700] border-[#FFF9C2]',
      'bg-[#FFE8EC] text-[#EF4444] border-[#FFCCD4]',
    ];
    return colors[hash % colors.length];
  };

  return (
    <div className="report-page min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] py-8 md:py-16 px-4 font-sans text-[#1E293B] antialiased transition-all">
      
      {/* Print styles */}
      <style jsx global>{`
        .report-page,
        .report-page * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          @page {
            size: A4;
            margin: 10mm 10mm;
          }

          html,
          body {
            background: #FFFFFF !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          nav,
          header,
          footer,
          [data-nextjs-dev-tools],
          nextjs-portal {
            display: none !important;
          }

          .no-print {
            display: none !important;
          }

          .report-page {
            min-height: auto !important;
            background: #FFFFFF !important;
            padding: 0 !important;
          }

          .print-container {
            max-width: 190mm !important;
            width: 190mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }

          .report-paper {
            width: 100% !important;
            background: #FFFFFF !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 4mm 4mm !important;
            box-shadow: none !important;
          }

          .print-card,
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .recharts-wrapper,
          .recharts-surface {
            overflow: visible !important;
          }

          .print-week-grid {
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 2mm !important;
          }

          a {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-6 print-container">
        
        {/* 상단 컨트롤러 (인쇄 전용 - no-print) */}
        <div className="no-print flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white/80 backdrop-blur-xl p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#0071E3] animate-pulse shrink-0" />
            <div className="text-xs font-bold text-slate-500 tracking-tight truncate">
              {isStudentReport ? 'SSC SPARTA · 학생 맞춤 학습 결과 리포트' : 'SSC SPARTA · 학부모용 학습 결과 브리핑 결과지'}
            </div>
          </div>
          {isStudentReport && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-inner">
              <span className="px-2 text-[10px] font-black text-slate-500">계획</span>
              {planWeekOptions.map((week) => (
                <button
                  key={week}
                  type="button"
                  onClick={() => setVisiblePlanWeeks(week)}
                  className={`h-7 min-w-8 rounded-xl px-2 text-[10px] font-black transition-all ${
                    visiblePlanWeeks === week
                      ? 'bg-[#111827] text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {week}주
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => window.location.href = '/admin/dashboard'}
              size="sm"
              variant="outline"
              className="rounded-2xl border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 h-10 transition-all shadow-sm flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              대시보드
            </Button>
            <Button
              onClick={handlePrint}
              size="sm"
              className="rounded-2xl bg-gradient-to-r from-[#0071E3] to-[#00C7FF] hover:from-[#005DB9] hover:to-[#00A3FF] text-white text-xs font-semibold px-5 h-10 transition-all shadow-[0_4px_14px_rgba(0,113,227,0.3)] border-0 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              PDF 저장 / 리포트 출력
            </Button>
          </div>
        </div>

        {/* 결과 리포트 종이 영역 */}
        <div className="report-paper bg-white border border-slate-100 rounded-[32px] p-8 md:p-14 shadow-[0_30px_70px_rgba(15,23,42,0.06)] print-card space-y-10">
          
          {/* 1. 리포트 헤더 */}
          <div className="border-b border-slate-100 pb-8 flex flex-col md:flex-row justify-between md:items-start gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.2em] text-[#0071E3] bg-[#0071E3]/5 px-3 py-1.5 rounded-lg uppercase">
                <Sparkles className="w-3.5 h-3.5 text-[#0071E3]" />
                SSC SPARTA STUDY REPORT
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:leading-tight">
                {student.name} 원생 <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0071E3] to-[#862BF7]">{isStudentReport ? '학생용' : '학부모용'}</span> 학습 결과지
              </h1>
            </div>
            
            <div className="text-left md:text-right shrink-0 bg-slate-50/80 border border-slate-100 p-4 rounded-2xl min-w-[150px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)]">
              <span className="text-[9px] text-slate-400 font-bold block tracking-wider uppercase mb-1">발행 일자</span>
              <span className="text-xs font-bold text-slate-700">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>

          {/* 원생 메타 격자 프로필 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print-card">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0071E3]/15 to-[#0071E3]/5 text-[#0071E3] flex items-center justify-center shrink-0 shadow-sm">
                <Award className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block">소속 센터</span>
                <span className="text-xs font-black text-slate-800">{getCampusLabel(student.campus)}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#862BF7]/15 to-[#862BF7]/5 text-[#862BF7] flex items-center justify-center shrink-0 shadow-sm">
                <User className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block">담당 코치</span>
                <span className="text-xs font-black text-slate-800">{student.manager || '배정 코치 없음'}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF6B00]/15 to-[#FF6B00]/5 text-[#FF6B00] flex items-center justify-center shrink-0 shadow-sm">
                <Target className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 block">목표 시험</span>
                <span className="text-xs font-black text-slate-800 truncate block max-w-[120px]">{student.contact || '미지정'}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#10B981]/15 to-[#10B981]/5 text-[#10B981] flex items-center justify-center shrink-0 shadow-sm">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block">학습 배속</span>
                <span className="text-xs font-black text-slate-800">{student.speedMultiplier ? `${student.speedMultiplier}배속` : '1.0배속'}</span>
              </div>
            </div>
          </div>

          {/* 1-1. 학생용 다음 상담일자 안내 배너 */}
          {isStudentReport && finishDateStr && (
            <div className="p-4.5 rounded-2xl bg-gradient-to-r from-[#0071E3]/[0.04] via-transparent to-[#862BF7]/[0.04] border border-[#0071E3]/15 flex items-center justify-between gap-4 shadow-sm print:shadow-none break-inside-avoid">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0">
                  <Calendar className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 block tracking-tight uppercase">다음 예정 상담일 (종료예정일로부터 1주일이내로 안내)</span>
                  <span className="text-xs font-black text-slate-800">{nextConsultationText}</span>
                </div>
              </div>
              <div className="hidden sm:block text-[9px] text-[#0071E3] font-bold bg-[#0071E3]/10 px-2 py-0.5 rounded-md">
                대면 클리닉 상담 예정
              </div>
            </div>
          )}



          {/* 순공 시간 / 등하원 통계 */}
          <StudyStatsCard stats={studyStats} />

          {/* 2. 최근 생활 및 종합 피드백 */}
          <div className="space-y-4 print-card">
            <h3 className="text-xs font-black text-[#1D1D1F] tracking-widest uppercase flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#0071E3]" />
              학습 코칭 및 관리 위원회 최종 소견
            </h3>

            {isParentReport && (
              student.lifeComment ? (
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0071E3]/[0.03] to-[#0071E3]/[0.01] border border-[#0071E3]/15 shadow-[0_4px_20px_rgba(0,113,227,0.02)] relative overflow-hidden transition-all hover:shadow-[0_10px_30px_rgba(0,113,227,0.05)]">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0071E3]" />
                  <div className="text-[10px] text-[#0071E3] font-extrabold mb-3.5 flex items-center gap-2 tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-ping" />
                    학부모 공유용 주간 학습 종합 분석 코멘트
                  </div>
                  <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans font-medium">
                    {student.lifeComment}
                  </pre>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                  <MessageSquare className="w-6 h-6 text-slate-300" />
                  <p className="text-xs font-bold text-slate-400">표시할 학부모 공유 생활 코멘트가 아직 등록되지 않았습니다.</p>
                </div>
              )
            )}

            {isStudentReport && (
              student.studentLifeComment ? (
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#10B981]/[0.03] to-[#10B981]/[0.01] border border-[#10B981]/15 shadow-[0_4px_20px_rgba(16,185,129,0.02)] relative overflow-hidden transition-all hover:shadow-[0_10px_30px_rgba(16,185,129,0.05)]">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#10B981]" />
                  <div className="text-[10px] text-emerald-700 font-extrabold mb-3.5 flex items-center gap-2 tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
                    원생 대상 주간 맞춤형 클리닉 소견
                  </div>
                  <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans font-medium">
                    {student.studentLifeComment}
                  </pre>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                  <MessageSquare className="w-6 h-6 text-slate-300" />
                  <p className="text-xs font-bold text-slate-400">표시할 학생 공유 생활 코멘트가 아직 등록되지 않았습니다.</p>
                </div>
              )
            )}
          </div>

          {/* 2-1. 과목별 학습 시간표 */}
          {isStudentReport && (
            <div className="space-y-5 print-card">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#862BF7]" />
                  요일별 과목 배치 시간표
                </h3>
                <span className="text-[9px] font-bold text-slate-400">주 6일 스파르타 플래닝</span>
              </div>
              
              <div className="print-week-grid grid grid-cols-2 md:grid-cols-7 gap-3">
                {weekDaySlots.map(day => {
                  const subjectsInDay = (student.subjects || []).filter(subject => (subject.studyDays || []).includes(day.key));
                  const isWeekend = day.key === 'sat' || day.key === 'sun';
                  
                  return (
                    <div 
                      key={day.key} 
                      className={`p-3.5 rounded-2xl border transition-all duration-300 min-h-[105px] flex flex-col shadow-sm ${
                        isWeekend 
                          ? 'bg-slate-50/80 border-slate-100' 
                          : subjectsInDay.length > 0 
                            ? 'bg-white border-blue-100 hover:border-blue-200 hover:shadow-md' 
                            : 'bg-slate-50/30 border-slate-100'
                      }`}
                    >
                      <h4 className={`text-[10px] font-bold tracking-tight mb-2.5 ${
                        isWeekend ? 'text-slate-400' : 'text-slate-700'
                      }`}>
                        {day.label}
                      </h4>
                      {subjectsInDay.length === 0 ? (
                        <p className="text-[9px] text-slate-300 font-bold mt-auto mb-1">휴식</p>
                      ) : (
                        <div className="space-y-1.5 mt-auto">
                          {subjectsInDay.map(subject => (
                            <span 
                              key={`${day.key}_${subject.id}`} 
                              className={`text-[8px] font-extrabold px-2 py-0.5 rounded-lg border block text-center truncate shadow-sm transition-transform hover:-translate-y-0.5 ${getSubjectColorClass(subject.name)}`}
                            >
                              {subject.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 시간대 배정 뷰 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {studyTimeSlots.map(slot => {
                  const subjectsInSlot = (student.subjects || []).filter(subject => (subject.studyTime || '') === slot.key);
                  if (slot.key === '' && subjectsInSlot.length === 0) return null;
                  
                  // 시간대별 고유 스타일링 부여
                  const getSlotStyle = (key: string) => {
                    switch(key) {
                      case 'morning': return 'border-amber-100 bg-amber-50/10 hover:shadow-[0_8px_30px_rgba(245,158,11,0.04)]';
                      case 'afternoon': return 'border-blue-100 bg-blue-50/10 hover:shadow-[0_8px_30px_rgba(59,130,246,0.04)]';
                      case 'night': return 'border-indigo-100 bg-indigo-50/10 hover:shadow-[0_8px_30px_rgba(99,102,241,0.04)]';
                      default: return 'border-slate-100 bg-slate-50/10';
                    }
                  };
                  
                  return (
                    <div key={slot.key || 'none'} className={`p-5 rounded-2xl border bg-white space-y-4 shadow-sm transition-all duration-300 ${getSlotStyle(slot.key)}`}>
                      <div className="border-b border-slate-100 pb-2.5">
                        <div className="flex justify-between items-center gap-2">
                          <h4 className="text-xs font-black text-slate-800">{slot.label}</h4>
                          <span className="text-[9px] text-slate-400 font-extrabold bg-slate-100 px-2 py-0.5 rounded-full">{subjectsInSlot.length}개 과목</span>
                        </div>
                        <p className="mt-1 text-[10px] font-extrabold text-slate-500">{slot.timeRange || slot.periodLabel}</p>
                        {slot.key && (
                          <p className="mt-0.5 text-[9px] font-bold text-slate-400">{slot.periodLabel}</p>
                        )}
                      </div>
                      
                      {subjectsInSlot.length === 0 ? (
                        <p className="text-[10px] text-slate-300 font-bold py-4 text-center">배정된 학습 과목 없음</p>
                      ) : (
                        <div className="space-y-2.5">
                          {subjectsInSlot.map(subject => (
                            <div key={subject.id} className="rounded-xl bg-white border border-slate-100/80 p-3 text-[10px] shadow-sm hover:shadow transition-all">
                              <div className="flex justify-between items-center mb-1.5">
                                <p className="font-extrabold text-slate-700">{subject.name}</p>
                                <span className="text-[8px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">
                                  {(subject.books || []).length + (subject.lectures || []).length}개 자료
                                </span>
                              </div>
                              <p className="text-slate-400 text-[9px] truncate">
                                {[...(subject.books || []).map(book => book.title), ...(subject.lectures || []).map(lecture => lecture.name)].join(' · ') || '등록 학습자료 없음'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isStudentReport && (
            <div className="space-y-5 print-card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#0071E3]" />
                    {visiblePlanWeeks}주 실행 학습 계획표
                  </h3>
                  <p className="mt-1 text-[10px] font-bold text-slate-400">
                    요일별로 어떤 공부를 어떤 순서로, 하루에 어느 정도 진행할지 정리했습니다.
                  </p>
                </div>
                <span className="self-start rounded-full border border-[#0071E3]/15 bg-[#0071E3]/5 px-3 py-1 text-[10px] font-black text-[#0071E3] sm:self-auto">
                  최대 8주까지 출력 가능
                </span>
              </div>

              <div className="space-y-5">
                {weeklyDailyPlans.map((week) => (
                  <div key={week.weekNumber} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm break-inside-avoid">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{week.weekNumber}주차</p>
                        <p className="text-[10px] font-bold text-slate-400">{week.rangeLabel}</p>
                      </div>
                      <span className="rounded-xl bg-slate-50 px-2.5 py-1 text-[9px] font-black text-slate-500">
                        요일별 실행 순서
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                      {week.days.map((day) => (
                        <div key={`${week.weekNumber}_${day.key}`} className="min-h-[170px] rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-black text-slate-800">{day.label}</p>
                              <p className="text-[9px] font-bold text-slate-400">{day.dateLabel}</p>
                            </div>
                            <span className="rounded-lg bg-white px-1.5 py-0.5 text-[8px] font-black text-slate-400">
                              {day.entries.length}개
                            </span>
                          </div>

                          {day.entries.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-2 py-5 text-center text-[9px] font-bold text-slate-300">
                              계획 없음
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {day.entries.map((entry, index) => (
                                <div key={`${entry.id}_${index}`} className="rounded-xl border border-white bg-white p-2 shadow-sm">
                                  <div className="mb-1 flex items-center gap-1.5">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#111827] text-[8px] font-black text-white">
                                      {index + 1}
                                    </span>
                                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-500">
                                      {studyTimeLabels[entry.studyTime] || '미지정'}
                                    </span>
                                  </div>
                                  <p className="text-[9px] font-black text-slate-800 leading-snug">
                                    {entry.subject} · {entry.title}
                                  </p>
                                  <p className="mt-1 text-[8px] font-bold text-slate-400 leading-snug">
                                    {entry.type} / {entry.rangeText}
                                  </p>
                                  <p className="mt-1 rounded-lg bg-[#0071E3]/5 px-2 py-1 text-[8px] font-black text-[#0071E3]">
                                    {entry.dailyLabel}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2-2. 이번 주 / 이번 달 학습 계획 */}
          {isStudentReport && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-card">
              <div className="p-6 rounded-3xl border border-slate-100 bg-white space-y-4.5 shadow-sm transition-all hover:shadow-md">
                <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-3 flex items-center gap-2">
                  <span>📅</span> 이번 주 핵심 주간 학습 계획
                </h3>
                {weeklyPlans.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold py-6 text-center italic">이번 주 설정된 학습 주간 계획이 없습니다.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 print:max-h-none print:overflow-visible print:pr-0">
                    {weeklyPlans.map((plan) => (
                      <div key={`${plan.materialId}_${plan.id}_week`} className="text-[10px] p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100/50 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-center font-bold text-slate-700 mb-1">
                          <span className="truncate max-w-[190px]">{plan.subject} · {plan.title}</span>
                          <span className="text-[#0071E3] shrink-0 font-extrabold bg-[#0071E3]/5 px-2 py-0.5 rounded-lg border border-[#0071E3]/10">{plan.rangeText}</span>
                        </div>
                        <p className="text-slate-400 text-[9px] font-semibold">
                          진행 기간: {plan.startDate} ~ {plan.endDate} · 일일 목표: {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 rounded-3xl border border-slate-100 bg-white space-y-4.5 shadow-sm transition-all hover:shadow-md">
                <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-3 flex items-center gap-2">
                  <span>📈</span> 이번 달 핵심 월간 학습 계획
                </h3>
                {monthlyPlans.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold py-6 text-center italic">이번 달 설정된 월간 학습 계획이 없습니다.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 print:max-h-none print:overflow-visible print:pr-0">
                    {monthlyPlans.map((plan) => (
                      <div key={`${plan.materialId}_${plan.id}_month`} className="text-[10px] p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100/50 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-center font-bold text-slate-700 mb-1">
                          <span className="truncate max-w-[190px]">{plan.subject} · {plan.title}</span>
                          <span className="text-[#862BF7] shrink-0 font-extrabold bg-[#862BF7]/5 px-2 py-0.5 rounded-lg border border-[#862BF7]/10">{plan.weekNumber}주차</span>
                        </div>
                        <p className="text-slate-400 text-[9px] font-semibold">
                          범위: {plan.rangeText} · 일일 목표: {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. 과목별 진도율 및 학습 진척도 */}
          <div className="space-y-5 print-card">
            <h3 className="text-xs font-black text-[#1D1D1F] tracking-widest uppercase flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#862BF7]" />
              {isStudentReport ? '과목별 상세 학습 목표 및 주간 달성 스케줄러' : '과목별 학습 진도율 요약'}
            </h3>

            {!student.subjects || student.subjects.length === 0 ? (
              // 과목 정보가 없는 기존 데이터 Fallback 뷰
              (student.books.length === 0 && student.lectures.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                  <FileText className="w-7 h-7 text-slate-300" />
                  <p className="text-xs font-bold text-slate-400">현재 학습을 위해 등록된 교재/인강 정보가 없습니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 도서 진도 */}
                  <div className="space-y-4.5 p-6 rounded-3xl border border-slate-100 bg-white shadow-sm transition-all hover:shadow-md">
                    <h4 className="text-xs font-black text-slate-700 flex items-center border-b border-slate-100 pb-3">
                      <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                      교재 / 도서 진도 현황
                    </h4>
                    <div className="space-y-5">
                      {student.books.map(b => {
                        const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                        const status = getPlanStatus(b.currentPage, getExpectedAmountFromPlans(b.detailedPlans));
                        return (
                          <div key={b.id} className="space-y-2">
                            <div className="flex justify-between text-[11px] font-bold items-center">
                              <span className="truncate max-w-[190px] text-slate-600 flex items-center gap-1.5">
                                {b.title}
                                {status && (
                                  <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded ${getStatusBadgeClass(status)}`}>
                                    {status}
                                  </span>
                                )}
                              </span>
                              <span className="text-[#0071E3] font-extrabold">{b.currentPage} / {b.totalPages}p</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <div 
                                  className="bg-gradient-to-r from-[#0071E3] to-[#00C7FF] h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black shrink-0 w-8 text-right text-slate-800">{percent}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 인강 진도 */}
                  <div className="space-y-4.5 p-6 rounded-3xl border border-slate-100 bg-white shadow-sm transition-all hover:shadow-md">
                    <h4 className="text-xs font-black text-slate-700 flex items-center border-b border-slate-100 pb-3">
                      <Tv className="w-4 h-4 mr-2 text-[#862bf7]" />
                      인터넷 강의 수강 현황
                    </h4>
                    <div className="space-y-5">
                      {student.lectures.map(l => {
                        const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                        const status = getPlanStatus(l.completedLectures, getExpectedAmountFromPlans(l.detailedPlans));
                        return (
                          <div key={l.id} className="space-y-2">
                            <div className="flex justify-between text-[11px] font-bold items-center">
                              <span className="truncate max-w-[190px] text-slate-600 flex items-center gap-1.5">
                                {l.name}
                                {status && (
                                  <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded ${getStatusBadgeClass(status)}`}>
                                    {status}
                                  </span>
                                )}
                              </span>
                              <span className="text-[#862bf7] font-extrabold">{l.completedLectures} / {l.totalLectures}강</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <div 
                                  className="bg-gradient-to-r from-[#862bf7] to-[#FF6B00] h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black shrink-0 w-8 text-right text-slate-800">{percent}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // 과목별 정밀 포맷 뷰
              <div className="space-y-6">
                {student.subjects.map(sub => (
                  <div key={sub.id} className="p-6 md:p-8 rounded-[24px] border border-slate-100 bg-white space-y-6 shadow-sm hover:shadow-md transition-all break-inside-avoid">
                    {/* 과목 타이틀 */}
                    <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <span className="text-xs font-black text-slate-800 px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-2xl inline-block self-start shadow-sm tracking-wider">
                        📚 {sub.name} 과목 학습 스케줄러
                      </span>
                      {isStudentReport && sub.learningGoal && (
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100/60 px-3.5 py-1.5 rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]">
                          🎯 과목 목표: {sub.learningGoal}
                        </span>
                      )}
                    </div>

                    {/* 교재 리스트 */}
                    {sub.books.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-700 flex items-center">
                          <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                          {isStudentReport ? '교재별 진도 관리 및 세부 학습 목표' : '교재 진도 현황'}
                        </h4>
                        
                        <div className="space-y-5">
                          {sub.books.map(b => {
                            const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                            const oneMonthPlans = getOneMonthPlans(b.detailedPlans);
                            const totalPlans = oneMonthPlans.length;
                            const completedPlans = oneMonthPlans.filter(p => p.isCompleted).length;
                            const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                            const status = getPlanStatus(b.currentPage, getExpectedAmountFromPlans(b.detailedPlans));
                            const paceComparison = formatPaceComparison(
                              getMaterialDailyPace(b.detailedPlans),
                              getMaterialBenchmark(materialBenchmarks, 'book', b.title)
                            );

                            return (
                              <div key={b.id} className="p-5 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/50 to-white space-y-4 shadow-sm">
                                <div className="flex justify-between items-start flex-wrap gap-2">
                                  <div>
                                    <h5 className="text-xs font-black text-slate-700">{b.title}</h5>
                                    {b.goalDescription && (
                                      <p className="text-[10px] text-[#0071E3] font-bold mt-1.5 flex items-center gap-1">
                                        <span>🏁</span> 완독 목표: {b.goalDescription}
                                      </p>
                                    )}
                                    {isStudentReport && paceComparison && (
                                      <p className="text-[10px] text-slate-500 font-bold mt-1.5">
                                        {paceComparison}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0 flex items-center gap-2.5">
                                    {status && (
                                      <span className={`text-[9px] font-black border px-1.5 py-0.5 rounded-lg shadow-sm ${getStatusBadgeClass(status)}`}>
                                        {status}
                                      </span>
                                    )}
                                    <span className="text-xs font-bold text-slate-500">{b.currentPage} <span className="text-slate-300 font-normal">/</span> {b.totalPages}p</span>
                                    <span className="text-[9px] font-black text-white bg-gradient-to-r from-[#0071E3] to-[#00C7FF] px-2 py-0.5 rounded-lg shadow-sm">{percent}%</span>
                                  </div>
                                </div>

                                {/* 진도 프로그레스 바 (그라데이션 입체화) */}
                                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                                  <div className="bg-gradient-to-r from-[#0071E3] to-[#00C7FF] h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                                </div>

                                {/* 세부 계획 타임라인 */}
                                {isStudentReport && oneMonthPlans.length > 0 && (
                                  <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                      <span>최근 1개월 주간 학습 스케줄 ({completedPlans}/{totalPlans}주 완료)</span>
                                      <span className="text-emerald-600 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">{planPercent}% 달성률</span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                      {oneMonthPlans.map(plan => (
                                        <div 
                                          key={plan.id}
                                          className={`p-3 rounded-xl border text-[9px] flex flex-col justify-between gap-2 transition-all duration-200 hover:scale-[1.02] shadow-[0_2px_6px_rgba(0,0,0,0.005)] ${
                                            plan.isCompleted 
                                              ? 'border-emerald-100 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50' 
                                              : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                          }`}
                                        >
                                          <div className="flex justify-between items-center font-bold">
                                            <span>{plan.weekNumber}주차</span>
                                            {plan.isCompleted ? (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            ) : (
                                              <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                            )}
                                          </div>
                                          <p className="text-slate-400 font-bold tracking-tight text-[8px]">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</p>
                                          <span className="font-extrabold text-[10px] tracking-tight text-slate-700 truncate">{plan.rangeText}</span>
                                          <span className="text-[8px] font-bold text-slate-400">일일 {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 인강 리스트 */}
                    {sub.lectures.length > 0 && (
                      <div className="space-y-4 mt-6">
                        <h4 className="text-xs font-black text-slate-700 flex items-center">
                          <Tv className="w-4 h-4 mr-2 text-[#862BF7]" />
                          {isStudentReport ? '인강별 수강 스케줄 및 달성 지표' : '인강 진도 현황'}
                        </h4>

                        <div className="space-y-5">
                          {sub.lectures.map(l => {
                            const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                            const oneMonthPlans = getOneMonthPlans(l.detailedPlans);
                            const totalPlans = oneMonthPlans.length;
                            const completedPlans = oneMonthPlans.filter(p => p.isCompleted).length;
                            const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                            const status = getPlanStatus(l.completedLectures, getExpectedAmountFromPlans(l.detailedPlans));
                            const paceComparison = formatPaceComparison(
                              getMaterialDailyPace(l.detailedPlans),
                              getMaterialBenchmark(materialBenchmarks, 'lecture', l.name)
                            );

                            return (
                              <div key={l.id} className="p-5 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/50 to-white space-y-4 shadow-sm">
                                <div className="flex justify-between items-start flex-wrap gap-2">
                                  <div>
                                    <h5 className="text-xs font-black text-slate-700">{l.name}</h5>
                                    {l.goalDescription && (
                                      <p className="text-[10px] text-[#862BF7] font-bold mt-1.5 flex items-center gap-1">
                                        <span>🏁</span> 수강 목표: {l.goalDescription}
                                      </p>
                                    )}
                                    {isStudentReport && paceComparison && (
                                      <p className="text-[10px] text-slate-500 font-bold mt-1.5">
                                        {paceComparison}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0 flex items-center gap-2.5">
                                    {status && (
                                      <span className={`text-[9px] font-black border px-1.5 py-0.5 rounded-lg shadow-sm ${getStatusBadgeClass(status)}`}>
                                        {status}
                                      </span>
                                    )}
                                    <span className="text-xs font-bold text-slate-500">{l.completedLectures} <span className="text-slate-300 font-normal">/</span> {l.totalLectures}강</span>
                                    <span className="text-[9px] font-black text-white bg-gradient-to-r from-[#862BF7] to-[#A855F7] px-2 py-0.5 rounded-lg shadow-sm">{percent}%</span>
                                  </div>
                                </div>

                                {/* 진도 프로그레스 바 (인강 그라데이션) */}
                                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                                  <div className="bg-gradient-to-r from-[#862BF7] to-[#FF6B00] h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                                </div>

                                {/* 세부 계획 타임라인 */}
                                {isStudentReport && oneMonthPlans.length > 0 && (
                                  <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                      <span>최근 1개월 주간 수강 스케줄 ({completedPlans}/{totalPlans}주 완료)</span>
                                      <span className="text-emerald-600 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">{planPercent}% 달성률</span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                      {oneMonthPlans.map(plan => (
                                        <div 
                                          key={plan.id}
                                          className={`p-3 rounded-xl border text-[9px] flex flex-col justify-between gap-2 transition-all duration-200 hover:scale-[1.02] shadow-[0_2px_6px_rgba(0,0,0,0.005)] ${
                                            plan.isCompleted 
                                              ? 'border-emerald-100 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50' 
                                              : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                          }`}
                                        >
                                          <div className="flex justify-between items-center font-bold">
                                            <span>{plan.weekNumber}주차</span>
                                            {plan.isCompleted ? (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            ) : (
                                              <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                            )}
                                          </div>
                                          <p className="text-slate-400 font-bold tracking-tight text-[8px]">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</p>
                                          <span className="font-extrabold text-[10px] tracking-tight text-slate-700 truncate">{plan.rangeText}</span>
                                          <span className="text-[8px] font-bold text-slate-400">일일 {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. 성적 및 모의고사 분석 결과 */}
          <div className="space-y-5 print-card">
            <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              모의고사 성적 추이 및 주간 테스트 분석 결과
            </h3>

            {student.grades.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                <Calendar className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-bold text-slate-400">아직 주간 모의고사 및 성적 테스트 데이터가 등록되지 않았습니다.</p>
                <p className="text-[10px] text-slate-400/80 font-semibold">테스트 진행 후 대시보드에서 점수가 기입되면 실시간 성적 추이 그래프가 나타납니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                
                {/* 성적 차트 시각화 */}
                <div className={`${isStudentReport ? 'md:col-span-2' : 'md:col-span-3'} p-5 rounded-3xl bg-slate-50/70 border border-slate-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)]`}>
                  <h4 className="text-[10px] font-black text-slate-400 tracking-wider uppercase mb-4">학습 과목 성적 향상 곡선</h4>
                  {mounted && chartData.length > 0 ? (
                    <div className="w-full h-[230px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.6)" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold' }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold' }} />
                          <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', backgroundColor: '#ffffff', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }} />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 10, fontWeight: 'bold', fill: '#1E293B' }} />
                          {gradeSubjects.map((subject, idx) => {
                            const colors: Record<string, string> = {
                              '국어': '#0071E3',
                              '수학': '#862bf7',
                              '영어': '#F56300',
                              '한국사': '#10B981',
                              '기타': '#EF4444'
                            };
                            const defaultColors = ['#0071E3', '#862bf7', '#F56300', '#10B981', '#EC4899', '#3B82F6', '#EF4444'];
                            return (
                              <Line 
                                key={subject}
                                type="monotone" 
                                dataKey={subject} 
                                name={subject}
                                stroke={colors[subject] || defaultColors[idx % defaultColors.length]} 
                                strokeWidth={2.5} 
                                activeDot={{ r: 5 }} 
                                dot={{ strokeWidth: 2, r: 3.5 }} 
                                connectNulls={true}
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[190px] flex items-center justify-center text-xs text-slate-400 font-semibold">차트 모듈 구성하는 중...</div>
                  )}
                </div>

                {/* 성적 목록 요약 */}
                {isStudentReport && (
                  <div className="p-5 rounded-3xl border border-slate-100 bg-white space-y-3.5 flex flex-col justify-between max-h-[280px] print:max-h-none shadow-sm">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 tracking-wider uppercase border-b border-slate-100 pb-2">최근 실시한 시험 목록</h4>
                      <div className="space-y-3 mt-3 overflow-y-auto max-h-[160px] pr-1 print:max-h-none print:overflow-visible print:pr-0">
                        {[...student.grades].reverse().map(g => (
                          <div key={g.id} className="flex justify-between items-center text-[10px] border-b border-slate-100/50 pb-2">
                            <div className="min-w-0">
                              <span className="font-extrabold text-slate-700 mr-2 bg-slate-100 px-1.5 py-0.5 rounded-md">{g.subject}</span>
                              <span className="text-slate-500 font-semibold truncate max-w-[95px] inline-block align-bottom">{g.testName}</span>
                            </div>
                            <span className="font-black text-[#0071E3] shrink-0">{g.score}점</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {student.grades.length > 5 && (
                      <p className="text-[8px] text-slate-400 italic text-center font-bold">누적 성적 테스트 기록 총 {student.grades.length}건 보존 중</p>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* 5. 하단 격려 메세지 배너 */}
          <div className="bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white p-7 rounded-[24px] text-center space-y-2 relative overflow-hidden shadow-lg border border-slate-800/40">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#0071E3] via-[#862BF7] to-[#FF6B00]" />
            <p className="text-[10px] font-black tracking-[0.2em] text-[#3894FF] uppercase">Supreme Spartan Control System</p>
            <p className="text-xs font-semibold leading-relaxed opacity-95 text-balance tracking-tight">
              "타협 없는 철저한 관리만이 합격을 증명합니다. SSC 스파르타는 마지막 1분 1초까지 원생의 성공을 완벽하게 동행합니다."
            </p>
          </div>

        </div>

        {/* 하단 카피라이트 (인쇄 미포함) */}
        <div className="no-print text-center text-[10px] text-slate-400 pb-8">
          이 결과 브리핑 리포트는 SSC 스파르타 관리형 학습센터의 공식 학원 관리 솔루션을 사용하여 실시간으로 보안 출력되었습니다.
        </div>

      </div>
    </div>
  );
}
