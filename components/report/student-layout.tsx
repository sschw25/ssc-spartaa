'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '@/lib/haptics';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Menu, LogOut, Bell, X, LayoutDashboard, Printer, AlertTriangle, XCircle, MessageSquare, CheckCircle2, AlertCircle, Calendar, Search } from 'lucide-react';
import { Student } from '@/lib/types/student';
import { StudentNotification, StudentNotificationTone } from './notifications-section';
import { ParentSidebar } from './parent-sidebar';
import { STUDENT_TAB_NAVIGATE_EVENT } from './missions-card';

interface ReportNavItem {
  href: string;
  label: string;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
}

// 햄버거 메뉴 그룹 — 홈은 그룹 위에 단독으로 두고, 나머지 기능은 목적별로 묶어
// "찾고 싶은 기능"을 한눈에 스캔할 수 있게 한다. 하단 퀵바(주요 8칸)가 못 담는
// 코멘팅 소견도 여기서 항상 노출된다.
const HAMBURGER_GROUPS: Array<{ title: string; hrefs: string[] }> = [
  { title: '학습', hrefs: ['#learning', '#focus', '#wrong-note'] },
  { title: '생활 · 일정', hrefs: ['#life', '#calendar'] },
  { title: '소통 · 신청', hrefs: ['#student-requests', '#student-notifications', '#coach-feedback'] },
];

// 학생 기능 검색 인덱스 — 햄버거 메뉴 검색이 참조하는 정적 사전(한글 부분일치).
// tabId 는 메인 탭 id 또는 리포트 페이지가 컨테이너 탭으로 승격해 주는 서브탭 id
// (app/report/[id]/page.tsx applyContainerTab: timetable→학습, study-stats→생활, coupon→신청 등).
// '자리'·'도시락'은 승격 목록에 없는 서브탭이라 신청 메인 탭까지만 보낸다.
const FEATURE_INDEX: Array<{ label: string; desc: string; keywords: string[]; tabId: string }> = [
  { label: '홈 · 오늘 할 일', desc: '오늘 계획 · 특이사항', keywords: ['홈', '메인', '오늘', '할일', '투두'], tabId: 'report-overview' },
  { label: '아침 점검', desc: '홈 · 휴대폰 제출 체크', keywords: ['아침', '점검', '휴대폰', '폰'], tabId: 'report-overview' },
  { label: '연속 출석 스트릭', desc: '홈 · 출석 잇기 현황', keywords: ['스트릭', '연속', '출석'], tabId: 'report-overview' },
  { label: '시간표', desc: '학습 · 오늘 교시별 일정', keywords: ['시간표', '교시', '슬롯'], tabId: 'timetable' },
  { label: '학습 계획', desc: '학습 · 주간 목표치', keywords: ['계획', '주간', '목표', '실행'], tabId: 'execution-plan' },
  { label: '과목별 진도', desc: '학습 · 교재/인강 진도', keywords: ['진도', '교재', '인강', '강의', '책'], tabId: 'subject-progress' },
  { label: '주말 보강', desc: '학습 · 보강 입력', keywords: ['보강', '주말'], tabId: 'makeup' },
  { label: '성적 분석', desc: '학습 · 모의고사 성적', keywords: ['성적', '점수', '모의고사', '등급'], tabId: 'grade-analysis' },
  { label: '집중 타이머', desc: '뽀모도로 · 순공 기록', keywords: ['집중', '뽀모도로', '타이머', '스탑워치', '순공'], tabId: 'focus' },
  { label: '오답 노트', desc: '교재별 오답 사유 기록', keywords: ['오답', '틀린', '노트'], tabId: 'wrong-note' },
  { label: '휴가 · 반차 신청', desc: '신청 · 휴가/휴식권/병가', keywords: ['휴가', '반차', '휴식권', '병가', '외출'], tabId: 'leave' },
  { label: '상담 예약', desc: '신청 · 클리닉 상담', keywords: ['상담', '클리닉', '예약'], tabId: 'consultation' },
  { label: '학습 신청', desc: '신청 · 계획/자료 요청', keywords: ['신청', '요청', '자료'], tabId: 'learning-request' },
  { label: '건의사항', desc: '신청 · 의견 보내기', keywords: ['건의', '문의', '의견', '제안'], tabId: 'suggestion' },
  { label: '쿠폰 교환소', desc: '신청 · 쿠폰으로 보상 교환', keywords: ['쿠폰', '교환', '보상', '상품권', '교환소'], tabId: 'coupon' },
  { label: '자리 이동 신청', desc: '신청 탭에서 자리 선택', keywords: ['자리', '좌석', '이동'], tabId: 'student-requests' },
  { label: '도시락 신청', desc: '신청 탭에서 도시락 선택', keywords: ['도시락', '식사', '밥', '급식'], tabId: 'student-requests' },
  { label: '캘린더 · 일정', desc: '내 수험 스케줄러', keywords: ['캘린더', '일정', '스케줄', '달력'], tabId: 'calendar' },
  { label: 'OT · 행사', desc: '캘린더에서 참여 응답', keywords: ['ot', '오티', '설명회', '행사'], tabId: 'calendar' },
  { label: '등하원 기록', desc: '생활 · 출결 현황', keywords: ['등하원', '등원', '하원', '출결', 'qr'], tabId: 'attendance-status' },
  { label: '순공 시간 통계', desc: '생활 · 순공/랭킹', keywords: ['순공', '통계', '랭킹', '리더보드', '공부시간'], tabId: 'study-stats' },
  { label: '벌점 내역', desc: '생활 · 벌점/상점', keywords: ['벌점', '상점'], tabId: 'student-penalties' },
  { label: '쿠폰 내역 · 미션', desc: '생활 · 지급/적립 · 쿠폰 미션', keywords: ['쿠폰내역', '미션', '적립', '지급'], tabId: 'student-coupons' },
  { label: '알림', desc: '답변 · 처리 상태 알림', keywords: ['알림', '메시지', '답변', '공지'], tabId: 'student-notifications' },
  { label: '코멘팅 소견', desc: '담당 코멘터 피드백', keywords: ['소견', '피드백', '코멘터', '코치'], tabId: 'coach-feedback' },
];

