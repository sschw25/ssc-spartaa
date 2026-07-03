'use client';

import React, { useState } from 'react';
import { Menu, LogOut, Bell, X, LayoutDashboard, Printer, AlertTriangle, XCircle, MessageSquare, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { Student } from '@/lib/types/student';
import { StudentNotification, StudentNotificationTone } from './notifications-section';
import { ParentSidebar } from './parent-sidebar';

interface ReportNavItem {
  href: string;
  label: string;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
}

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

  type QuickTabItem = ReportNavItem & {
    key: string;
    tabId: string;
    scrollTargetId?: string;
  };

  const getNavItem = (id: string) => reportNavItems.find((item) => item.href === `#${id}`);
  const quickTabItems: QuickTabItem[] = [];
  const homeNavItem = getNavItem('report-overview');
  const learningNavItem = getNavItem('learning');
  const missionsNavItem = getNavItem('student-missions');
  const requestNavItem = getNavItem('student-requests');
  const lifeNavItem = getNavItem('life');
  const notificationNavItem = getNavItem('student-notifications');

  if (homeNavItem) quickTabItems.push({ ...homeNavItem, key: 'report-overview', tabId: 'report-overview' });
  if (learningNavItem) quickTabItems.push({ ...learningNavItem, label: '학습', meta: '오늘·진도·성적', key: 'learning', tabId: 'learning' });
  if (missionsNavItem) quickTabItems.push({ ...missionsNavItem, label: '미션', meta: '보상', key: 'student-missions', tabId: 'student-missions' });
  if (requestNavItem) quickTabItems.push({ ...requestNavItem, label: '신청', meta: '상담·반차', key: 'student-requests', tabId: 'student-requests' });
  if (lifeNavItem) quickTabItems.push({ ...lifeNavItem, label: '생활', meta: '등하원·벌점', key: 'life', tabId: 'life' });
  if (notificationNavItem) quickTabItems.push({ ...notificationNavItem, key: 'student-notifications', tabId: 'student-notifications' });
  const selectedQuickItem = quickNavActiveKey
    ? quickTabItems.find((item) => item.key === quickNavActiveKey)
    : null;
  const shouldUseQuickActiveKey = Boolean(selectedQuickItem && selectedQuickItem.tabId === activeTab);

  return (
    <div className={`report-page min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] px-4 font-sans text-[#1E293B] antialiased transition-all ${
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
              <h2 className="text-xl font-black text-[#1D1D1F] tracking-tight">등록 기간이 만료되었습니다</h2>
              <p className="text-sm text-[#86868B] leading-relaxed mt-2">
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
              {(mobileMenuOpen || notificationPanelOpen) && (
                <button
                  type="button"
                  aria-label="열린 메뉴 닫기"
                  className="no-print fixed inset-0 z-[45] cursor-default bg-transparent"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setNotificationPanelOpen(false);
                  }}
                />
              )}

              <div className="no-print fixed left-4 top-4 z-50">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen((open) => !open); setNotificationPanelOpen(false); }}
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-slate-200/80 bg-white/95 text-[#0071E3] shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-colors active:bg-[#0071E3]/10"
                  aria-expanded={mobileMenuOpen}
                  aria-label="학습 메뉴 열기"
                >
                  <Menu className="h-5 w-5" />
                </button>

                {mobileMenuOpen && (
                  <div className="mt-2 flex max-h-[calc(100dvh-88px)] w-[min(82vw,320px)] flex-col overflow-y-auto overscroll-contain rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071E3]">Menu</p>
                        <p className="mt-0.5 text-sm font-black text-slate-900">학습 메뉴</p>
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

                    <div className="grid grid-cols-1 gap-1.5">
                      {/* 미션은 이제 리포트 탭(#student-missions)으로 통합 — reportNavItems에 포함된다 */}
                      {reportNavItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <a
                            key={item.href}
                            href={item.href}
                            onClick={(e) => {
                              e.preventDefault();
                              const id = item.href.slice(1);
                              selectStudentTab(id);
                            }}
                            className={`flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left shadow-sm transition-colors active:bg-[#0071E3]/10 ${
                              activeTab === item.href.slice(1) ? 'border-[#0071E3]/30 bg-[#0071E3]/5' : 'border-slate-100 bg-white'
                            }`}
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 text-[#0071E3] ring-1 ring-slate-100">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] font-black text-slate-800">{item.label}</span>
                              <span className="block truncate text-[10px] font-bold text-slate-400">{item.meta}</span>
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="no-print fixed right-4 top-4 z-50 flex flex-col items-end">
                <button
                  type="button"
                  onClick={() => { setNotificationPanelOpen((open) => !open); setMobileMenuOpen(false); }}
                  className="relative grid h-12 w-12 place-items-center rounded-2xl border border-slate-200/80 bg-white/95 text-[#0071E3] shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-colors active:bg-[#0071E3]/10"
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

                {notificationPanelOpen && (
                  <div className="mt-2 w-[min(86vw,360px)] rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                    <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071E3]">Notifications</p>
                        <p className="mt-0.5 text-sm font-black text-slate-900">학생 알림</p>
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
                        {notificationPreview.map((notification) => {
                          const toneClass = NOTIFICATION_TONE_CLASS[notification.tone];
                          const ToneIcon = NOTIFICATION_TONE_ICON[notification.tone];
                          return (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={openNotificationTab}
                              className={`w-full rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.98] ${toneClass.item}`}
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
                                  <span className="mt-1.5 block text-xs font-black leading-4 text-slate-900">{notification.title}</span>
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
                  </div>
                )}
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
                        onClick={() => selectStudentTab(item.tabId, item.scrollTargetId, item.key)}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex min-w-[50px] flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1.5 transition-all duration-300 active:scale-[0.94] sm:min-w-[64px] sm:px-3.5 ${
                          active
                            ? 'bg-[#0071E3]/12 text-[#0071E3]'
                            : 'text-[#86868B] hover:bg-black/[0.04] hover:text-[#1D1D1F]'
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span className={`whitespace-nowrap text-[10px] tracking-tight ${active ? 'font-semibold' : 'font-bold'}`}>
                          {item.label}
                        </span>
                        {item.tabId === 'student-notifications' && notificationCount > 0 && (
                          <span className="absolute right-2.5 top-1.5 grid h-3 min-w-3 place-items-center rounded-full bg-red-500 px-[3px] text-[7px] font-semibold leading-none text-white">
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
                  PDF 저장 / 리포트 출력
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
