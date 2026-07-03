'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  HeartPulse,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { getCampusLabel } from '@/lib/meal';

type HealthBand = 'normal' | 'watch' | 'risk';

interface HealthRow {
  studentId: string;
  name: string;
  campus: string;
  score: number;
  band: HealthBand;
  factors: { key: string; label: string; contribution: number }[];
}

type BandFilter = 'all' | HealthBand;

const CAMPUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'wonju', label: '원주' },
  { value: 'chuncheon', label: '춘천' },
  { value: 'chungju', label: '충주' },
];

const BAND_OPTIONS: { value: BandFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'risk', label: '위험' },
  { value: 'watch', label: '주의' },
  { value: 'normal', label: '정상' },
];

const DAY_OPTIONS = [7, 14, 30];

const BAND_META: Record<HealthBand, {
  label: string;
  tone: string;
  dot: string;
  text: string;
  bar: string;
}> = {
  risk: {
    label: '위험',
    tone: 'border-red-500/25 bg-red-500/10 text-red-600',
    dot: 'bg-red-500',
    text: 'text-red-600',
    bar: 'bg-red-500',
  },
  watch: {
    label: '주의',
    tone: 'border-amber-500/25 bg-amber-500/10 text-amber-700',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    bar: 'bg-amber-500',
  },
  normal: {
    label: '정상',
    tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
  },
};

