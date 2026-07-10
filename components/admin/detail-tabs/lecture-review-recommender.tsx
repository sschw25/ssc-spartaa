'use client';

import React from 'react';
import { parseTimeSlot } from '@/lib/academy-timetable';

// 강의 복습 추천 계산기 — 배속·강의시간·복습시간을 고려해
// 한 세션(예: 오후 210분)에 들어갈 강의 수 / 복습시간을 제시한다.
// 순수 계산 위젯(저장 없음). estimatedMinutesPerUnit/speedMultiplier 는 자료 설정값을 받는다.
export function LectureReviewRecommender({
  estimatedMinutesPerUnit,
  speedMultiplier,
  studyTime,
}: {
  estimatedMinutesPerUnit?: number | null;
  speedMultiplier?: number | null;
  studyTime?: string; // 블록('morning'…) 외 't:HH:MM-HH:MM'도 허용 — 프리셋 미매칭 시 기본 210분
}) {
  const [open, setOpen] = React.useState(false);
  const [reviewMin, setReviewMin] = React.useState<number>(20);
  const sessionPresets = [
    { key: 'morning', label: '오전', value: 190 },
    { key: 'afternoon', label: '오후', value: 210 },
    { key: 'night', label: '야간', value: 250 },
  ] as const;
  // 시:분 직접지정('t:') 자료는 그 구간 길이를 세션 기본값으로 사용.
  const timeParsed = parseTimeSlot(studyTime);
  const timeDur = timeParsed && timeParsed.endMin > timeParsed.startMin ? timeParsed.endMin - timeParsed.startMin : null;
  const defaultSessionMin = sessionPresets.find((preset) => preset.key === studyTime)?.value ?? timeDur ?? 210;
  const [sessionMin, setSessionMin] = React.useState<number>(defaultSessionMin);

  React.useEffect(() => {
    setSessionMin(defaultSessionMin);
  }, [defaultSessionMin]);

  const lectureMin = estimatedMinutesPerUnit && estimatedMinutesPerUnit > 0 ? estimatedMinutesPerUnit : 60;
  const speed = speedMultiplier && speedMultiplier > 0 ? speedMultiplier : 1.0;
  const watchMin = lectureMin / speed; // 배속 적용 실제 시청시간
  const perLecture = watchMin + Math.max(0, reviewMin); // 강의 1개당 소요(시청+복습)

  const recommendedCount = perLecture > 0 ? Math.floor(sessionMin / perLecture) : 0;
  const usedMin = Math.round(recommendedCount * perLecture);
  const leftover = Math.max(0, sessionMin - usedMin);

  return (
    <div className="rounded-lg border border-[#0071E3]/15 bg-[#F8FBFF] dark:bg-white/5 p-2.5 text-[10px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-bold text-[#0071E3]"
      >
        <span>복습 포함 추천 (배속·강의·복습 고려)</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="block text-slate-500 font-semibold">복습 시간 (분/강)</span>
              <input
                type="number"
                min={0}
                value={reviewMin}
                onChange={(e) => setReviewMin(Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-full rounded-md border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 text-[10px] focus:outline-none"
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-slate-500 font-semibold">세션 시간 (분)</span>
              <input
                type="number"
                min={1}
                value={sessionMin}
                onChange={(e) => setSessionMin(Math.max(1, Number(e.target.value) || 1))}
                className="h-7 w-full rounded-md border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 text-[10px] focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1">
            {sessionPresets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSessionMin(p.value)}
                className={`rounded-full border px-2 py-0.5 font-bold transition-colors ${
                  sessionMin === p.value
                    ? 'border-[#0071E3] bg-[#0071E3] text-white'
                    : 'border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 hover:border-[#0071E3]/40'
                }`}
              >
                {p.label} {p.value}
              </button>
            ))}
          </div>

          <div className="rounded-md border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2 space-y-1 text-slate-700 dark:text-slate-300">
            <p>
              <span className="font-bold text-slate-900 dark:text-slate-100">강의 {lectureMin}분 · {speed}배속</span>
              {' '}→ 시청 {Math.round(watchMin)}분 + 복습 {reviewMin}분 = <span className="font-bold">{Math.round(perLecture)}분/강</span>
            </p>
            <p className="font-bold text-[#0071E3]">
              {sessionMin}분 세션 → 약 {recommendedCount}강 추천 (사용 {usedMin}분 · 여유 {leftover}분)
            </p>
            {leftover > 0 && recommendedCount > 0 && (
              <p className="text-slate-500">
                남는 {leftover}분은 강당 복습 +{Math.floor(leftover / recommendedCount)}분으로 활용 가능
              </p>
            )}
            {recommendedCount === 0 && (
              <p className="text-[#A25F00]">강의 1개 소요({Math.round(perLecture)}분)가 세션 시간보다 깁니다. 배속을 높이거나 복습을 줄여보세요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