// 검색 정규화 — 소문자 + 공백 제거('오답 노트'와 '오답노트'를 같게).
const normalizeSearch = (v: string) => v.toLowerCase().replace(/\s+/g, '');

interface StudentLayoutProps {
  student: Student;
  isStudentReport: boolean;
  isParentReport: boolean;
  showEnrollmentWarning: boolean;
  isEnrollmentExpiredLocked: boolean;
  daysUntilEnrollmentEnd: number | null;
  notificationCount: number;
  notificationPreview: StudentNotification[];
  reportNavItems: ReportNavItem[];
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  slideDirRef: React.MutableRefObject<number>;
  tabIds: string[];
  handleLogout: () => Promise<void>;
  handlePrint: () => void;
  formatNotificationDate: (value?: string) => string;
  children: React.ReactNode;
}

const NOTIFICATION_TONE_ICON: Record<StudentNotificationTone, React.ElementType> = {
  blue: MessageSquare,
  emerald: CheckCircle2,
  amber: AlertCircle,
  red: AlertCircle,
  slate: Calendar,
};

const NOTIFICATION_TONE_CLASS: Record<StudentNotificationTone, { item: string; icon: string; label: string }> = {
  blue: {
    item: 'border-[#0071E3]/15 bg-[#0071E3]/[0.04]',
    icon: 'bg-[#0071E3] text-white',
    label: 'bg-[#0071E3]/10 text-[#0071E3]',
  },
  emerald: {
    item: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-600 text-white',
    label: 'bg-emerald-100 text-emerald-700',
  },
  amber: {
    item: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-amber-500 text-white',
    label: 'bg-amber-100 text-amber-700',
  },
  red: {
    item: 'border-red-200 bg-red-50/70',
    icon: 'bg-red-500 text-white',
    label: 'bg-red-100 text-red-700',
  },
  slate: {
    item: 'border-slate-200 bg-slate-50/80',
    icon: 'bg-slate-500 text-white',
    label: 'bg-slate-200 text-slate-600',
  },
};

