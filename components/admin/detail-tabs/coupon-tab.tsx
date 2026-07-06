'use client';

import React from 'react';
import { CheckCircle2, Clock, Gift, Minus, Plus, Ticket, XCircle } from 'lucide-react';
import type { RewardGrant, RewardRedemption } from '@/lib/types/student';
import { getRewardLabel } from '@/lib/leave';

interface CouponTabProps {
  leaveCoupons?: number;
  couponGrants?: RewardGrant[];
  rewardRedemptions?: RewardRedemption[];
  onCouponAdjust?: (delta: number) => Promise<void>;
}

const redemptionStatus: Record<RewardRedemption['status'], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  requested: { label: '승인 대기', cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: Clock },
  pending: { label: '지급 대기', cls: 'bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3]', icon: Clock },
  fulfilled: { label: '지급 완료', cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  rejected: { label: '반려', cls: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400', icon: XCircle },
};

function formatDateTime(value?: string) {
  if (!value) return '시각 미기록';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: '2-digit',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }
  return /^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value : '시각 미기록';
}

export function CouponTab({
  leaveCoupons = 0,
  couponGrants = [],
  rewardRedemptions = [],
  onCouponAdjust,
}: CouponTabProps) {
  const sortedRedemptions = rewardRedemptions
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Ticket className="h-4 w-4 text-[#0071E3]" /> 쿠폰
            </h3>
            <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">현재 잔액 {leaveCoupons}장</p>
          </div>
          {onCouponAdjust && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onCouponAdjust(-1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.08] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                title="쿠폰 차감"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onCouponAdjust(1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.08] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                title="쿠폰 1장 지급"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onCouponAdjust(3)}
                className="h-8 rounded-lg border border-[#0071E3]/20 bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-3 text-[11px] font-semibold text-[#0071E3] hover:bg-[#0071E3]/10"
                title="쿠폰 3장 지급"
              >
                +3
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            <Gift className="h-3.5 w-3.5 text-amber-500" /> 쿠폰 지급 이력
          </h4>
          <span className="text-[10px] font-semibold text-slate-400">{couponGrants.length}건</span>
        </div>
        {couponGrants.length === 0 ? (
          <p className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-4 py-6 text-center text-[11px] font-semibold text-slate-400">
            지급 이력이 없습니다.
          </p>
        ) : (
          <div className="space-y-1.5">
            {couponGrants.map((grant, index) => (
              <div key={`${grant.grantedAt || grant.periodKey}_${index}`} className="flex items-center gap-2 rounded-lg bg-[#F9F9FB] dark:bg-white/5 px-3 py-2 text-[11px]">
                <span className="shrink-0 rounded-md bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/15 px-1.5 py-0.5 font-semibold text-[#0071E3]">+{grant.coupons}장</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-300">{grant.missionName}</span>
                <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">{formatDateTime(grant.grantedAt || grant.periodKey)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 교환 내역
          </h4>
          <span className="text-[10px] font-semibold text-slate-400">{sortedRedemptions.length}건</span>
        </div>
        {sortedRedemptions.length === 0 ? (
          <p className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-4 py-6 text-center text-[11px] font-semibold text-slate-400">
            교환 내역이 없습니다.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sortedRedemptions.map((redemption) => {
              const status = redemptionStatus[redemption.status];
              const StatusIcon = status.icon;
              return (
                <div key={redemption.id} className="rounded-lg bg-[#F9F9FB] dark:bg-white/5 px-3 py-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{getRewardLabel(redemption.type)}</span>
                    <span className="font-semibold text-[#0071E3]">쿠폰 {redemption.cost}장</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}>
                      <StatusIcon className="h-3 w-3" /> {status.label}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-400">{formatDateTime(redemption.createdAt)}</span>
                  </div>
                  {redemption.voucherCode && (
                    <p className="mt-1.5 rounded-md bg-white dark:bg-[#1c1c1e] px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {redemption.voucherCode}
                    </p>
                  )}
                  {redemption.note && <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{redemption.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
