'use client';

import React from 'react';
import { Bell, MessageSquare, CheckCircle2, AlertCircle, Calendar, RotateCcw, X } from 'lucide-react';

export type StudentNotificationTone = 'blue' | 'emerald' | 'amber' | 'red' | 'slate';

export interface StudentNotification {
  id: string;
  tone: StudentNotificationTone;
  label: string;
  title: string;
  body: string;
  meta?: string;
  date?: string;
  priority: number;
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

interface NotificationsSectionProps {
  studentName: string;
  studentNotifications: StudentNotification[];
  dismissedNotifications: StudentNotification[];
  notificationCount: number;
  onDismissNotification: (notificationId: string) => void;
  onRestoreNotification: (notificationId: string) => void;
  onRestoreAllNotifications: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  slideDirRef: React.MutableRefObject<number>;
  formatNotificationDate: (value?: string) => string;
}

export function NotificationsSection({
  studentName,
  studentNotifications,
  dismissedNotifications,
  notificationCount,
  onDismissNotification,
  onRestoreNotification,
  onRestoreAllNotifications,
  activeTab,
  setActiveTab,
  slideDirRef,
  formatNotificationDate,
}: NotificationsSectionProps) {
  const [showDismissed, setShowDismissed] = React.useState(false);
  const dismissedCount = dismissedNotifications.length;

  return (
    <section id="student-notifications" className={`scroll-mt-24 space-y-5 ${activeTab === 'student-notifications' ? '' : 'hidden print:block'}`}>
      <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
              <Bell className="h-3.5 w-3.5" />
              Student Notifications
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-4xl">
              {notificationCount > 0 ? `${studentName}님에게 온 알림 ${notificationCount}개` : `${studentName}님, 새 알림이 없습니다`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
              코치 답변, 신청 처리 상태, 성적 입력 안내처럼 지금 먼저 확인해야 할 내용을 한곳에 모았습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { slideDirRef.current = 1; setActiveTab('report-overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-[#0071E3]/20 bg-white px-4 text-xs font-black text-[#0071E3] shadow-sm transition hover:bg-[#0071E3]/5 active:scale-[0.98]"
          >
            오늘 브리핑 보기
          </button>
        </div>
      </div>

      {dismissedCount > 0 && (
        <div className="no-print flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowDismissed((value) => !value)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-500 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
          >
            {showDismissed ? '지운 알림 접기' : `지운 알림 보기 ${dismissedCount}개`}
          </button>
          {showDismissed && (
            <button
              type="button"
              onClick={onRestoreAllNotifications}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#0071E3]/20 bg-white px-3 text-[11px] font-black text-[#0071E3] shadow-sm transition hover:bg-[#0071E3]/5 active:scale-[0.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              모두 복구
            </button>
          )}
        </div>
      )}

      {studentNotifications.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {studentNotifications.map((notification) => {
            const toneClass = NOTIFICATION_TONE_CLASS[notification.tone];
            const ToneIcon = NOTIFICATION_TONE_ICON[notification.tone];
            return (
              <article key={notification.id} className={`relative rounded-3xl border p-4 pr-12 shadow-sm md:p-5 md:pr-14 ${toneClass.item}`}>
                <button
                  type="button"
                  onClick={() => onDismissNotification(notification.id)}
                  className="no-print absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/90 text-slate-400 shadow-sm transition hover:text-slate-700 active:scale-95"
                  aria-label={`${notification.title} 알림 지우기`}
                  title="알림 지우기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${toneClass.icon}`}>
                    <ToneIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${toneClass.label}`}>
                        {notification.label}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{formatNotificationDate(notification.date)}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-black leading-5 text-slate-900">{notification.title}</h3>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-xs font-semibold leading-5 text-slate-600">{notification.body}</p>
                    {notification.meta && (
                      <p className="mt-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-semibold leading-4 text-slate-500">
                        신청 내용: {notification.meta}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-black text-slate-700">확인할 알림이 없습니다.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">신청 답변이나 코치 안내가 도착하면 이 화면 맨 위에 표시됩니다.</p>
        </div>
      )}

      {showDismissed && dismissedCount > 0 && (
        <div className="no-print rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Archived</p>
              <h3 className="mt-1 text-sm font-black text-slate-800">지운 알림</h3>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-400">{dismissedCount}개</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {dismissedNotifications.map((notification) => {
              const toneClass = NOTIFICATION_TONE_CLASS[notification.tone];
              const ToneIcon = NOTIFICATION_TONE_ICON[notification.tone];
              return (
                <article key={notification.id} className={`relative rounded-3xl border p-4 pr-12 opacity-80 shadow-sm md:p-5 md:pr-14 ${toneClass.item}`}>
                  <button
                    type="button"
                    onClick={() => onRestoreNotification(notification.id)}
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/90 text-[#0071E3] shadow-sm transition hover:bg-[#0071E3]/5 active:scale-95"
                    aria-label={`${notification.title} 알림 복구`}
                    title="알림 복구"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${toneClass.icon}`}>
                      <ToneIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${toneClass.label}`}>
                          {notification.label}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">{formatNotificationDate(notification.date)}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-black leading-5 text-slate-900">{notification.title}</h3>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs font-semibold leading-5 text-slate-600">{notification.body}</p>
                      {notification.meta && (
                        <p className="mt-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-semibold leading-4 text-slate-500">
                          신청 내용: {notification.meta}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
