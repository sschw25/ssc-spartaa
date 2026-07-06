'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy, Loader2, Save, Sparkles, Ticket, PlayCircle, CalendarClock, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import {
  MissionId, MissionConfig, MISSION_ORDER, MISSION_META, DEFAULT_MISSION_CONFIG, normalizeMissionConfig,
} from '@/lib/missions';
import { COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';
import { ScheduledJobsPanel } from '@/components/admin/scheduled-jobs-panel';

type ConfigMap = Record<MissionId, MissionConfig>;

// settle?dry=1 미리보기 응답 항목 (lib/mission-engine MissionPreviewEntry와 동일 구조)
interface PreviewEntry {
  id: MissionId;
  periodKey: string;
  coupons: number;
  eligible: number;
  already: number;
  pending: number;
  pendingNames: string[];
  skippedReason?: string;
}

export default function MissionsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [config, setConfig] = useState<ConfigMap>(normalizeMissionConfig(DEFAULT_MISSION_CONFIG));
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  // 항목별 정산 — 대상자 미리보기 + 체크 선택
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedMissions, setSelectedMissions] = useState<Set<MissionId>>(new Set());
  const [settlingKey, setSettlingKey] = useState<string | null>(null); // missionId | 'selected'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/missions', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setConfig(normalizeMissionConfig(json.config));
          setEnabled(json.enabled !== false);
        }
      }
    } catch {
      toast.error('미션 설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  // 항목별 지급 대상 미리보기 — 저장된 설정 기준 dryRun 평가(지급 없음).
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/admin/missions/settle?dry=1', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        setPreview(json.preview || []);
        setSelectedMissions(new Set());
      } else {
        setPreview(null);
        setSelectedMissions(new Set());
        setPreviewError(json.message || '지급 대상 미리보기를 불러오지 못했습니다.');
      }
    } catch {
      setPreview(null);
      setSelectedMissions(new Set());
      setPreviewError('네트워크 오류로 지급 대상 미리보기를 불러오지 못했습니다.');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        await load();
        loadPreview();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router, load, loadPreview]);

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin');
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const update = (id: MissionId, patch: Partial<MissionConfig>) => {
    setConfig((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/missions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, enabled }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setConfig(normalizeMissionConfig(json.config));
        setEnabled(json.enabled !== false);
        setDirty(false);
        toast.success('미션 설정이 저장되었습니다.');
        loadPreview(); // 설정 변경이 지급 대상에 반영되도록 미리보기 갱신
      } else {
        toast.error(json.message || '저장에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const showSettleResult = (json: any) => {
    const lines = MISSION_ORDER
      .filter((id) => json.granted?.[id] > 0)
      .map((id) => `${MISSION_META[id].name} ${json.granted[id]}명`);
    toast.success(
      `정산 완료 — ${json.totalStudents}명에게 쿠폰 ${json.totalCoupons}장 지급` +
      (lines.length ? ` (${lines.join(', ')})` : ' (신규 지급 없음)'),
      { duration: 6000 },
    );
    if (json.skipped?.length) toast.message('일부 건너뜀: ' + json.skipped.join(' / '), { duration: 6000 });
  };

  const settleNow = async () => {
    if (dirty && !(await confirm({ title: '저장하지 않은 변경사항이 있습니다. 계속하시겠어요?', description: '현재 저장된 설정 기준으로 정산됩니다.', confirmText: '계속' }))) return;
    if (!(await confirm({ title: '지금 미션을 정산하고 쿠폰을 지급할까요?', description: '조건을 충족한 학생에게 쿠폰을 지급합니다. 같은 기간 중복 지급은 자동 방지됩니다.', tone: 'danger', confirmText: '정산·지급' }))) return;
    setSettling(true);
    try {
      const res = await fetch('/api/admin/missions/settle', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        showSettleResult(json);
        loadPreview();
      } else {
        toast.error(json.message || '정산에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 정산에 실패했습니다.');
    } finally {
      setSettling(false);
    }
  };

  // 항목별/선택 정산 — 지정한 미션만 평가·지급
  const settleByIds = async (ids: MissionId[]) => {
    if (ids.length === 0) return;
    if (dirty && !(await confirm({ title: '저장하지 않은 변경사항이 있습니다. 계속하시겠어요?', description: '현재 저장된 설정 기준으로 정산됩니다.', confirmText: '계속' }))) return;
    const names = ids.map((id) => MISSION_META[id].name).join(', ');
    if (!(await confirm({
      title: ids.length === 1 ? `'${names}' 미션을 정산할까요?` : `선택한 ${ids.length}개 미션을 정산할까요?`,
      description: `${ids.length === 1 ? '' : `${names} — `}조건 충족 학생에게 쿠폰을 지급합니다. 같은 기간 중복 지급은 자동 방지됩니다.`,
      tone: 'danger',
      confirmText: '정산·지급',
    }))) return;
    setSettlingKey(ids.length === 1 ? ids[0] : 'selected');
    try {
      const res = await fetch(`/api/admin/missions/settle?missions=${ids.join(',')}`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        showSettleResult(json);
        loadPreview();
      } else {
        toast.error(json.message || '정산에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 정산에 실패했습니다.');
    } finally {
      setSettlingKey(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0b0b0c] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans">
      <AdminTopNav
        title="쿠폰 미션 설정"
        titleIcon={<Trophy className="w-4 h-4 text-[#0071E3]" />}
        onLogout={handleLogout}
        actions={
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs h-9.5 px-3.5 font-bold disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            {dirty ? '저장' : '저장됨'}
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> 쿠폰 미션 설정
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 mt-0.5">
              조건을 충족하면 학생에게 쿠폰이 자동 적립됩니다.
            </p>
          </div>
        </div>

        {/* 전체 마스터 스위치 — OFF 면 학생에게 미션이 노출되지 않고 자동 지급도 멈춤(쿠폰 잔액·교환은 유지) */}
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm transition ${enabled ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/10' : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5'}`}>
          <div className="flex items-start gap-2.5 min-w-0">
            <Trophy className={`w-5 h-5 shrink-0 mt-0.5 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-relaxed">
              <b className="text-slate-800 dark:text-slate-100">쿠폰 미션 사용</b> — {enabled
                ? '학생에게 미션이 노출되고 조건 충족 시 쿠폰이 자동 적립됩니다.'
                : '전체 OFF — 학생에게 미션이 보이지 않고 자동 지급도 멈춥니다. (이미 적립한 쿠폰의 잔액·교환은 그대로 유지)'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input type="checkbox" className="sr-only peer" checked={enabled}
              onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} />
            <div className="w-12 h-7 bg-slate-200 dark:bg-white/10 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>

        {/* 쿠폰 경제 안내 */}
        <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 p-4 flex items-start gap-3">
          <Ticket className="w-5 h-5 text-[#0071E3] shrink-0 mt-0.5" />
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-relaxed">
            <b className="text-[#0071E3]">쿠폰 {COUPONS_PER_EXTRA_HALFDAY}장 = 반차 추가권 1회.</b> 미션으로 모은 쿠폰은
            월 한도를 초과한 반차/휴식 추가 신청에 사용됩니다. 지급 내역·잔액은{' '}
            <button className="underline font-bold text-[#0071E3]" onClick={() => router.push('/admin/leave')}>쿠폰 관리</button>
            에서 확인/조정할 수 있습니다.
          </div>
        </div>

        {/* 정산 실행 — 항목별 지급 대상 미리보기 + 체크 선택 정산 (반차 승인과 동일한 다중선택 패턴) */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <CalendarClock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-relaxed">
                <b className="text-slate-800 dark:text-slate-100">정산하기</b> — 항목별 지급 대상 확인 후 개별·선택·전체 정산.
                <span className="text-slate-400"> 저장된 설정 기준 평가 · 같은 기간 중복 지급 자동 방지</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={loadPreview}
                title="지급 대상 미리보기 새로고침"
                className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-[#F5F5F7] dark:hover:bg-white/5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
              </button>
              <Button
                size="sm"
                disabled={settling || loading || settlingKey !== null}
                onClick={settleNow}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-3.5 font-bold"
              >
                {settling ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5 mr-1" />}
                전체 정산
              </Button>
            </div>
          </div>

          {previewLoading && !preview ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-[52px] rounded-xl bg-black/[0.03] dark:bg-white/5 animate-pulse" />)}
            </div>
          ) : previewError ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/10 px-4 py-4 text-center">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{previewError}</p>
              <button
                type="button"
                onClick={loadPreview}
                className="mt-2 rounded-lg bg-white dark:bg-white/10 px-3 py-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition"
              >
                다시 시도
              </button>
            </div>
          ) : !preview || preview.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 px-4 py-5 text-center text-[11px] font-bold text-slate-400">
              정산형 미션 없음 — 쿠폰 미션 전체 스위치 또는 아래 개별 미션이 꺼져 있습니다.
            </p>
          ) : (
            <>
              {/* 선택 정산 바 — 신규 지급 대상이 있는 항목만 선택 가능 */}
              {(() => {
                const selectable = preview.filter((p) => p.pending > 0 && !p.skippedReason);
                const selCount = selectable.filter((p) => selectedMissions.has(p.id)).length;
                const allSel = selectable.length > 0 && selCount === selectable.length;
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-white/5 px-3.5 py-2">
                    <label className={`flex items-center gap-2 text-[11px] font-bold select-none ${selectable.length === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300 cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        disabled={selectable.length === 0}
                        checked={allSel}
                        onChange={() => setSelectedMissions(allSel ? new Set() : new Set(selectable.map((p) => p.id)))}
                        className="h-4 w-4 rounded border-slate-300 dark:border-white/20 accent-[#0071E3] cursor-pointer disabled:cursor-not-allowed"
                      />
                      지급 대상 있는 항목 전체 선택 <span className="text-slate-400 dark:text-slate-500 font-semibold">({selCount}/{selectable.length})</span>
                    </label>
                    <Button
                      size="sm"
                      disabled={selCount === 0 || settlingKey !== null || settling}
                      onClick={() => settleByIds(Array.from(selectedMissions))}
                      className="rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-white text-[11px] h-8 px-3 font-bold disabled:opacity-40"
                    >
                      {settlingKey === 'selected' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                      선택 {selCount}개 정산
                    </Button>
                  </div>
                );
              })()}

              {/* 항목별 행 */}
              <div className="divide-y divide-slate-100 dark:divide-white/10 rounded-xl border border-slate-100 dark:border-white/10 overflow-hidden">
                {preview.map((p) => {
                  const meta = MISSION_META[p.id];
                  const actionable = p.pending > 0 && !p.skippedReason;
                  return (
                    <div key={p.id} className={`px-3.5 py-3 space-y-1.5 ${actionable ? 'bg-white dark:bg-[#1c1c1e]' : 'bg-slate-50/50 dark:bg-white/[0.02]'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!actionable}
                          checked={selectedMissions.has(p.id)}
                          onChange={() => setSelectedMissions((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                            return next;
                          })}
                          className="h-4 w-4 rounded border-slate-300 dark:border-white/20 accent-[#0071E3] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
                        />
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{meta.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${meta.period === 'weekly' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
                          {meta.period === 'weekly' ? '주간' : '월간'}
                        </span>
                        {/* 조건 충족/지급 상태 — 명사형 */}
                        {p.skippedReason ? (
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{p.skippedReason}</span>
                        ) : p.pending > 0 ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            신규 지급 대상 {p.pending}명 · 쿠폰 {p.coupons}장씩{p.already > 0 ? ` · 기지급 ${p.already}명` : ''}
                          </span>
                        ) : p.eligible > 0 ? (
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">충족 {p.eligible}명 전원 지급 완료</span>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">조건 충족자 없음</span>
                        )}
                        <button
                          onClick={() => settleByIds([p.id])}
                          disabled={!actionable || settlingKey !== null || settling}
                          className="ml-auto shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-500 text-white text-[11px] font-bold px-2.5 h-7 transition inline-flex items-center gap-1"
                        >
                          {settlingKey === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                          정산
                        </button>
                      </div>
                      {/* 신규 지급 대상 명단 */}
                      {p.pending > 0 && (
                        <div className="flex flex-wrap gap-1 pl-6">
                          {p.pendingNames.slice(0, 12).map((name, i) => (
                            <span key={`${name}_${i}`} className="rounded-full bg-black/[0.03] dark:bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                              {name}
                            </span>
                          ))}
                          {p.pending > 12 && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-slate-400">+{p.pending - 12}명</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 자동 정산 예약 — 미션 관련 잡(주간/월간 정산)만. 전체 잡은 /admin/schedules 에서 관리 */}
        <ScheduledJobsPanel jobIds={['weekly_settle', 'monthly_settle']} collapsible />

        {/* 미션 목록 — 첫 로딩만 스피너, 재조회 중에는 콘텐츠 유지 */}
        {loading && !loadedOnce ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-[#0071E3] mx-auto" /></div>
        ) : (
          <div className={`space-y-3 transition ${enabled ? '' : 'opacity-60'}`}>
            {!enabled && (
              <p className="text-[11px] font-bold text-slate-400">
                쿠폰 미션이 전체 OFF 상태입니다. 아래 개별 설정은 다시 켜야 적용됩니다.
              </p>
            )}
            {MISSION_ORDER.map((id) => {
              const meta = MISSION_META[id];
              const c = config[id];
              return (
                <div key={id} className={`rounded-2xl border bg-white dark:bg-[#1c1c1e] p-4 sm:p-5 shadow-sm transition ${c.enabled ? 'border-slate-200 dark:border-white/10' : 'border-slate-100 dark:border-white/10 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">{meta.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                          meta.period === 'weekly' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600'
                          : meta.period === 'monthly' ? 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                          : meta.period === 'daily' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600'
                          : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600'
                        }`}>
                          {meta.period === 'weekly' ? '주간' : meta.period === 'monthly' ? '월간' : meta.period === 'daily' ? '매일' : 'OT'}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{meta.describe(c)}</p>
                      {id === 'ot_attendance' && (
                        <button onClick={() => router.push('/admin/ot-events')}
                          className="mt-1.5 text-[11px] font-black text-[#0071E3] underline underline-offset-2">
                          OT 일정 등록·참여 처리 →
                        </button>
                      )}
                    </div>
                    {/* 활성 토글 */}
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox" className="sr-only peer" checked={c.enabled} onChange={(e) => update(id, { enabled: e.target.checked })} />
                      <div className="w-10 h-6 bg-slate-200 dark:bg-white/10 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                    </label>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-slate-100 dark:border-white/10 pt-3.5">
                    {/* 쿠폰 보상 */}
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">지급 쿠폰</span>
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={1} max={10} value={c.coupons}
                          onChange={(e) => update(id, { coupons: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                          className="w-16 rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/5 px-2.5 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none" />
                        <span className="text-xs font-bold text-slate-400">장</span>
                      </div>
                    </label>
                    {/* 미션별 파라미터 */}
                    {meta.params.map((p) => (
                      <label key={String(p.key)} className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{p.label}</span>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={p.min} max={p.max} value={(c[p.key] as number) ?? p.min}
                            onChange={(e) => update(id, { [p.key]: Math.max(p.min, Math.min(p.max, Number(e.target.value) || p.min)) } as Partial<MissionConfig>)}
                            className="w-16 rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/5 px-2.5 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none" />
                          <span className="text-xs font-bold text-slate-400">{p.unit}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <Sparkles className="w-3 h-3" /> {meta.settleHint}
                  </p>
                </div>
              );
            })}

          </div>
        )}
      </main>
    </div>
  );
}
