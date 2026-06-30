'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildWelcomeStepIds, type WelcomeStepId } from '@/lib/onboarding';

interface WelcomeCarouselProps {
  studentId: string;
  name: string;
  campus: string;
  enrollStartDate?: string;
  showMock: boolean;
  replay: boolean;
}

export function WelcomeCarousel({ studentId, name, campus, enrollStartDate, showMock, replay }: WelcomeCarouselProps) {
  const router = useRouter();
  const stepIds = useMemo(() => buildWelcomeStepIds(showMock), [showMock]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const stepContent: Record<WelcomeStepId, { title: string; body: string }> = {
    welcome: { title: `${name}님, 환영해요!`, body: `${campus} 센터${enrollStartDate ? ` · 이용 시작일 ${enrollStartDate}` : ''}. SSC스파르타와 함께 시작해요.` },
    attendance: { title: '출결은 QR로', body: '입구 QR을 본인 로그인으로 스캔해 등원/하원을 찍어요. 순공 시간이 자동 기록돼요.' },
    report: { title: '내 리포트', body: '진도·성적·순공 시간·랭킹을 여기서 확인해요. 매주 성적도 입력해요.' },
    requests: { title: '신청과 소통', body: '휴가/반차·상담 예약을 신청하고, 메시지로 담당 코멘터와 소통해요.' },
    meal: { title: '도시락 신청', body: '주간 도시락을 미리 신청할 수 있어요. 마감 시간을 확인하세요.' },
    coupon: { title: '미션과 쿠폰', body: '미션을 달성하면 쿠폰을 받고, 반차권·상품 등으로 교환할 수 있어요.' },
    mock: { title: '모의고사', body: '예정된 모의고사 응시 여부를 앱에서 응답해요. 일정 알림을 받게 돼요.' },
    finish: { title: '이제 시작해요', body: '출결번호로 로그인해요. 시작일부터 이용 가능하고, 궁금한 건 언제든 메시지로 물어보세요.' },
  };

  const isLast = idx >= stepIds.length - 1;
  const current = stepContent[stepIds[idx]];

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      if (!replay) {
        await fetch('/api/student/onboarding', { method: 'POST' }).catch(() => {});
      }
    } finally {
      router.push(`/report/${studentId}?audience=student`);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/80 backdrop-blur p-6 shadow-sm">
        <div className="flex justify-end">
          <button onClick={finish} className="text-xs text-[#86868B]" disabled={busy}>건너뛰기</button>
        </div>
        <h2 className="text-xl font-semibold mt-2">{current.title}</h2>
        <p className="text-sm text-[#1d1d1f]/80 mt-3 leading-relaxed">{current.body}</p>
        <div className="flex gap-1.5 justify-center mt-6">
          {stepIds.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-[#0071E3]' : 'w-1.5 bg-[#D2D2D7]'}`} />
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          {idx > 0 && (
            <button onClick={() => setIdx((v) => v - 1)} className="flex-1 rounded-full py-2.5 text-sm bg-[#F5F5F7]" disabled={busy}>이전</button>
          )}
          {!isLast ? (
            <button onClick={() => setIdx((v) => v + 1)} className="flex-1 rounded-full py-2.5 text-sm bg-[#0071E3] text-white">다음</button>
          ) : (
            <button onClick={finish} className="flex-1 rounded-full py-2.5 text-sm bg-[#0071E3] text-white" disabled={busy}>시작하기</button>
          )}
        </div>
      </div>
    </div>
  );
}
