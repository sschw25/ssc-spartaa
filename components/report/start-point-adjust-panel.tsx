'use client';

import React, { useState } from 'react';

// 시작점 조정용 자료 현황 — adjustInfoFor(home-overview-tab)와 동일 shape.
// 임계치는 전체 분량의 1/10(최소 1) — 서버(progress/adjust)와 동일 규칙(안내 표시용).
export type StartPointAdjustInfo = {
  current: number;
  total: number;
  usedToday: number;
  threshold: number;
};

// 시작점 조정 결과 — use-report-state.adjustStartPoint 반환 shape 과 동일.
// needsReason: 서버가 하루 자동 승인 한도 소진으로 사유를 요구(400) — 패널이 사유 모드로 전환.
export type StartPointAdjustResult = {
  ok: boolean;
  auto?: boolean;
  needsReason?: boolean;
  threshold?: number;
};

// 시작점 조정 인라인 패널 — 홈 '오늘 할 일'과 자료 상세 시트(MaterialDetailSheet)가 공유.
// 자동 승인 범위(threshold - usedToday) 안이면 바로 반영, 넘으면 사유와 함께 신청을 보낸다.
// 열릴 때마다 새로 마운트되는 전제(입력 상태는 내부 관리 — 닫으면 자연 초기화).
export function StartPointAdjustPanel({
  materialType,
  materialId,
  unit,
  info,
  adjustStartPoint,
  onClose,
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  unit: string;
  info: StartPointAdjustInfo;
  adjustStartPoint: (
    materialType: 'book' | 'lecture',
    materialId: string,
    newValue: number,
    reason?: string,
  ) => Promise<StartPointAdjustResult>;
  onClose: () => void;
}) {
  // 입력 중에는 자유 타이핑(빈 문자열 포함) 허용 — clamp 는 blur/제출 시에만.
  const [adjustStart, setAdjustStart] = useState<number | string>(() => Math.min(info.total, info.current + 1));
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);
  // 서버가 한도 소진(needsReason)을 알려온 상태 — 클라이언트 계산과 무관하게 사유 모드 강제.
  const [limitExhausted, setLimitExhausted] = useState(false);

  const adjustStartClamped = Math.min(info.total, Math.max(1, Math.round(Number(adjustStart)) || 1));
  const adjustTarget = adjustStartClamped - 1; // "N부터 시작" = current 를 N-1 로
  const adjustDelta = adjustTarget - info.current;
  const adjustRemaining = Math.max(0, info.threshold - info.usedToday);
  const adjustNeedsRequest = limitExhausted || Math.abs(adjustDelta) > adjustRemaining;
  const adjustCanSubmit = adjustDelta !== 0 && !adjustSaving && (!adjustNeedsRequest || adjustReason.trim().length > 0);

  return (
    <div className="mt-3 rounded-2xl border border-[#0071E3]/15 dark:border-[#0071E3]/25 bg-white dark:bg-[#1c1c1e] p-3">
      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">오늘 몇 {unit}부터 시작할까요?</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAdjustStart((v) => Math.max(1, Math.min(info.total, (Math.round(Number(v)) || 1) - 1)))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
        >
          -
        </button>
        <input
          type="number"
          min={1}
          max={info.total}
          value={adjustStart}
          onChange={(e) => setAdjustStart(e.target.value)}
          onBlur={() => setAdjustStart(adjustStartClamped)}
          className="h-9 w-20 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 text-right text-[13px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
        />
        <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">{unit}부터</span>
        <button
          type="button"
          onClick={() => setAdjustStart((v) => Math.min(info.total, Math.max(1, (Math.round(Number(v)) || 1) + 1)))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-[10px] font-medium text-slate-400 dark:text-slate-400">
        ±{info.threshold}{unit}까지는 바로 반영돼요
        {info.usedToday > 0 ? ` · 오늘 남은 자동 조정 ${adjustRemaining}${unit}` : ''}
      </p>
      <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-400">
        조정하면 이번 주 완료 체크가 초기화될 수 있어요
      </p>
      {adjustNeedsRequest && (
        <div className="mt-2 space-y-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-2.5">
          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
            {limitExhausted
              ? '오늘 바로 반영 한도를 다 썼어요. 사유를 적어 신청해 주세요.'
              : '자동 승인 범위를 넘었어요. 사유를 적어 주시면 관리자 확인 후 반영돼요.'}
          </p>
          <textarea
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="예: 앞부분 이해가 부족해서 다시 보고 갈게요"
            className="w-full resize-none rounded-xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-[#1c1c1e] p-2 text-[12px] font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
          />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!adjustCanSubmit}
          onClick={async () => {
            if (adjustSaving) return;
            setAdjustSaving(true);
            try {
              const result = await adjustStartPoint(
                materialType,
                materialId,
                adjustTarget,
                adjustNeedsRequest ? adjustReason.trim() : undefined,
              );
              // 성공 시에만 패널 닫기 — 실패하면 입력값 그대로 유지(실패 토스트는 저장 훅에서).
              if (result.ok) onClose();
              // 한도 소진(서버 needsReason) — 토스트 없이 사유 입력 모드로 전환해 안내.
              else if (result.needsReason) setLimitExhausted(true);
            } finally {
              setAdjustSaving(false);
            }
          }}
          className={`flex-1 rounded-full py-2 text-[11px] font-semibold text-white active:scale-[0.97] disabled:opacity-50 ${
            adjustNeedsRequest ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#0071E3] hover:bg-[#0077ED]'
          }`}
        >
          {adjustSaving ? '저장 중...' : adjustNeedsRequest ? '신청 보내기' : '바로 반영'}
        </button>
        <button
          type="button"
          disabled={adjustSaving}
          onClick={onClose}
          className="flex-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-60"
        >
          취소
        </button>
      </div>
    </div>
  );
}