export function StudentLayout({
  student,
  isStudentReport,
  isParentReport,
  showEnrollmentWarning,
  isEnrollmentExpiredLocked,
  daysUntilEnrollmentEnd,
  notificationCount,
  notificationPreview,
  reportNavItems,
  activeTab,
  setActiveTab,
  slideDirRef,
  tabIds,
  handleLogout,
  handlePrint,
  formatNotificationDate,
  children,
}: StudentLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [quickNavActiveKey, setQuickNavActiveKey] = useState<string | null>(null);
  // 햄버거 기능 검색어 — 메뉴를 여닫는 지점에서 명시적으로 초기화한다(effect 내 setState 회피).
  const [menuSearch, setMenuSearch] = useState('');
  // iOS 큰 제목 접힘 — 히어로가 스크롤로 사라지면 상단 컴팩트 타이틀을 띄운다.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 150);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const truncateNotificationText = (value: string, max = 120) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  };

  const selectStudentTab = (tabId: string, scrollTargetId?: string, quickKey?: string) => {
    slideDirRef.current = tabIds.indexOf(tabId) >= tabIds.indexOf(activeTab) ? 1 : -1;
    setActiveTab(tabId);
    setQuickNavActiveKey(quickKey ?? tabId);
    setMobileMenuOpen(false);
    setNotificationPanelOpen(false);
    setMenuSearch('');
    window.setTimeout(() => {
      if (scrollTargetId) {
        document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  };

  const openNotificationTab = () => {
    selectStudentTab('student-notifications');
  };

  // 미션 카드 등 깊은 자식이 부모 배선 없이 탭 이동을 요청하는 전역 이벤트 수신
  // (missions-card.tsx 의 폴백 디스패치와 짝). 서브탭 id 는 리포트 페이지의
  // applyContainerTab 이 컨테이너 탭으로 승격해 준다. 학생 뷰에서만 동작.
  const selectStudentTabRef = useRef(selectStudentTab);
  useEffect(() => {
    selectStudentTabRef.current = selectStudentTab;
  });
  useEffect(() => {
    if (!isStudentReport) return;
    const onNavigate = (e: Event) => {
      const tabId = (e as CustomEvent<{ tabId?: unknown }>).detail?.tabId;
      if (typeof tabId === 'string' && tabId) selectStudentTabRef.current(tabId);
    };
    window.addEventListener(STUDENT_TAB_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(STUDENT_TAB_NAVIGATE_EVENT, onNavigate);
  }, [isStudentReport]);

  // 기능 검색 결과 — 라벨/키워드 한글 부분일치(공백 무시).
  const menuQuery = normalizeSearch(menuSearch);
  const menuSearchResults = menuQuery
    ? FEATURE_INDEX.filter((f) =>
        [f.label, ...f.keywords].some((k) => normalizeSearch(k).includes(menuQuery)),
      )
    : [];

  // 햄버거 메뉴 항목 렌더러 — 홈 단독 + 그룹 목록이 같은 모양을 공유한다.
  const renderNavItem = (item: ReportNavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.href.slice(1);
    return (
      <a
        key={item.href}
        href={item.href}
        onClick={(e) => {
          e.preventDefault();
          selectStudentTab(item.href.slice(1));
        }}
        className={`flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left shadow-sm transition-colors active:bg-[#0071E3]/10 ${
          isActive ? 'border-[#0071E3]/30 bg-[#0071E3]/5 dark:bg-[#0071E3]/15' : 'border-slate-100 dark:border-white/10 bg-white dark:bg-white/5'
        }`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/10 text-[#0071E3] ring-1 ring-slate-100 dark:ring-white/10">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-black text-slate-800 dark:text-slate-200">{item.label}</span>
          <span className="block truncate text-[10px] font-bold text-slate-400 dark:text-slate-500">{item.meta}</span>
        </span>
      </a>
    );
  };

  type QuickTabItem = ReportNavItem & {
    key: string;
    tabId: string;
    scrollTargetId?: string;
  };

  const getNavItem = (id: string) => reportNavItems.find((item) => item.href === `#${id}`);
  const quickTabItems: QuickTabItem[] = [];
  const homeNavItem = getNavItem('report-overview');
  const learningNavItem = getNavItem('learning');
  const focusNavItem = getNavItem('focus');
  const wrongNoteNavItem = getNavItem('wrong-note');
  const requestNavItem = getNavItem('student-requests');
  const calendarNavItem = getNavItem('calendar');
  const lifeNavItem = getNavItem('life');
  const notificationNavItem = getNavItem('student-notifications');

  if (homeNavItem) quickTabItems.push({ ...homeNavItem, key: 'report-overview', tabId: 'report-overview' });
  if (learningNavItem) quickTabItems.push({ ...learningNavItem, label: '학습', meta: '오늘·진도·성적', key: 'learning', tabId: 'learning' });
  if (focusNavItem) quickTabItems.push({ ...focusNavItem, key: 'focus', tabId: 'focus' });
  if (wrongNoteNavItem) quickTabItems.push({ ...wrongNoteNavItem, label: '오답', meta: '오답 노트', key: 'wrong-note', tabId: 'wrong-note' });
  if (requestNavItem) quickTabItems.push({ ...requestNavItem, label: '신청', meta: '상담·반차', key: 'student-requests', tabId: 'student-requests' });
  if (calendarNavItem) quickTabItems.push({ ...calendarNavItem, label: '캘린더', meta: '수험 스케줄러', key: 'calendar', tabId: 'calendar' });
  if (lifeNavItem) quickTabItems.push({ ...lifeNavItem, label: '생활', meta: '등하원·쿠폰', key: 'life', tabId: 'life' });
  if (notificationNavItem) quickTabItems.push({ ...notificationNavItem, key: 'student-notifications', tabId: 'student-notifications' });
  const selectedQuickItem = quickNavActiveKey
    ? quickTabItems.find((item) => item.key === quickNavActiveKey)
    : null;
  const shouldUseQuickActiveKey = Boolean(selectedQuickItem && selectedQuickItem.tabId === activeTab);

  return (
    <div className={`report-page min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] dark:from-[#0b0b0c] dark:to-[#0b0b0c] px-4 font-sans text-[#1E293B] dark:text-slate-200 antialiased transition-all ${
      isStudentReport ? 'pt-8 pb-28 md:pt-16 md:pb-32' : 'py-8 md:py-16'
    }`}>
      {/* 등록 만료 3일 이내 경고 배너 */}
      {showEnrollmentWarning && (
        <div className="no-print sticky top-0 z-40 w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold shadow-md">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            등록 기간이 <strong>{Math.abs(daysUntilEnrollmentEnd!)}일 전</strong>에 만료되었습니다.
            {' '}3일 후부터 기능이 제한됩니다. <strong>결제 부탁드립니다.</strong>
          </span>
        </div>
      )}

      {/* 등록 만료 3일 초과 → 전체 잠금 오버레이 */}
      {isEnrollmentExpiredLocked && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/97 backdrop-blur-sm px-4">
          <div className="text-center space-y-5 max-w-sm w-full bg-white rounded-3xl border border-red-100 shadow-2xl p-8">
            <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">등록 기간이 만료되었습니다</h2>
              <p className="text-sm text-slate-500 leading-relaxed mt-2">
                결제가 완료되면 기능이 자동으로 복구됩니다.<br />
                학원 데스크 또는 담당 코멘터에게 문의해 주세요.
              </p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-left">
              <p className="text-xs font-black text-red-600 text-center">결제 부탁드립니다</p>
              {student.enrollmentEndDate && (
                <p className="text-[11px] text-red-400 mt-1 text-center">만료일: {student.enrollmentEndDate}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`${isStudentReport ? 'max-w-5xl lg:max-w-6xl xl:max-w-7xl' : 'max-w-[1320px] xl:grid xl:grid-cols-[250px_minmax(0,1fr)] xl:items-start xl:gap-6'} mx-auto print-container`}>
        {/* 1. 학부모용 sticky 목차 사이드바 */}
        {isParentReport && (
          <ParentSidebar reportNavItems={reportNavItems} />
        )}

        <div className="min-w-0 space-y-6">
          {/* 2. 상단 컨트롤러 (인쇄 제외) */}
          {isStudentReport ? (
            <>
              <AnimatePresence>
                {(mobileMenuOpen || notificationPanelOpen) && (
                  <motion.button
                    type="button"
                    aria-label="열린 메뉴 닫기"
                    className="no-print fixed inset-0 z-[45] cursor-default bg-transparent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setNotificationPanelOpen(false);
                      setMenuSearch('');
                    }}
                  />
                )}
              </AnimatePresence>

              {/* iOS 큰 제목 접힘 — 스크롤 시 상단 중앙에 컴팩트 타이틀 */}
              <AnimatePresence>
                {scrolled && (
                  <motion.div
                    className="no-print glass-strong pointer-events-none fixed left-1/2 top-4 z-40 flex h-12 -translate-x-1/2 items-center rounded-full px-4"
                    initial={{ opacity: 0, y: -10, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.94 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="max-w-[42vw] truncate text-[13px] font-black tracking-tight text-slate-900 dark:text-slate-100">
                      {student.name}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="no-print fixed left-4 top-4 z-50">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen((open) => !open); setNotificationPanelOpen(false); setMenuSearch(''); }}
                  className="glass-strong grid h-12 w-12 place-items-center rounded-2xl text-[#0071E3] transition-colors active:bg-[#0071E3]/10"
                  aria-expanded={mobileMenuOpen}
                  aria-label="학습 메뉴 열기"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <AnimatePresence>
                {mobileMenuOpen && (
                  <motion.div
                    className="glass-strong mt-2 flex max-h-[calc(100dvh-88px)] w-[min(82vw,320px)] flex-col overflow-y-auto overscroll-contain rounded-3xl p-3"
                    style={{ transformOrigin: 'top left' }}
                    initial={{ opacity: 0, scale: 0.96, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -8 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071E3]">Menu</p>
                        <p className="mt-0.5 text-sm font-black text-slate-900 dark:text-slate-100">학습 메뉴</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 shadow-sm"
                      >
                        <LogOut className="h-3.5 w-3.5 text-slate-400" />
                        로그아웃
                      </button>
                    </div>

                    {/* 기능 검색 — 이름이 기억 안 나는 기능도 키워드로 찾아 바로 이동 */}
                    <div className="mb-2 shrink-0">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                          placeholder="기능 검색 (예: 오답, 도시락, 반차)"
                          aria-label="기능 검색"
                          className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-bold text-slate-800 placeholder:text-slate-400 shadow-sm outline-none transition-colors focus:border-[#0071E3]/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        />
                      </div>
                      {menuQuery && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {menuSearchResults.length === 0 ? (
                            <p className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-4 text-center text-[11px] font-bold text-slate-400 dark:border-white/10 dark:bg-white/5">
                              찾는 기능이 없어요
                            </p>
                          ) : (
                            menuSearchResults.map((f) => (
                              <button
                                key={`${f.tabId}-${f.label}`}
                                type="button"
                                onClick={() => selectStudentTab(f.tabId)}
                                className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-left shadow-sm transition-colors active:bg-[#0071E3]/10 dark:border-white/10 dark:bg-white/5"
                              >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 text-[#0071E3] ring-1 ring-slate-100 dark:bg-white/10 dark:ring-white/10">
                                  <Search className="h-4 w-4" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[11px] font-black text-slate-800 dark:text-slate-200">{f.label}</span>
                                  <span className="block truncate text-[10px] font-bold text-slate-400 dark:text-slate-500">{f.desc}</span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* 검색 중에는 결과에 집중하도록 그룹 목록을 잠시 숨긴다 */}
                    {!menuQuery && (
                    <div className="flex flex-col gap-3">
                      {/* 홈 — 그룹 위 단독. 나머지는 학습/생활·일정/소통·신청 그룹으로 묶어 노출 */}
                      {(() => {
                        const home = reportNavItems.find((item) => item.href === '#report-overview');
                        return home ? renderNavItem(home) : null;
                      })()}
                      {HAMBURGER_GROUPS.map((group) => {
                        const items = group.hrefs
                          .map((href) => reportNavItems.find((item) => item.href === href))
                          .filter((item): item is ReportNavItem => Boolean(item));
                        if (items.length === 0) return null;
                        return (
                          <div key={group.title} className="flex flex-col gap-1.5">
                            <p className="px-1 text-[10px] font-black tracking-wide text-slate-400 dark:text-slate-500">{group.title}</p>
                            {items.map(renderNavItem)}
                          </div>
                        );
                      })}
                      {/* 폴백 — 그룹에 안 잡힌 탭이 생겨도 접근성이 사라지지 않게 */}
                      {(() => {
                        const grouped = new Set(['#report-overview', ...HAMBURGER_GROUPS.flatMap((g) => g.hrefs)]);
                        const rest = reportNavItems.filter((item) => !grouped.has(item.href));
                        if (rest.length === 0) return null;
                        return (
                          <div className="flex flex-col gap-1.5">
                            <p className="px-1 text-[10px] font-black tracking-wide text-slate-400 dark:text-slate-500">기타</p>
                            {rest.map(renderNavItem)}
                          </div>
                        );
                      })()}
                    </div>
                    )}

                    <ThemeToggle className="mt-2 min-h-12 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200" />
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              <div className="no-print fixed right-4 top-4 z-50 flex flex-col items-end">
                <button
                  type="button"
                  onClick={() => { setNotificationPanelOpen((open) => !open); setMobileMenuOpen(false); }}
                  className="glass-strong relative grid h-12 w-12 place-items-center rounded-2xl text-[#0071E3] transition-colors active:bg-[#0071E3]/10"
                  aria-expanded={notificationPanelOpen}
                  aria-label={`알림 열기, 현재 ${notificationCount}개`}
                >
                  <Bell className="h-5 w-5" />
                  {notificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-sm">
                      {notificationCount > 9 ? '9+' : notificationCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                {notificationPanelOpen && (
                  <motion.div
                    className="glass-strong mt-2 w-[min(86vw,360px)] rounded-3xl p-3"
                    style={{ transformOrigin: 'top right' }}
                    initial={{ opacity: 0, scale: 0.96, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -8 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071E3]">Notifications</p>
                        <p className="mt-0.5 text-sm font-black text-slate-900 dark:text-slate-100">학생 알림</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotificationPanelOpen(false)}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm"
                        aria-label="알림 닫기"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {notificationPreview.length > 0 ? (
                      <div className="space-y-2">
                        {notificationPreview.map((notification, i) => {
                          const toneClass = NOTIFICATION_TONE_CLASS[notification.tone];
                          const ToneIcon = NOTIFICATION_TONE_ICON[notification.tone];
                          return (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={openNotificationTab}
                              style={{ animationDelay: `${i * 45}ms` }}
                              className={`animate-stagger-in w-full rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.98] ${toneClass.item}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl ${toneClass.icon}`}>
                                  <ToneIcon className="h-3.5 w-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center justify-between gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${toneClass.label}`}>{notification.label}</span>
                                    <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatNotificationDate(notification.date)}</span>
                                  </span>
                                  <span className="mt-1.5 block text-xs font-black leading-4 text-slate-900 dark:text-slate-100">{notification.title}</span>
                                  <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">{truncateNotificationText(notification.body, 70)}</span>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 text-center">
                        <p className="text-xs font-black text-slate-700">새 알림이 없습니다.</p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">코멘터 답변과 신청 처리 상태가 여기에 표시돼요.</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={openNotificationTab}
                      className="mt-3 w-full rounded-2xl bg-[#0071E3] py-2.5 text-xs font-black text-white shadow-[0_8px_24px_rgba(0,113,227,0.18)] transition active:scale-[0.98]"
                    >
                      전체 알림 보기
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              <nav
                aria-label="하단 빠른 이동"
                className="no-print fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pointer-events-none"
              >
                <div className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-full p-1.5">
                  {quickTabItems.map((item) => {
                    const Icon = item.icon;
                    const active = shouldUseQuickActiveKey
                      ? quickNavActiveKey === item.key
                      : activeTab === item.tabId && !item.scrollTargetId;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => { haptic('select'); selectStudentTab(item.tabId, item.scrollTargetId, item.key); }}
                        aria-current={active ? 'page' : undefined}
                        className={`press-spring relative flex min-w-[39px] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 transition-colors duration-300 sm:min-w-[58px] sm:px-3 ${
                          active
                            ? 'bg-[#0071E3]/12 text-[#0071E3]'
                            : 'text-slate-500 hover:bg-black/[0.04] hover:text-slate-900'
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span className={`whitespace-nowrap text-[9px] tracking-tight sm:text-[10px] ${active ? 'font-semibold' : 'font-bold'}`}>
                          {item.label}
                        </span>
                        {item.tabId === 'student-notifications' && notificationCount > 0 && (
                          <span className="absolute right-1.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                            {notificationCount > 9 ? '9+' : notificationCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>
            </>
          ) : (
            <div className="no-print flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)] backdrop-blur-xl transition-all sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#0071E3]" />
                <div className="truncate text-xs font-bold tracking-tight text-slate-500">
                  SSC SPARTA · 학부모용 학습 결과 브리핑 결과지
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.href = '/admin/dashboard'}
                  className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] outline-none"
                >
                  <LayoutDashboard className="h-4 w-4 text-slate-400" />
                  대시보드
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex h-10 items-center gap-2 rounded-2xl border-0 bg-[#0071E3] px-5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(0,113,227,0.3)] transition-all hover:bg-[#005DB9] active:scale-[0.98] outline-none"
                >
                  <Printer className="h-4 w-4" />
                  PDF 저장 / 인쇄
                </button>
              </div>
            </div>
          )}

          {/* 3. children 본문 콘텐츠 렌더링 */}
          {children}
        </div>
      </div>
    </div>
  );
}