function scoreTone(score: number) {
  if (score >= 60) return 'text-red-600 bg-red-500/10 border-red-500/20';
  if (score >= 30) return 'text-amber-700 bg-amber-500/10 border-amber-500/20';
  return 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20';
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-[18px] font-semibold leading-none tabular-nums text-slate-900">{value}</span>
      </div>
      <p className="mt-2 text-[13px] font-medium text-slate-900">{label}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({ hasRows }: { hasRows: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
      </div>
      <p className="mt-4 text-[15px] font-semibold text-slate-900">
        {hasRows ? '조건에 맞는 학생이 없습니다' : '케어 지수 데이터가 없습니다'}
      </p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
        {hasRows
          ? '필터나 검색어를 바꾸면 다른 학생을 확인할 수 있습니다.'
          : '출결, 학습 계획, 상담 기록이 쌓이면 이 화면에서 학생별 케어 신호를 볼 수 있습니다.'}
      </p>
    </div>
  );
}

export default function HealthScorePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = React.useState(true);
  const [rows, setRows] = React.useState<HealthRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [adminCampus, setAdminCampus] = React.useState('all');
  const [campusFilter, setCampusFilter] = React.useState('all');
  const [bandFilter, setBandFilter] = React.useState<BandFilter>('all');
  const [days, setDays] = React.useState(14);
  const [searchQuery, setSearchQuery] = React.useState('');

  async function load(nextCampus = campusFilter, nextDays = days) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('days', String(nextDays));
      if (nextCampus && nextCampus !== 'all') params.set('campus', nextCampus);
      const res = await fetch(`/api/admin/health-score?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRows([]);
        setError(json.message || '케어 지수를 불러오지 못했습니다.');
        return;
      }
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch {
      setRows([]);
      setError('네트워크 오류로 케어 지수를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    (async () => {
      try {
        const me = await fetch('/api/admin/auth/me', { cache: 'no-store', credentials: 'same-origin' });
        if (!me.ok) {
          router.replace('/admin');
          return;
        }
        const session = await me.json();
        const scopedCampus = session.campus || 'all';
        const initialCampus = scopedCampus === 'all' ? 'all' : scopedCampus;
        setAdminCampus(scopedCampus);
        setCampusFilter(initialCampus);
        await load(initialCampus, 14);
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/admin');
    }
  };

  const counts = React.useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.band] += 1;
        acc.scoreSum += row.score;
        return acc;
      },
      { total: 0, risk: 0, watch: 0, normal: 0, scoreSum: 0 },
    );
  }, [rows]);

  const averageScore = counts.total > 0 ? Math.round(counts.scoreSum / counts.total) : 0;
  const attentionCount = counts.risk + counts.watch;

  const factorSummary = React.useMemo(() => {
    const byLabel = new Map<string, number>();
    rows.forEach((row) => {
      row.factors.forEach((factor) => {
        byLabel.set(factor.label, (byLabel.get(factor.label) || 0) + factor.contribution);
      });
    });
    return Array.from(byLabel.entries())
      .map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (bandFilter !== 'all' && row.band !== bandFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        getCampusLabel(row.campus).toLowerCase().includes(q) ||
        row.factors.some((factor) => factor.label.toLowerCase().includes(q))
      );
    });
  }, [bandFilter, rows, searchQuery]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="h-7 w-7 animate-spin text-[#0071E3]" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen font-sans text-slate-900">
      <AdminTopNav
        title="케어 지수"
        titleIcon={<HeartPulse className="h-4 w-4 text-red-500" />}
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-6xl space-y-5 px-4 pb-20 pt-6 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push('/admin/dashboard')}
              className="h-9 w-9 shrink-0 rounded-xl border-black/[0.06] bg-white hover:bg-[#F5F5F7]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-slate-900">
                <HeartPulse className="h-5 w-5 text-red-500" />
                학생 케어 지수
              </h1>
              <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-slate-500">
                최근 {days}일 기준으로 결석, 이탈, 계획 이행률, 상담 공백을 합산한 관리 우선순위입니다.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => load(campusFilter, days)}
            className="h-9 shrink-0 rounded-xl border-black/[0.06] bg-white px-3 text-[12px] font-semibold hover:bg-[#F5F5F7]"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            icon={<ShieldAlert className="h-4 w-4 text-amber-700" />}
            label="관심 필요"
            value={`${attentionCount}명`}
            detail="위험·주의 밴드 합계"
            tone="bg-amber-500/10"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
            label="위험 밴드"
            value={`${counts.risk}명`}
            detail="즉시 확인 권장"
            tone="bg-red-500/10"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            label="정상 밴드"
            value={`${counts.normal}명`}
            detail="특이 신호 낮음"
            tone="bg-emerald-500/10"
          />
          <SummaryCard
            icon={<Users className="h-4 w-4 text-[#0071E3]" />}
            label="평균 점수"
            value={`${averageScore}점`}
            detail={`${counts.total}명 계산`}
            tone="bg-[#0071E3]/10"
          />
        </section>

        <section className="rounded-3xl border border-black/[0.05] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {adminCampus === 'all' && (
                <div className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1">
                  {CAMPUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCampusFilter(option.value);
                        load(option.value, days);
                      }}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        campusFilter === option.value
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1">
                {BAND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setBandFilter(option.value)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      bandFilter === option.value
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1">
                {DAY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setDays(option);
                      load(campusFilter, option);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      days === option
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {option}일
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full lg:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="학생명·센터·요인 검색"
                className="h-9 w-full rounded-full border border-black/[0.06] bg-[#F8F9FA] pl-8 pr-3 text-[12px] font-medium text-slate-900 outline-none transition focus:border-[#0071E3]/40 focus:bg-white focus:ring-2 focus:ring-[#0071E3]/10"
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-3xl border border-black/[0.05] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">학생별 케어 점수</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {loading ? '계산 중' : `${filteredRows.length}명 표시 · 점수 높은 순`}
                </p>
              </div>
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            </div>

            {loading && rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-5 py-20 text-[13px] font-semibold text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" />
                케어 지수 계산 중...
              </div>
            ) : filteredRows.length === 0 ? (
              <EmptyState hasRows={rows.length > 0} />
            ) : (
              <div className="divide-y divide-black/[0.05]">
                {filteredRows.map((row) => {
                  const band = BAND_META[row.band];
                  const topFactors = row.factors.slice(0, 4);
                  return (
                    <button
                      key={row.studentId}
                      type="button"
                      onClick={() => router.push(`/admin/consultation?studentId=${row.studentId}`)}
                      className="group w-full px-5 py-4 text-left transition-colors hover:bg-[#F8F9FA]"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border ${scoreTone(row.score)}`}>
                          <span className="text-[18px] font-semibold leading-none tabular-nums">{row.score}</span>
                          <span className="mt-0.5 text-[10px] font-medium">점</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold text-slate-900">{row.name}</span>
                            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              {getCampusLabel(row.campus)}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${band.tone}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${band.dot}`} />
                              {band.label}
                            </span>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.04]">
                            <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${Math.max(4, Math.min(100, row.score))}%` }} />
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {topFactors.length > 0 ? (
                              topFactors.map((factor) => (
                                <span
                                  key={factor.key}
                                  className="rounded-full bg-black/[0.04] px-2 py-1 text-[11px] font-medium text-[#4A4A4F]"
                                >
                                  {factor.label} +{factor.contribution}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
                                기록된 위험 요인 없음
                              </span>
                            )}
                          </div>
                        </div>

                        <ArrowRight className="mt-4 h-4 w-4 shrink-0 text-[#C7C7CC] transition-colors group-hover:text-[#0071E3]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-black/[0.05] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
              <h2 className="text-[15px] font-semibold text-slate-900">밴드 기준</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-red-500/10 p-3">
                  <p className="text-[13px] font-semibold text-red-700">위험 · 60점 이상</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-red-700/80">결석, 이탈, 상담 공백이 겹친 학생을 우선 확인합니다.</p>
                </div>
                <div className="rounded-2xl bg-amber-500/10 p-3">
                  <p className="text-[13px] font-semibold text-amber-800">주의 · 30점 이상</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-amber-800/80">최근 신호가 올라온 학생입니다. 다음 상담에서 확인하면 좋습니다.</p>
                </div>
                <div className="rounded-2xl bg-emerald-500/10 p-3">
                  <p className="text-[13px] font-semibold text-emerald-800">정상 · 30점 미만</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-emerald-800/80">현재 데이터 기준으로 큰 위험 신호가 낮습니다.</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-black/[0.05] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
              <h2 className="text-[15px] font-semibold text-slate-900">주요 위험 요인</h2>
              {factorSummary.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-[#F8F9FA] px-3 py-6 text-center text-[12px] font-medium text-slate-500">
                  집계된 위험 요인이 없습니다.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {factorSummary.map((factor) => {
                    const maxValue = factorSummary[0]?.value || 1;
                    return (
                      <div key={factor.label}>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="text-[12px] font-medium text-[#4A4A4F]">{factor.label}</span>
                          <span className="text-[12px] font-semibold tabular-nums text-slate-900">{factor.value}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/[0.04]">
                          <div
                            className="h-full rounded-full bg-[#0071E3]"
                            style={{ width: `${Math.max(8, Math.min(100, (factor.value / maxValue) * 100))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
