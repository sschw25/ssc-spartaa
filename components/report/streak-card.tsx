'use client';

// 연속출석 스트릭 카드 — 미션 탭 해체로 홈으로 이동. 자립형: /api/student/missions-hub 에서
// 스트릭/복구 정보를 직접 가져와 렌더하고, '연속출석 잇기'는 /api/student/streak-repair 로 처리한다.
// 로드 실패 시 '0일' 같은 거짓 기본값을 보여주지 않고 아무것도 렌더하지 않는다(홈 상단 깨짐 방지).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Flame, Loader2 } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

type StreakData = {
  streak: { current: number; best?: number };
  streakRepair?: { date: string; restoredStreak: number; cost: number } | null;
  leaveCoupons: number;
};

const SURFACE = 'rounded-xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-[#1c1c1e]';

interface StreakCardProps {
  // true면 홈 상단 3열 요약용 소형 타일로 렌더(🔥+큰숫자+'일 연속'+복구 있으면 작은 '잇기' 버튼).
  // 미전달 시 기존 풀버전(카드) 그대로.
  compact?: boolean;
}

export function StreakCard({ compact = false }: StreakCardProps = {}) {
  const confirm = useConfirm();
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(async () => {
    try {
      // 경량 전용 엔드포인트(스트릭만 계산) — 무거운 missions-hub 대신 초기 렌더를 빠르게.
      const res = await fetch('/api/student/streak', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData({
            streak: json.streak ?? { current: 0 },
            streakRepair: json.streakRepair ?? null,
            leaveCoupons: json.leaveCoupons ?? 0,
          });
        }
      }
    } catch {
      // 실패 시 data 는 null 로 남아 렌더하지 않는다(거짓 0일 방지).
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => { await load(); })();
    return () => { cancelled = true; void cancelled; };
  }, [load]);

  const repairStreak = async () => {
    const repair = data?.streakRepair;
    if (!repair || repairing) return;
    const ok = await confirm({
      title: '끊긴 연속출석을 이을까요?',
      description: `쿠폰 ${repair.cost}개를 사용하면 ${repair.restoredStreak}일 연속으로 복구돼요.`,
      confirmText: '연속출석 잇기',
    });
    if (!ok) return;
    setRepairing(true);
    try {
      const res = await fetch('/api/student/streak-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: repair.date }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        await load();
        toast.success('연속출석을 이었어요!');
      } else if (json?.message) {
        toast.error(json.message);
        await load();
      }
    } catch {
      toast.error('네트워크 오류로 연속출석을 잇지 못했어요.');
    } finally {
      setRepairing(false);
    }
  };

  // 로딩 중엔 자리를 잡는 스켈레톤(늦게 툭 튀어나오는 레이아웃 시프트 방지). 실패 시엔 렌더 안 함.
  if (!data) {
    if (!loading) return null;
    if (compact) {
      return (
        <div className="flex h-full flex-col rounded-2xl border border-orange-100 bg-orange-50/50 p-3 dark:border-orange-500/20 dark:bg-orange-500/10">
          <div className="h-2 w-12 rounded bg-orange-200/60 dark:bg-orange-500/20" />
          <div className="mt-2 flex flex-1 items-center justify-center gap-1.5">
            <div className="h-4 w-4 animate-pulse rounded-full bg-orange-200/60 dark:bg-orange-500/25" />
            <div className="h-5 w-10 animate-pulse rounded bg-orange-200/60 dark:bg-orange-500/20" />
          </div>
        </div>
      );
    }
    return (
      <section className={SURFACE}>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-orange-100 dark:bg-orange-500/15" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-32 animate-pulse rounded bg-slate-100 dark:bg-white/10" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-100 dark:bg-white/10" />
          </div>
        </div>
      </section>
    );
  }

  const streakCurrent = data.streak.current ?? 0;
  const streakBest = data.streak.best;
  const streakRepair = data.streakRepair;
  const coupons = data.leaveCoupons;

  if (compact) {
    // 인사·D-Day 타일과 동일 구조(상단 라벨 → 가운데정렬 내용)로 정렬 통일.
    return (
      <div className="flex h-full flex-col rounded-2xl border border-orange-100 bg-orange-50/50 p-3 text-center shadow-sm dark:border-orange-500/20 dark:bg-orange-500/10">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-orange-600/80 dark:text-orange-400/80">연속출석</p>
        <div className="mt-1.5 min-w-0 flex-1">
          <p className="flex items-center justify-center gap-1 leading-none">
            <Flame
              className={`h-4 w-4 shrink-0 ${streakCurrent > 0 ? 'text-orange-500 animate-streak-flame' : 'text-slate-300 dark:text-slate-600'}`}
              fill={streakCurrent > 0 ? 'currentColor' : 'none'}
              strokeWidth={streakCurrent > 0 ? 1.5 : 1.8}
            />
            <span className="text-[17px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{streakCurrent}</span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">일 연속</span>
          </p>
          {streakRepair ? (
            <button
              type="button"
              onClick={repairStreak}
              disabled={repairing || coupons < streakRepair.cost}
              className="mt-1.5 inline-flex items-center gap-0.5 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-semibold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {repairing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : '잇기'}
            </button>
          ) : (
            <p className="mt-1.5 truncate text-[9px] font-medium leading-tight text-slate-400 dark:text-slate-500">
              {streakCurrent > 0 ? '이어가는 중' : '등원하면 시작'}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className={SURFACE}>
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <Flame
            className={`h-14 w-14 drop-shadow-[0_2px_6px_rgba(249,115,22,0.35)] ${streakCurrent > 0 ? 'text-orange-500 animate-streak-flame' : 'text-slate-300 dark:text-slate-600'}`}
            fill={streakCurrent > 0 ? 'currentColor' : 'none'}
            strokeWidth={streakCurrent > 0 ? 1.5 : 1.8}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{streakCurrent}</span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">일 연속 출석</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            {streakCurrent > 0 ? '오늘도 이어가는 중이에요' : '오늘 등원하면 연속출석이 시작돼요'}
            {typeof streakBest === 'number' && streakBest > streakCurrent && (
              <span className="text-orange-500">· 최고 기록 {streakBest}일</span>
            )}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">일요일은 센터 휴무일이라 연속출석에 포함하지 않아요</p>
        </div>
      </div>
      {streakRepair && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200/70 bg-orange-50 dark:border-orange-500/25 dark:bg-orange-500/10 px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">아깝게 끊긴 연속출석이 있어요</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              쿠폰 {streakRepair.cost}개로 이으면 {streakRepair.restoredStreak}일 연속으로 복구돼요 · 보유 쿠폰 {coupons}개
            </span>
          </span>
          <button
            type="button"
            onClick={repairStreak}
            disabled={repairing || coupons < streakRepair.cost}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
            연속출석 잇기
          </button>
        </div>
      )}
    </section>
  );
}
