'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Play, Pause, Trophy, Flame, BookOpen, Timer, Infinity as InfinityIcon, Edit2, Check, X, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';

// 열품타식 자습 집중 스톱워치.
//  - 시작하면 벽시계 기준으로 카운트업. 화면(탭)을 벗어나도(강의 수강·다른 앱) 계속 흐르고,
//    '일시 정지'를 눌러야 멈춘다. 페이지를 나갔다 와도 실행 상태가 복원돼 이어진다.
//    (운영 결정 2026-07-13: 강의 듣는 동안에도 집중 시간이 쌓여야 함. 어뷰징은 리더보드의
//     재석 상한 클램프가 방어 — 체류시간보다 집중시간이 길 수 없다.)
//  - 그날 총 집중분을 주기적으로 서버에 SET-max 로 반영(중복적립 없음).
//  - 전체화면은 '몰입 모드' 옵션(누적과 무관). 태블릿은 Wake Lock 으로 화면 유지.
const FLUSH_EVERY_SEC = 60;   // 서버 반영 주기
const RANK_REFRESH_MS = 60000;

interface PomodoroTimerProps {
  student: Student;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  setRewardBanner: React.Dispatch<React.SetStateAction<{ show: boolean; reasons: string[] }>>;
  isLectureTime?: boolean;
}

function seoulDateKey(): string {
  const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}-${p.find((x) => x.type === 'day')?.value}`;
}
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h}시간 ${mm}분` : `${mm}분`;
}
function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface RankInfo { myMinutes: number; attendanceDay: number; topPercent: number | null; toTop10: number; inTop10: boolean; rank: number | null; liveCount: number; peerAvgDay: number; peerCountDay: number; }

// 학원 자습 시간대(KST 08:00~23:00) 기준, 지금까지 지난 하루 비율(0~1)
function studyDayFraction(): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === 'hour')?.value) || 0;
  const m = Number(p.find((x) => x.type === 'minute')?.value) || 0;
  const START = 8 * 60, END = 23 * 60;
  return Math.max(0, Math.min(1, ((h * 60 + m) - START) / (END - START)));
}

// 카운트다운 링 — remainFrac(1→0)에 따라 호가 줄어든다. 뽀모도로 시각화.
function CountdownRing({ size, stroke, remainFrac, color, children }: { size: number; stroke: number; remainFrac: number; color: string; children: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remainFrac));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-slate-200 dark:text-white/10" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`} style={{ transition: 'stroke-dasharray 1s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function ControlButton({ running, big, hasProgress, onStart, onPause }: { running: boolean; big?: boolean; hasProgress: boolean; onStart: () => void; onPause: () => void }) {
  if (!running) {
    return (
      <button type="button" onClick={onStart} className={`rounded-full bg-[#0071E3] font-black text-white shadow-[0_6px_20px_rgba(0,113,227,0.4)] transition hover:bg-[#0077ED] active:scale-95 ${big ? 'px-12 py-4 text-base' : 'w-full py-3.5 text-sm'}`}>
        <Play className={`-mt-0.5 mr-1.5 inline ${big ? 'h-5 w-5' : 'h-4 w-4'}`} />{hasProgress ? '이어서 집중' : '집중 시작'}
      </button>
    );
  }
  return (
    <button type="button" onClick={onPause} className={`rounded-full font-black transition active:scale-95 ${big ? 'glass-clear px-12 py-4 text-base text-white' : 'glass-capsule w-full py-3.5 text-sm text-slate-700 dark:text-slate-200'}`}>
      <Pause className={`-mt-0.5 mr-1.5 inline ${big ? 'h-5 w-5' : 'h-4 w-4'}`} />일시 정지
    </button>
  );
}

