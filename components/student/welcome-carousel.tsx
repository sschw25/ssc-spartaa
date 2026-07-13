'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildWelcomeStepIds, type WelcomeStepId } from '@/lib/onboarding';
import { getCampusLabel } from '@/lib/meal';

interface WelcomeCarouselProps {
  studentId: string;
  name: string;
  campus: string;
  enrollStartDate?: string;
  showMock: boolean;
  // 승인 시 직렬 기반 과목이 자동생성됐는지 — 마지막 카드에서 계획수립(신청 탭) CTA 노출
  hasPreparedSubjects?: boolean;
  replay: boolean;
}

export function WelcomeCarousel({ studentId, name, campus, enrollStartDate, showMock, hasPreparedSubjects, replay }: WelcomeCarouselProps) {
  const router = useRouter();
  const stepIds = useMemo(() => buildWelcomeStepIds(showMock), [showMock]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  // 터치 스와이프 — 시작 좌표를 기억해 touchend에서 델타로 좌/우 이동 판정.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const stepContent: Record<WelcomeStepId, { title: string; body: string }> = {
    welcome: { title: `${name}님, 환영해요!`, body: `${getCampusLabel(campus)} 센터${enrollStartDate ? ` · 이용 시작일 ${enrollStartDate}` : ''}. SSC스파르타와 함께 시작해요.` },
    attendance: { title: '출결은 QR로', body: '입구 QR을 본인 로그인으로 스캔해 등원/하원을 찍어요. 순공 시간이 자동 기록돼요.' },
    report: { title: '학생 홈', body: '진도·성적·순공 시간·랭킹을 여기서 확인해요. 매주 성적도 입력해요.' },
    requests: { title: '신청과 소통', body: '휴가/반차·상담 예약을 신청하고, 메시지로 담당 코멘터와 소통해요.' },
    meal: { title: '도시락 신청', body: '주간 도시락을 미리 신청할 수 있어요. 마감 시간을 확인하세요.' },
    coupon: { title: '미션과 쿠폰', body: '미션을 달성하면 쿠폰을 받고, 반차권·상품 등으로 교환할 수 있어요.' },
    mock: { title: '모의고사', body: '예정된 모의고사 응시 여부를 앱에서 응답해요. 일정 알림을 받게 돼요.' },
    finish: { title: '이제 시작해요', body: '출결번호로 로그인해요. 시작일부터 이용 가능하고, 궁금한 건 언제든 메시지로 물어보세요.' },
  };

  const isLast = idx >= stepIds.length - 1;
  const current = stepContent[stepIds[idx]];

  // tab 을 주면 온보딩 완료 후 해당 학생 탭으로 딥링크(예: 'learning-request' = 신청 탭의 학습신청 서브탭).
  async function finish(tab?: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (!replay) {
        await fetch('/api/student/onboarding', { method: 'POST' }).catch(() => {});
      }
    } finally {
      router.push(`/report/${studentId}?audience=student${tab ? `&tab=${tab}` : ''}`);
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || busy) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // 수평 이동이 충분히 크고(48px+), 세로 스크롤보다 뚜렷할 때만 단계 이동.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && !isLast) setIdx((v) => v + 1);
    else if (dx > 0 && idx > 0) setIdx((v) => v - 1);
  };

  return (
    <div className="ios-app-bg min-h-screen flex flex-col items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-3xl border border-black/5 bg-white dark:border-white/10 dark:bg-[#1c1c1e] p-6 shadow-sm"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex justify-end">
          <button onClick={() => finish()} className="text-xs text-slate-500 dark:text-slate-400" disabled={busy}>건너뛰기</button>
        </div>
        <h2 className="text-xl font-semibold mt-2 text-slate-900 dark:text-slate-100">{current.title}</h2>
        <p className="text-sm text-slate-900/80 dark:text-slate-300 mt-3 leading-relaxed">{current.body}</p>
        {isLast && hasPreparedSubjects && (
          <div className="mt-4 rounded-2xl bg-[#0071E3]/[0.06] dark:bg-[#0A84FF]/10 p-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">과목이 준비됐어요</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              목표시험에 맞춰 과목을 미리 만들어뒀어요. 과목별로 교재·강의를 신청해 계획을 세워보세요.
            </p>
            <button
              onClick={() => finish('learning-request')}
              disabled={busy}
              className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold bg-[#0071E3] text-white disabled:opacity-60"
            >
              교재·강의 신청하러 가기
            </button>
          </div>
        )}
        <div className="flex gap-1.5 justify-center mt-6">
          {stepIds.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setIdx(i)}
              disabled={busy}
              aria-label={`${i + 1}단계로 이동`}
              aria-current={i === idx ? 'step' : undefined}
              className="p-1 -m-0.5"
            >
              <span className={`block h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-[#0071E3]' : 'w-1.5 bg-[#D2D2D7] dark:bg-white/20'}`} />
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          {idx > 0 && (
            <button onClick={() => setIdx((v) => v - 1)} className="flex-1 rounded-full py-2.5 text-sm bg-[#F5F5F7] dark:bg-white/10 dark:text-slate-200" disabled={busy}>이전</button>
          )}
          {!isLast ? (
            <button onClick={() => setIdx((v) => v + 1)} className="flex-1 rounded-full py-2.5 text-sm bg-[#0071E3] text-white">다음</button>
          ) : (
            <button onClick={() => finish()} className="flex-1 rounded-full py-2.5 text-sm bg-[#0071E3] text-white" disabled={busy}>시작하기</button>
          )}
        </div>
      </div>
    </div>
  );
}
