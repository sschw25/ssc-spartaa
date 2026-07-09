'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Edit2, Check, X, Pause, Play, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';

const DEFAULT_TARGET_MIN = 10; // 기본 세션 목표(분) — 짧게 여러 번

interface PomodoroTimerProps {
  student: Student;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  setRewardBanner: React.Dispatch<React.SetStateAction<{ show: boolean; reasons: string[] }>>;
  // 지금 교시에 인강이 배정돼 있으면 true — 강의 시청 중이 아닐 때만 탭 진입과 동시에 전체화면(몰입) 진입을 시도한다.
  isLectureTime?: boolean;
}

// 서울 기준 YYYY-MM-DD
function seoulDateKey(): string {
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// 초 → "1시간 23분" / "45분" / "0분"
function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}시간 ${mm}분`;
  return `${mm}분`;
}

// 초 → "MM:SS" (현재 세션 표시)
function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StatusPill({ canRun, running }: { canRun: boolean; running: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black transition-all ${
      canRun ? 'border-[#0071E3] bg-[#0071E3] text-white shadow-[0_2px_8px_rgba(0,113,227,0.35)]'
      : running ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      : 'border-[#0071E3]/15 bg-[#0071E3]/8 text-[#0071E3] dark:bg-[#0071E3]/15'
    }`}>
      {canRun ? '집중 중' : running ? '일시정지' : '대기'}
    </span>
  );
}