export function PomodoroTimer({ student, setStudent, setRewardBanner, isLectureTime = false }: PomodoroTimerProps) {
  const todayKey = seoulDateKey();
  const focusKey = `ssc-focus:${student.id}`;

  const initialServerSec = (() => {
    try { const n = JSON.parse(student.specialNote || '{}'); return (Number(n?.pomodoro_minutes?.[todayKey]) || 0) * 60; } catch { return 0; }
  })();

  const [todaySec, setTodaySec] = useState(initialServerSec);
  const [running, setRunning] = useState(false);
  const [isFs, setIsFs] = useState(false);
  // Fullscreen API 불가/거부 시(예: 아이폰 사파리는 요소 전체화면 미지원) CSS 오버레이로 대체하는 몰입 모드.
  const [pseudoFs, setPseudoFs] = useState(false);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [rank, setRank] = useState<RankInfo | null>(null);
  // 모드: 스톱워치(자유 누적) / 뽀모도로(세션 카운트다운). 둘 다 같은 오늘 순공에 누적된다.
  const [mode, setMode] = useState<'stopwatch' | 'pomodoro'>('stopwatch');
  const [targetMin, setTargetMin] = useState(25);
  const [sessionSec, setSessionSec] = useState(0); // 뽀모도로 현재 세션 경과
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');
  const modeKey = `ssc-focus-mode:${student.id}`;

  // 복원용 스토리지 스냅샷 — 첫 렌더에서 1회 캡처(지연 ref 초기화).
  // 저장 effect 가 마운트 직후 초기값(0/stopwatch)으로 스토리지를 잠깐 덮어써도(특히 StrictMode 이중 실행),
  // 복원 effect 는 항상 이 깨끗한 스냅샷을 읽으므로 세션 경과·모드가 리셋되지 않는다.
  const restoreSnapRef = useRef<{ focus: any; mode: any } | null>(null);
  if (restoreSnapRef.current === null && typeof window !== 'undefined') {
    let focus: any = null; let modeSnap: any = null;
    try { focus = JSON.parse(window.localStorage.getItem(focusKey) || 'null'); } catch { /* noop */ }
    try { modeSnap = JSON.parse(window.localStorage.getItem(modeKey) || 'null'); } catch { /* noop */ }
    restoreSnapRef.current = { focus, mode: modeSnap };
  }

  const todaySecRef = useRef(todaySec);
  const runningRef = useRef(running);
  const modeRef = useRef(mode);
  const targetMinRef = useRef(targetMin);
  const hiddenAtRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const wakeLockRef = useRef<any>(null);
  const sessionSecRef = useRef(sessionSec);
  useEffect(() => { todaySecRef.current = todaySec; }, [todaySec]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { sessionSecRef.current = sessionSec; }, [sessionSec]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { targetMinRef.current = targetMin; }, [targetMin]);

  useEffect(() => { setMounted(true); }, []);

  // 로컬 저장 총량 복원(같은 날) — 서버값과 큰 쪽 사용(비감소).
  // savedAt(마지막 기록 시각)이 있고 실행 중이었다면, 화면을 떠나 있던 경과분까지 얹어
  // 이어서 실행한다(벽시계 기준 — 페이지 이탈/새로고침에도 타이머가 멈추지 않는다).
  useEffect(() => {
    try {
      const p = restoreSnapRef.current?.focus as { sec?: number; sessionSec?: number; dateKey?: string; running?: boolean; savedAt?: number } | null;
      if (p) {
        if (p.dateKey === todayKey && Number.isFinite(p.sec)) {
          let gap = p.running && Number.isFinite(p.savedAt) ? Math.max(0, Math.floor((Date.now() - p.savedAt!) / 1000)) : 0;
          let resume = !!p.running;
          const prevSession = Number.isFinite(p.sessionSec) ? Math.max(0, Math.floor(p.sessionSec!)) : 0;
          // 뽀모도로 모드였다면 떠나 있던 경과는 세션 목표까지만 인정하고 자동 정지(완료) 처리.
          // (스톱워치는 기존처럼 벽시계 기준 전부 인정 — '일시 정지'를 눌러야 멈춤)
          const m = restoreSnapRef.current?.mode as { mode?: string; target?: number } | null;
          if (m?.mode === 'pomodoro' && resume) {
            const targetSec = (Number.isFinite(m.target) && m.target! >= 1 ? m.target! : 25) * 60;
            const remain = Math.max(0, targetSec - prevSession);
            if (gap >= remain) { gap = remain; resume = false; }
          }
          setTodaySec((prev) => Math.max(prev, Math.floor(p.sec!) + gap));
          // max 병합 — 재실행돼도(예: StrictMode) 세션 경과가 뒤로 가지 않는다(sec 복원과 같은 단조 규칙).
          setSessionSec((prev) => Math.max(prev, prevSession + gap));
          if (resume) setRunning(true);
        } else if (p.dateKey !== todayKey) window.localStorage.removeItem(focusKey);
      }
    } catch { /* noop */ }
  }, [focusKey, todayKey, modeKey]);

  useEffect(() => {
    window.localStorage.setItem(focusKey, JSON.stringify({ sec: todaySec, sessionSec, dateKey: todayKey, running, savedAt: Date.now() }));
  }, [todaySec, sessionSec, running, focusKey, todayKey]);

  // 자정(KST) 넘김 감지 — 어제 누적이 새 날짜로 이월돼 순공이 부풀지 않게 상태를 리셋한다.
  const dayKeyRef = useRef(todayKey);
  useEffect(() => {
    const checkRollover = () => {
      const nowKey = seoulDateKey();
      if (nowKey === dayKeyRef.current) return;
      dayKeyRef.current = nowKey;
      todaySecRef.current = 0;
      lastFlushRef.current = 0;
      setTodaySec(0);
      setSessionSec(0);
      try { window.localStorage.removeItem(focusKey); } catch { /* noop */ }
    };
    const iv = setInterval(checkRollover, 30_000);
    document.addEventListener('visibilitychange', checkRollover);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', checkRollover); };
  }, [focusKey]);

  // 모드·목표 복원/저장 — 복원은 첫 렌더 스냅샷 기준(저장 effect 의 초기값 덮어쓰기에 오염되지 않게)
  useEffect(() => {
    const p = restoreSnapRef.current?.mode as { mode?: string; target?: number } | null;
    if (!p) return;
    if (p.mode === 'pomodoro' || p.mode === 'stopwatch') setMode(p.mode);
    if (Number.isFinite(p.target) && p.target! >= 1 && p.target! <= 180) setTargetMin(p.target!);
  }, [modeKey]);
  useEffect(() => {
    window.localStorage.setItem(modeKey, JSON.stringify({ mode, target: targetMin }));
  }, [mode, targetMin, modeKey]);

  // 서버 반영(SET-max) — 중복/재시도 안전
  const flush = useCallback(async (opts?: { keepalive?: boolean }) => {
    const minutes = Math.floor(todaySecRef.current / 60);
    if (minutes < 1) return;
    try {
      const res = await fetch('/api/student/focus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }), keepalive: !!opts?.keepalive,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 6000);
        }
      }
    } catch { /* 다음 주기에 재시도 */ }
  }, [setStudent, setRewardBanner]);

  // 실시간 등수 + 재석 (집중 순위 = 리더보드 day)
  const loadRank = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?studentId=${encodeURIComponent(student.id)}`, { cache: 'no-store' });
      const j = await res.json();
      if (res.ok && j.success && j.day) {
        setRank({ myMinutes: j.day.myMinutes, attendanceDay: j.attendance?.day ?? 0, topPercent: j.day.topPercent, toTop10: j.day.toTop10, inTop10: j.day.inTop10, rank: j.day.rank, liveCount: j.liveCount ?? 0, peerAvgDay: j.peerAvgDay ?? 0, peerCountDay: j.peerCountDay ?? 0 });
      }
    } catch { /* 부가정보 */ }
  }, [student.id]);

  useEffect(() => {
    loadRank();
    const iv = setInterval(loadRank, RANK_REFRESH_MS);
    return () => clearInterval(iv);
  }, [loadRank]);

  // Wake Lock — 화면 유지(태블릿). 지원 안 하면 무시.
  const acquireWake = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current?.addEventListener?.('release', () => { wakeLockRef.current = null; });
      }
    } catch { /* 무시 */ }
  }, []);
  const releaseWake = useCallback(() => {
    try { wakeLockRef.current?.release?.(); } catch { /* 무시 */ }
    wakeLockRef.current = null;
  }, []);

  // 전체화면 변화
  useEffect(() => {
    const onFs = () => setIsFs(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); };
  }, []);

  // 가시성 — 다른 앱/화면꺼짐/강의 수강 중에도 벽시계 기준으로 계속 흐른다.
  // 스톱워치: 돌아온 시점에 경과분 전체를 그대로 인정('일시 정지'를 눌러야만 멈춤).
  // 뽀모도로: 숨겨져 있던 경과는 세션 목표까지만 인정하고 자동 정지(완료) — 목표를 넘겨도 순공이 부풀지 않는다.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        setVisible(false);
      } else {
        setVisible(true);
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt && runningRef.current) {
          let gap = Math.max(0, Math.floor((Date.now() - hiddenAt) / 1000));
          if (modeRef.current === 'pomodoro') {
            // 세션 목표까지만 인정 — 목표에 닿으면 완료 감지 effect 가 정지·토스트 처리.
            gap = Math.min(gap, Math.max(0, targetMinRef.current * 60 - sessionSecRef.current));
          }
          setTodaySec((prev) => prev + gap);
          setSessionSec((prev) => prev + gap);
          flush();
          acquireWake();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [flush, acquireWake]);

  // 틱 — 보이는 동안 running 이면 1초씩. 주기적으로 서버 반영. 두 모드 모두 오늘 순공(todaySec)에 누적.
  useEffect(() => {
    if (!running || !visible) return;
    acquireWake();
    const iv = setInterval(() => {
      setTodaySec((prev) => {
        const next = prev + 1;
        if (next - lastFlushRef.current >= FLUSH_EVERY_SEC) { lastFlushRef.current = next; flush(); }
        return next;
      });
      if (modeRef.current === 'pomodoro') {
        // 완료 판정·정지는 아래 완료 감지 effect 가 단일 담당(state updater 안 부수효과 금지).
        setSessionSec((prev) => Math.min(prev + 1, targetMinRef.current * 60));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [running, visible, flush, acquireWake]);

  // 뽀모도로 세션 완료 감지 — 틱/가시성 복귀 어느 경로로 목표에 닿아도 여기서만 정지·토스트.
  // (StrictMode updater 이중 호출로 인한 토스트/flush 중복 방지)
  useEffect(() => {
    if (!running || mode !== 'pomodoro' || sessionSec < targetMin * 60) return;
    setRunning(false);
    releaseWake();
    flush();
    toast.success(`뽀모도로 ${targetMin}분 집중 완료! 순공에 반영됐어요.`, { duration: 3500 });
  }, [running, mode, sessionSec, targetMin, releaseWake, flush]);

  // 언마운트 — 잔여 반영(유실 방지) + wake 해제
  useEffect(() => {
    return () => { flush({ keepalive: true }); releaseWake(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = document.getElementById('focus-immersive');
    if (!el) return;
    if (isFs || pseudoFs) {
      setPseudoFs(false);
      try {
        if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen && (document as any).webkitFullscreenElement) await (document as any).webkitExitFullscreen();
      } catch { /* 무시 */ }
      return;
    }
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      else setPseudoFs(true); // API 자체가 없는 브라우저 → CSS 오버레이 폴백
    } catch {
      setPseudoFs(true); // 거부/실패 → 버튼이 조용히 죽지 않게 폴백
    }
  }, [isFs, pseudoFs]);

  const start = () => {
    if (modeRef.current === 'pomodoro' && sessionSec >= targetMin * 60) setSessionSec(0);
    setRunning(true);
    acquireWake();
  };
  const pause = () => { setRunning(false); releaseWake(); flush(); };
  const switchMode = (m: 'stopwatch' | 'pomodoro') => { setMode(m); if (m === 'pomodoro') setSessionSec(0); };
  const adjustTarget = (delta: number) => { setTargetMin((prev) => Math.max(1, Math.min(180, prev + delta))); setSessionSec(0); };
  const submitTarget = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const m = parseInt(targetDraft, 10);
    if (!isNaN(m) && m >= 1 && m <= 180) { setTargetMin(m); setSessionSec(0); setEditingTarget(false); }
    else toast.error('1~180분 사이로 입력해 주세요.');
  };
  const pomoRemainSec = Math.max(0, targetMin * 60 - sessionSec);

  const rankBadge = rank && rank.myMinutes > 0
    ? (rank.inTop10 && rank.rank ? `오늘 ${rank.rank}위` : rank.topPercent != null ? `오늘 상위 ${rank.topPercent}%` : null)
    : null;
  const toTop10Label = rank && !rank.inTop10 && rank.toTop10 > 0 ? `TOP10까지 ${fmtDuration(rank.toTop10 * 60)}` : null;

  const hasProgress = todaySec > 0;

  // 내 최근 하루 평균 순공(분) — specialNote pomodoro_minutes 이력(오늘 제외, 최근 14일 중 기록일)
  const recentAvgMin = useMemo(() => {
    try {
      const pm = JSON.parse(student.specialNote || '{}')?.pomodoro_minutes as Record<string, number> | undefined;
      if (!pm) return null;
      const days = Object.entries(pm)
        .filter(([d, v]) => d !== todayKey && (Number(v) || 0) > 0)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // 최신순
        .slice(0, 14);
      if (days.length < 3) return null; // 표본 부족이면 비교 안 함
      return days.reduce((s, [, v]) => s + (Number(v) || 0), 0) / days.length;
    } catch { return null; }
  }, [student.specialNote, todayKey]);

  // 인사이트 태그 (오늘 집중 카드 안 칩) — 짧은 라벨 + 역할톤
  const insights: Array<{ key: string; tone: 'up' | 'down' | 'flat'; tag: string }> = [];
  const todayMin = Math.floor(todaySec / 60);
  if (recentAvgMin != null) {
    const frac = studyDayFraction();
    if (frac > 0.05) {
      const delta = Math.round(todayMin - recentAvgMin * frac);
      insights.push({
        key: 'pace',
        tone: delta >= 5 ? 'up' : delta <= -5 ? 'down' : 'flat',
        tag: Math.abs(delta) < 5 ? '평소와 비슷'
          : delta > 0 ? `평소보다 ${fmtDuration(delta * 60)} 많음` : `평소보다 ${fmtDuration(-delta * 60)} 부족`,
      });
    }
  }
  if (rank && rank.peerCountDay >= 3) {
    const d = Math.round(todayMin - rank.peerAvgDay);
    insights.push({
      key: 'peer',
      tone: d >= 5 ? 'up' : d <= -5 ? 'down' : 'flat',
      tag: Math.abs(d) < 5 ? '원생 평균과 비슷'
        : d > 0 ? `원생 평균 +${fmtDuration(d * 60)}` : `원생 평균 −${fmtDuration(-d * 60)}`,
    });
  }

  return (
    <>
      {/* 인라인 카드 — iOS26 Liquid Glass */}
      <div className={`glass-strong flex flex-col gap-4 rounded-[28px] p-5 transition-all duration-500 ${running && visible ? 'ring-2 ring-[#0071E3]/25' : ''}`}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">자습 집중 · 순공</p>
          <div className="flex items-center gap-1.5">
            {typeof rank?.liveCount === 'number' && rank.liveCount > 0 && (
              <span className="glass-capsule inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                <Flame className="h-2.5 w-2.5 text-emerald-500" /> {rank.liveCount}명 몰입
              </span>
            )}
            <button type="button" onClick={toggleFullscreen} className="glass-capsule grid size-8 place-items-center rounded-full text-slate-500 transition active:scale-90 dark:text-slate-300" title="몰입 모드(전체화면)">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {isLectureTime && (
          <p className="rounded-2xl bg-amber-500/10 px-3.5 py-2.5 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-500/15 dark:text-amber-300">
            <BookOpen className="mr-1 -mt-0.5 inline h-3.5 w-3.5" />지금은 강의 시간이에요 · 타이머를 켜 두면 강의 듣는 시간도 집중으로 쌓여요
          </p>
        )}

        {/* 모드 토글 — 세그먼트 컨트롤(글래스 캡슐) */}
        <div className="glass-capsule inline-flex self-start rounded-full p-1">
          {([['stopwatch', '스톱워치', InfinityIcon], ['pomodoro', '뽀모도로', Timer]] as const).map(([m, label, Ic]) => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition-all active:scale-95 ${mode === m ? 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:bg-white/20 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
              <Ic className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        {/* 오늘 집중(순공) — 대표 스탯 */}
        <div className="rounded-3xl bg-[#0071E3]/[0.06] px-5 py-4 ring-1 ring-inset ring-[#0071E3]/10 dark:bg-[#0071E3]/12">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#0071E3]/70">오늘 집중(순공)</p>
              <p className="mt-1 text-[40px] font-black leading-none tabular-nums text-[#0071E3]" style={{ letterSpacing: '-0.02em' }}>{fmtClock(todaySec)}</p>
              {rank && <p className="mt-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500">재석 {fmtDuration(rank.attendanceDay)}</p>}
            </div>
            {rankBadge && (
              <span className="glass-capsule inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black text-[#F56300]">
                <Trophy className="h-3.5 w-3.5" /> {rankBadge}
              </span>
            )}
          </div>
          {/* 인사이트 태그 — 카드 안 칩(역할색: 앞섬=에메랄드 / 뒤=앰버 / 비슷=중립) */}
          {(insights.length > 0 || toTop10Label) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {insights.map((ins) => (
                <span key={ins.key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black break-keep ${
                  ins.tone === 'up' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                  : ins.tone === 'down' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                  : 'bg-black/[0.05] text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>
                  <span className="text-[9px]">{ins.tone === 'up' ? '▲' : ins.tone === 'down' ? '▼' : '＝'}</span>{ins.tag}
                </span>
              ))}
              {toTop10Label && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0071E3]/12 px-2.5 py-1 text-[10.5px] font-black text-[#0071E3] break-keep">
                  🎯 {toTop10Label}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 뽀모도로 세션 카운트다운 링 */}
        {mode === 'pomodoro' && (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#0071E3]/[0.05] py-5 ring-1 ring-inset ring-[#0071E3]/12 dark:bg-[#0071E3]/10">
            <CountdownRing size={172} stroke={12} remainFrac={pomoRemainSec / (targetMin * 60)} color="#0071E3">
              <span className="text-[36px] font-black leading-none tabular-nums text-[#0071E3]" style={{ letterSpacing: '-0.02em' }}>{fmtClock(pomoRemainSec)}</span>
              <span className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0071E3]/60">남은 시간</span>
            </CountdownRing>
            {editingTarget ? (
              <form onSubmit={submitTarget} className="glass-capsule flex items-center gap-1 rounded-full p-1">
                <input type="number" min={1} max={180} value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} autoFocus
                  className="w-12 rounded-full bg-transparent px-2 py-0.5 text-center text-xs font-black text-slate-800 focus:outline-none dark:text-slate-100" />
                <button type="submit" className="grid size-6 place-items-center rounded-full bg-[#0071E3] text-white"><Check className="h-3 w-3" /></button>
                <button type="button" onClick={() => setEditingTarget(false)} className="grid size-6 place-items-center rounded-full text-slate-400"><X className="h-3 w-3" /></button>
              </form>
            ) : (
              <div className="glass-capsule inline-flex items-center gap-1 rounded-full p-1">
                <button type="button" onClick={() => adjustTarget(-5)} className="grid size-7 place-items-center rounded-full text-slate-500 transition active:scale-90 hover:text-[#0071E3] dark:text-slate-300"><Minus className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => { setTargetDraft(String(targetMin)); setEditingTarget(true); }} className="inline-flex items-center gap-1 px-2 text-[12px] font-black text-slate-700 dark:text-slate-200">
                  목표 {targetMin}분 <Edit2 className="h-2.5 w-2.5 opacity-50" />
                </button>
                <button type="button" onClick={() => adjustTarget(5)} className="grid size-7 place-items-center rounded-full text-slate-500 transition active:scale-90 hover:text-[#0071E3] dark:text-slate-300"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
        )}

        <ControlButton running={running} hasProgress={hasProgress} onStart={start} onPause={pause} />
        <p className="text-center text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">한 번 켜면 화면을 벗어나도 계속 쌓여요 · 쉴 때는 일시 정지를 눌러 주세요</p>
      </div>

      {/* 몰입 모드(전체화면) — 옵션 */}
      {mounted && createPortal(
        <div id="focus-immersive"
          style={{ backgroundColor: '#0b0b0c', backgroundImage: 'radial-gradient(60rem 60rem at 50% -10%, rgba(10,132,255,0.2), transparent 60%), radial-gradient(50rem 50rem at 85% 110%, rgba(10,132,255,0.1), transparent 60%)' }}
          className={`fixed inset-0 z-50 flex-col items-center justify-center text-white transition-all duration-300 ${isFs || pseudoFs ? 'flex opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'}`}>
          {/* 상단 바 */}
          <div className="pointer-events-auto absolute left-6 right-6 top-6 flex items-center justify-between">
            <span className="glass-clear inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
              <span className={`h-2 w-2 rounded-full ${running && visible ? 'animate-pulse bg-[#5AA9FF]' : 'bg-white/40'}`} />
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/80">SPARTA FOCUS</span>
            </span>
            <button type="button" onClick={toggleFullscreen} className="glass-clear grid size-10 place-items-center rounded-full text-white/80 transition active:scale-90"><Minimize2 className="h-4 w-4" /></button>
          </div>

          {/* 중앙 컨트롤 스택 — 모드 전환·타이머·목표조절·시작 모두 전체화면 안에서 */}
          <div className="pointer-events-auto flex flex-col items-center gap-6">
            {/* 모드 토글 */}
            <div className="glass-clear inline-flex rounded-full p-1">
              {([['stopwatch', '스톱워치', InfinityIcon], ['pomodoro', '뽀모도로', Timer]] as const).map(([m, label, Ic]) => (
                <button key={m} type="button" onClick={() => switchMode(m)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-bold transition active:scale-95 ${mode === m ? 'bg-white/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]' : 'text-white/50'}`}>
                  <Ic className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>

            {rankBadge && <span className="glass-clear inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-black text-[#F9A870]"><Trophy className="h-4 w-4" /> {rankBadge}</span>}

            {mode === 'pomodoro' ? (
              <>
                <CountdownRing size={300} stroke={16} remainFrac={pomoRemainSec / (targetMin * 60)} color="#5AA9FF">
                  <span className="text-[76px] font-black leading-none tabular-nums text-[#5AA9FF]" style={{ letterSpacing: '-0.03em' }}>{fmtClock(pomoRemainSec)}</span>
                  <span className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/40">세션 남은 시간</span>
                </CountdownRing>
                {/* 목표 조절 (−5 / 목표 / +5) */}
                <div className="glass-clear inline-flex items-center gap-1 rounded-full p-1.5">
                  <button type="button" onClick={() => adjustTarget(-5)} className="grid size-9 place-items-center rounded-full text-white/70 transition active:scale-90 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
                  <span className="min-w-[72px] text-center text-sm font-black text-white">목표 {targetMin}분</span>
                  <button type="button" onClick={() => adjustTarget(5)} className="grid size-9 place-items-center rounded-full text-white/70 transition active:scale-90 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
                </div>
                {/* 오늘 총 순공 (누적) */}
                <div className="glass-clear flex items-center gap-3 rounded-full px-7 py-3">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8FBFFF]">오늘 총 순공</span>
                  <span className="text-[26px] font-black leading-none tabular-nums text-white" style={{ letterSpacing: '-0.02em' }}>{fmtClock(todaySec)}</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">오늘 집중(순공)</p>
                <span className="text-[80px] font-black leading-none tabular-nums text-white" style={{ letterSpacing: '-0.03em' }}>{fmtClock(todaySec)}</span>
                {rank && <span className="glass-clear inline-flex rounded-full px-4 py-1.5 text-sm font-bold text-white/70">재석 {fmtDuration(rank.attendanceDay)}{toTop10Label ? ` · ${toTop10Label}` : ''}</span>}
              </>
            )}

            <ControlButton running={running} big hasProgress={hasProgress} onStart={start} onPause={pause} />
          </div>

          <p className="pointer-events-none absolute bottom-5 text-[11px] font-semibold text-white/30">일시 정지를 누르기 전까지 계속 흘러요 · 쉴 때는 잊지 말고 눌러서 멈춰 주세요</p>
        </div>,
        document.body,
      )}
    </>
  );
}
