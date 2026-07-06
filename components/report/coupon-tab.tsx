'use client';

import React from 'react';
import { ArrowRight, CheckCircle2, Clock, Gift, Sparkles, Ticket, XCircle } from 'lucide-react';
import type { Student, RewardRedemption } from '@/lib/types/student';
import { getRewardLabel } from '@/lib/leave';

interface CouponTabProps {
  student: Student;
  activeTab: string;
  onGoToExchange?: () => void;
}

const redemptionStatus: Record<RewardRedemption['status'], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  requested: { label: '승인 대기', cls: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: Clock },
  pending: { label: '지급 대기', cls: 'bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3]', icon: Clock },
  fulfilled: { label: '지급 완료', cls: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  rejected: { label: '반려', cls: 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400', icon: XCircle },
};

function formatDate(value?: string) {
  if (!value) return '시각 미기록';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }
  return /^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value : '시각 미기록';
}

export function CouponTab({ student, activeTab, onGoToExchange }: CouponTabProps) {
  if (activeTab !== 'student-coupons') return null;

  const coupons = student.leaveCoupons ?? 0;
  const redemptions = (student.rewardRedemptions || [])
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const committed = redemptions
    .filter((r) => r.status === 'requested' || r.status === 'pending')
    .reduce((sum, r) => sum + (r.cost || 0), 0);
  const available = Math.max(0, coupons - committed);
  const grants = student.couponGrants || [];

  return (
    <div id="student-coupons" className="mx-auto w-full max-w-[680px] px-4 sm:px-5 pb-6 no-print space-y-4">
      <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 shadow-sm md:p-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
          <Ticket className="h-3.5 w-3.5" /> Coupon
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">쿠폰</h3>
            <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              보유 {coupons}장 · 교환 가능 {available}장
            </p>
          </div>
          {onGoToExchange && (
            <button
              type="button"
              onClick={onGoToExchange}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#0071E3] px-4 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#0077ED]"
            >
              교환소 <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <Sparkles className="h-4 w-4 text-[#0071E3]" /> 지급 내역
          </h4>
          <span className="text-[10px] font-semibold text-slate-400">{grants.length}건</span>
        </div>
        {grants.length === 0 ? (
          <p className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-4 py-6 text-center text-xs font-semibold text-slate-400">
            아직 쿠폰 지급 내역이 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/10">
            {grants.map((grant, index) => (
              <div key={`${grant.grantedAt || grant.periodKey}_${index}`} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0071E3]/10 text-[#0071E3]">
                  <Ticket className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{grant.missionName}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{formatDate(grant.grantedAt || grant.periodKey)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#0071E3]/10 px-2.5 py-1 text-xs font-semibold text-[#0071E3]">
                  +{grant.coupons}장
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <Gift className="h-4 w-4 text-emerald-600" /> 교환 내역
          </h4>
          <span className="text-[10px] font-semibold text-slate-400">{redemptions.length}건</span>
        </div>
        {redemptions.length === 0 ? (
          <p className="rounded-lg bg-[#F5F5F7] dark:bg-white/5 px-4 py-6 text-center text-xs font-semibold text-slate-400">
            아직 쿠폰 교환 내역이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {redemptions.map((redemption) => {
              const status = redemptionStatus[redemption.status];
              const StatusIcon = status.icon;
              return (
                <div key={redemption.id} className="rounded-lg border border-black/[0.05] dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{getRewardLabel(redemption.type)}</span>
                    <span className="text-[10px] font-semibold text-[#0071E3]">쿠폰 {redemption.cost}장</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>
                      <StatusIcon className="h-3 w-3" /> {status.label}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold text-slate-400">{formatDate(redemption.createdAt)}</span>
                  </div>
                  {redemption.voucherCode && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1.5">
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">교환 번호</span>
                      <span className="ml-auto select-all font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{redemption.voucherCode}</span>
                    </div>
                  )}
                  {redemption.note && <p className="mt-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{redemption.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