export function PomodoroTimer({ student, setStudent, setRewardBanner, isLectureTime = false }: PomodoroTimerProps) {
  const todayKey = seoulDateKey();

  // specialNote 활동 봉투에서 오늘 기록된 집중(분)·세션수 초기값
  const initialNote = (() => {
    try { return student.specialNote ? JSON.parse(student.specialNote) : {}; } catch { return {}; }
  })();
  const [serverMinutes, setServerMinutes] = useState<number>(Number(initialNote?.pomodoro_minutes?.[todayKey]) || 0);
  const [serverSessions, setServerSessions] = useState<number>(Number(initialNote?.pomodoro_sessions?.[todayKey]) || 0);

  const [sessionSec, setSessionSec] = useState(0);   // 현재 세션 경과(기록 전)
  const [running, setRunning] = useState(false);      // 학생 집중 의사(시작함)
  const [isFs, setIsFs] = useState(false);            // 전체화면 여부
  const [visible, setVisible] = useState(true);       // 탭 보임(document 가시성)
  const [focused, setFocused] = useState(true);       // 창 포커스
  const [recording, setRecording] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [targetMin, setTargetMin] = useState(DEFAULT_TARGET_MIN);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');
  const reachedTargetRef = useRef(false);

  const stateKey = `ssc-pomodoro-cu:${student.id}`;
  const targetKey = `ssc-pomodoro-target:${student.id}`;

  // 전체화면 API 지원 여부 — iOS Safari 등 미지원 환경에서는 전체화면을 요구하지 않는다
  // (아니면 타이머가 영영 멈춘 채가 됨). 미지원 환경도 앱/탭 전환은 visibilitychange 로 감지해 멈춘다.
  const fsSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const fsOk = fsSupported ? isFs : true;
  // 활성 조건 — 하나라도 깨지면 시계가 멈춘다(이탈/전체화면 해제 = 일시정지).
  const canRun = running && visible && focused && fsOk;
  const todayTotalSec = serverMinutes * 60 + sessionSec;
  const targetSec = targetMin * 60;
  const pct = Math.min(sessionSec / targetSec, 1);

  useEffect(() => { setMounted(true); }, []);

  // 목표 시간 복원
  useEffect(() => {
    const t = Number(window.localStorage.getItem(targetKey));
    if (Number.isFinite(t) && t >= 1 && t <= 180) setTargetMin(t);
  }, [targetKey]);

  // 현재 세션 경과 복원(같은 날만). 재진입 시 이어서 누적하되 재개는 학생이 직접(자동 시작 안 함).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(stateKey);
      if (!raw) return;
      const p = JSON.parse(raw) as { sessionSec?: number; dateKey?: string };
      if (p.dateKey === todayKey && Number.isFinite(p.sessionSec) && (p.sessionSec || 0) > 0) {
        setSessionSec(Math.floor(p.sessionSec!));
      } else {
        window.localStorage.removeItem(stateKey);
      }
    } catch { /* noop */ }
  }, [stateKey, todayKey]);

  // 현재 세션 경과 저장(변경 시)
  useEffect(() => {
    window.localStorage.setItem(stateKey, JSON.stringify({ sessionSec, dateKey: todayKey }));
  }, [sessionSec, stateKey, todayKey]);

  // 전체화면 변화 감지
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);
      setIsFs(fs);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // 탭 가시성 / 창 포커스 감지 — 다른 창/탭으로 넘어가면 멈춘다.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    setVisible(!document.hidden);
    // 포커스 초기값은 true 유지(환경에 따라 hasFocus() 가 부정확) — blur 이벤트로만 멈춘다.
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = document.getElementById('pomodoro-fullscreen-container');
    if (!el) return;
    try {
      if (!isFs) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    } catch { /* 브라우저 정책 등 — 무시 */ }
  }, [isFs]);

  // 집중 탭 진입 시(강의 시간 아니면·전체화면 지원 시) 전체화면 자동 진입.
  useEffect(() => {
    if (!mounted || isLectureTime || isFs || !fsSupported) return;
    toggleFullscreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isLectureTime]);

  // 세션 기록 — 완료(정지) 시 그 세션 분수를 서버에 반영. 리워드(쿠폰) 미션 연동은 서버가 처리.
  const recordSession = useCallback(async (minutes: number, opts?: { keepalive?: boolean }) => {
    if (minutes < 1) return;
    try {
      const res = await fetch('/api/student/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
        keepalive: !!opts?.keepalive,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setServerMinutes(json.pomodoroMinutes ?? (serverMinutes + minutes));
        setServerSessions(json.pomodoroCount ?? (serverSessions + 1));
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 6000);
        }
        return true;
      }
    } catch { /* 아래 false */ }
    return false;
  }, [serverMinutes, serverSessions, setStudent, setRewardBanner]);

  // 타이머 틱 — canRun 일 때만 1초씩 증가. 목표 도달 시 1회 격려 알림(자동 기록은 안 함).
  useEffect(() => {
    if (!canRun) return;
    const iv = setInterval(() => {
      setSessionSec((prev) => {
        const next = prev + 1;
        if (!reachedTargetRef.current && next >= targetSec) {
          reachedTargetRef.current = true;
          toast.success(`🎯 ${targetMin}분 집중 달성! 계속 이어가거나 '완료'로 기록하세요.`, { duration: 3500 });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [canRun, targetSec, targetMin]);

  // 완료 — 현재 세션 기록 후 초기화
  const finishSession = useCallback(async () => {
    const minutes = Math.floor(sessionSec / 60);
    setRunning(false);
    if (minutes >= 1) {
      setRecording(true);
      const ok = await recordSession(minutes);
      setRecording(false);
      if (ok) toast.success(`${minutes}분 집중을 기록했어요. 오늘 총 집중이 늘었어요!`);
      else toast.error('기록 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } else {
      toast.info('1분 이상 집중해야 기록돼요.');
    }
    setSessionSec(0);
    reachedTargetRef.current = false;
    window.localStorage.removeItem(stateKey);
  }, [sessionSec, recordSession, stateKey]);

  // 언마운트(다른 앱 탭으로 이동 등) 시 미기록 분을 best-effort 로 저장(유실 방지).
  const sessionSecRef = useRef(sessionSec);
  useEffect(() => { sessionSecRef.current = sessionSec; }, [sessionSec]);
  useEffect(() => {
    return () => {
      const minutes = Math.floor(sessionSecRef.current / 60);
      if (minutes >= 1) recordSession(minutes, { keepalive: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전체화면에서 Space 로 시작/정지
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isFs) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); setRunning((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFs]);

  const start = () => {
    setRunning(true);
    if (fsSupported && !isFs && !isLectureTime) toggleFullscreen();
  };
  const pauseManual = () => setRunning(false);
  const resetSession = () => {
    setRunning(false);
    setSessionSec(0);
    reachedTargetRef.current = false;
    window.localStorage.removeItem(stateKey);
  };

  const submitTarget = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const m = parseInt(targetDraft, 10);
    if (!isNaN(m) && m >= 1 && m <= 180) {
      setTargetMin(m);
      window.localStorage.setItem(targetKey, String(m));
      setEditingTarget(false);
      reachedTargetRef.current = sessionSec >= m * 60;
      toast.success(`세션 목표를 ${m}분으로 바꿨어요.`);
    } else {
      toast.error('1~180분 사이로 입력해 주세요.');
    }
  };

  // 일시정지 사유(활성인데 canRun 아님)
  const pauseReason = running && !canRun
    ? ((!visible || !focused) ? '다른 창으로 넘어갔어요' : (fsSupported && !isFs) ? '전체화면을 벗어났어요' : '')
    : '';

  // ── SVG 목표 진행 링 ──
  const R = 58, CIRC = 2 * Math.PI * R;
  const fsR = 130, fsCIRC = 2 * Math.PI * fsR;

  return (
    <>
      {/* 인라인 카드 */}
      <div className={`flex flex-col gap-4 rounded-3xl border p-5 transition-all duration-500 ${
        canRun ? 'border-[#0071E3]/20 bg-gradient-to-br from-white to-blue-50/60 shadow-[0_8px_32px_rgba(0,113,227,0.12)] dark:from-[#1c1c1e] dark:to-[#0071E3]/15'
        : 'border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]'
      }`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">실시간 집중 뽀모도로</p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={toggleFullscreen} className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:scale-95 dark:hover:bg-white/10" title="전체화면 (몰입 모드)">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <StatusPill canRun={canRun} running={running} />
          </div>
        </div>

        {/* 오늘 총 집중 (히어로) */}
        <div className="rounded-2xl bg-[#0071E3]/[0.05] px-4 py-3 dark:bg-[#0071E3]/10">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]/70">오늘 총 집중</p>
          <p className="mt-0.5 text-2xl font-black tabular-nums text-[#0071E3]">{formatDuration(todayTotalSec)}</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">세션 {serverSessions}회{sessionSec > 0 ? ' · 진행 중 세션 포함' : ''}</p>
        </div>

        <div className="flex flex-1 items-center gap-5">
          {/* 현재 세션 진행 링 */}
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="70" cy="70" r={R} fill="none" stroke="#F1F5F9" strokeWidth="10" className="dark:stroke-white/10" />
              <circle cx="70" cy="70" r={R} fill="none" stroke={pct >= 1 ? '#10b981' : '#0071E3'} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${pct * CIRC} ${CIRC}`} style={{ transition: 'stroke-dasharray 0.9s linear' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-[26px] font-black leading-none tabular-nums ${canRun ? 'text-[#0071E3]' : 'text-slate-800 dark:text-slate-200'}`} style={{ letterSpacing: '-0.02em' }}>
                {formatClock(sessionSec)}
              </span>
              {editingTarget ? (
                <form onSubmit={submitTarget} className="mt-1 flex items-center gap-1">
                  <input type="number" min={1} max={180} value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} autoFocus
                    className="w-11 rounded border px-1 py-0.5 text-center text-xs font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0071E3] dark:bg-white/10 dark:text-slate-200" />
                  <button type="submit" className="rounded bg-[#0071E3] p-1 text-white"><Check className="h-3 w-3" /></button>
                  <button type="button" onClick={() => setEditingTarget(false)} className="rounded bg-slate-100 p-1 text-slate-400 dark:bg-white/10"><X className="h-3 w-3" /></button>
                </form>
              ) : (
                <button type="button" onClick={() => { setTargetDraft(String(targetMin)); setEditingTarget(true); }} className="mt-0.5 flex items-center gap-0.5 text-[9px] font-bold text-slate-400 transition hover:text-[#0071E3]">
                  목표 {targetMin}분 <Edit2 className="h-2.5 w-2.5 opacity-60" />
                </button>
              )}
            </div>
          </div>

          {/* 컨트롤 */}
          <div className="flex flex-1 flex-col gap-2">
            {pauseReason && (
              <p className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-center text-[10px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                ⏸ {pauseReason} — {!isFs ? '전체화면으로 돌아오면' : '돌아오면'} 이어져요
              </p>
            )}
            {!running ? (
              <button type="button" onClick={start} className="w-full rounded-2xl bg-[#0071E3] py-3 text-xs font-black text-white shadow-[0_4px_16px_rgba(0,113,227,0.35)] transition hover:bg-[#0077ED] active:scale-95">
                <Play className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />{sessionSec > 0 ? '이어서 집중' : '집중 시작'}
              </button>
            ) : (
              <button type="button" onClick={pauseManual} className="w-full rounded-2xl bg-slate-100 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-white/10 dark:text-slate-300">
                <Pause className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />일시 정지
              </button>
            )}
            <button type="button" onClick={finishSession} disabled={recording || sessionSec < 60}
              className="w-full rounded-2xl border border-[#0071E3]/25 bg-white py-2.5 text-xs font-black text-[#0071E3] transition hover:bg-[#0071E3]/[0.04] active:scale-95 disabled:opacity-40 dark:bg-white/5 dark:hover:bg-[#0071E3]/15">
              {recording ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <><Flag className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />완료하고 기록</>}
            </button>
            <button type="button" onClick={resetSession} className="w-full rounded-2xl border border-slate-200 py-2 text-[11px] font-bold text-slate-400 transition hover:bg-slate-50 active:scale-95 dark:border-white/10">
              ↺ 이번 세션 리셋
            </button>
            <p className="text-center text-[10px] font-bold text-slate-400">1분 이상 집중하면 기록돼요. 화면을 벗어나면 자동으로 멈춰요.</p>
          </div>
        </div>
      </div>

      {/* 전체화면(Zen) — portal 로 body 직속 */}
      {mounted && createPortal(
        <div id="pomodoro-fullscreen-container"
          className={`fixed inset-0 z-50 flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white transition-all duration-300 ${isFs ? 'flex opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'}`}>
          {/* 상단 바 */}
          <div className="pointer-events-auto absolute left-6 right-6 top-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${canRun ? 'animate-pulse bg-[#0071E3]' : 'bg-amber-400'}`} />
              <span className="text-xs font-black uppercase tracking-wider opacity-80">SPARTA ZEN FOCUS</span>
            </div>
            <button type="button" onClick={toggleFullscreen} className="rounded-xl bg-white/10 p-2 text-white/70 transition hover:bg-white/20 active:scale-95" title="전체화면 종료">
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          {/* 오늘 총 집중 */}
          <div className="pointer-events-none absolute top-20 text-center">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/40">오늘 총 집중</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-white/90">{formatDuration(todayTotalSec)}</p>
            <p className="mt-0.5 text-[11px] font-bold text-white/40">세션 {serverSessions}회</p>
          </div>

          {/* 현재 세션 링 */}
          <div className="relative" style={{ width: 320, height: 320 }}>
            <svg width="320" height="320" viewBox="0 0 320 320" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="160" cy="160" r={fsR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
              <circle cx="160" cy="160" r={fsR} fill="none" stroke={pct >= 1 ? '#34d399' : '#0071E3'} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${pct * fsCIRC} ${fsCIRC}`} style={{ transition: 'stroke-dasharray 0.9s linear' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[64px] font-black leading-none tabular-nums" style={{ letterSpacing: '-0.02em' }}>{formatClock(sessionSec)}</span>
              <span className="mt-2 text-sm font-bold text-white/50">목표 {targetMin}분{pct >= 1 ? ' · 달성 ✓' : ''}</span>
            </div>
          </div>

          {/* 일시정지 오버레이 */}
          {pauseReason && (
            <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm">
              <p className="text-lg font-black text-white/90">⏸ {pauseReason}</p>
              <p className="text-sm font-semibold text-white/50">집중 시간이 멈췄어요. 돌아와서 이어가세요.</p>
              <button type="button" onClick={() => { if (!isFs) toggleFullscreen(); }} className="rounded-2xl bg-[#0071E3] px-6 py-3 text-sm font-black text-white active:scale-95">
                집중 이어가기
              </button>
            </div>
          )}

          {/* 하단 컨트롤 */}
          <div className="pointer-events-auto absolute bottom-10 flex items-center gap-3">
            {!running ? (
              <button type="button" onClick={start} className="rounded-2xl bg-[#0071E3] px-8 py-3.5 text-sm font-black text-white shadow-[0_4px_20px_rgba(0,113,227,0.5)] active:scale-95">
                <Play className="-mt-0.5 mr-1 inline h-4 w-4" />{sessionSec > 0 ? '이어서 집중' : '집중 시작'}
              </button>
            ) : (
              <button type="button" onClick={pauseManual} className="rounded-2xl bg-white/10 px-8 py-3.5 text-sm font-black text-white active:scale-95">
                <Pause className="-mt-0.5 mr-1 inline h-4 w-4" />일시 정지
              </button>
            )}
            <button type="button" onClick={finishSession} disabled={recording || sessionSec < 60}
              className="rounded-2xl border border-white/20 px-6 py-3.5 text-sm font-black text-white/90 transition hover:bg-white/10 active:scale-95 disabled:opacity-40">
              {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Flag className="-mt-0.5 mr-1 inline h-4 w-4" />완료·기록</>}
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-4 text-[11px] font-semibold text-white/30">화면을 벗어나면 자동으로 멈춰요 · Space 로 시작/정지</p>
        </div>,
        document.body,
      )}
    </>
  );
}
