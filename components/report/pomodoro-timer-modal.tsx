'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Minimize2, Edit2, Target, Coffee, Check, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';

interface PomodoroTimerProps {
  student: Student;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  setRewardBanner: React.Dispatch<React.SetStateAction<{ show: boolean; reasons: string[] }>>;
}

export function PomodoroTimer({ student, setStudent, setRewardBanner }: PomodoroTimerProps) {
  const [pomodoroSeconds, setPomodoroSeconds] = useState(3000); // 50분 집중 = 3000초
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroMode, setPomodoroMode] = useState<'focus' | 'rest'>('focus');
  const [isPomodoroFullscreen, setIsPomodoroFullscreen] = useState(false);
  const [isEditingPomoTime, setIsEditingPomoTime] = useState(false);
  const [pomoEditValue, setPomoEditValue] = useState('');
  const pomodoroSecondsKey = `ssc-pomodoro-seconds:${student.id}`;
  const pomodoroStateKey = `ssc-pomodoro-state:${student.id}`;

  // 집중 이탈(알트탭/창전환) 카운트 — 진행 중 집중 세션 동안만 누적
  const [distractions, setDistractions] = useState(0);
  const distractionsRef = useRef(0);
  const activeRef = useRef(pomodoroActive);
  const modeRef = useRef(pomodoroMode);
  useEffect(() => { activeRef.current = pomodoroActive; }, [pomodoroActive]);
  useEffect(() => { modeRef.current = pomodoroMode; }, [pomodoroMode]);
  const resetDistractions = () => { distractionsRef.current = 0; setDistractions(0); };

  // 집중 세션 중 화면이 가려지면(탭 전환·알트탭·최소화) 1회 이탈로 집계
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && activeRef.current && modeRef.current === 'focus') {
        distractionsRef.current += 1;
        setDistractions(distractionsRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const clearStoredPomodoro = () => {
    window.localStorage.removeItem(pomodoroSecondsKey);
    window.localStorage.removeItem(pomodoroStateKey);
  };

  // 서울 기준 YYYY-MM-DD 날짜 키 구하기
  const getSeoulDateKey = () => {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  // specialNote 파싱 헬퍼
  const getSpecialNoteObj = () => {
    try {
      if (!student.specialNote) return {};
      const obj = JSON.parse(student.specialNote);
      if (typeof obj === 'object' && obj !== null) return obj;
      return { noteText: student.specialNote };
    } catch {
      return { noteText: student.specialNote || '' };
    }
  };

  // 뽀모도로 시간 포맷팅 헬퍼
  const formatPomodoroTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 풀스크린 상태 감지 브라우저 이벤트 연동
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsPomodoroFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 전체화면 토글 헬퍼 함수
  const toggleFullscreen = async (elementId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (!isPomodoroFullscreen) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        } else if ((el as any).mozRequestFullScreen) {
          await (el as any).mozRequestFullScreen();
        } else if ((el as any).msRequestFullscreen) {
          await (el as any).msRequestFullscreen();
        }
        setIsPomodoroFullscreen(true);
      } catch (err) {
        console.error('Failed to enter fullscreen:', err);
        setIsPomodoroFullscreen(true);
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        setIsPomodoroFullscreen(false);
      } catch (err) {
        console.error('Failed to exit fullscreen:', err);
        setIsPomodoroFullscreen(false);
      }
    }
  };

  // 젠모드 내 스페이스바 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPomodoroFullscreen) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPomodoroActive((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPomodoroFullscreen]);

  // 수동 시간 제출 핸들러
  const handlePomoTimeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const mins = parseInt(pomoEditValue, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 180) {
      const secs = mins * 60;
      setPomodoroSeconds(secs);
      window.localStorage.setItem(pomodoroSecondsKey, String(secs));
      setIsEditingPomoTime(false);
      toast.success(`타이머가 ${mins}분으로 수정되었습니다.`);
    } else {
      toast.error('1분에서 180분 사이의 올바른 숫자를 입력해주세요.');
    }
  };

  // 퀵 시간 조절 핸들러
  const adjustPomoMinutes = (diffMinutes: number) => {
    setPomodoroSeconds((prev) => {
      let next = prev + diffMinutes * 60;
      if (next < 0) next = 0;
      if (next > 180 * 60) next = 180 * 60;
      window.localStorage.setItem(pomodoroSecondsKey, String(next));
      return next;
    });
    toast.success(`${diffMinutes > 0 ? '+' : ''}${diffMinutes}분 조정되었습니다.`);
  };

  // 뽀모도로 세션 완료 시 백엔드 API 호출
  const handlePomodoroComplete = async (elapsedSeconds = 3000) => {
    const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const sessionDistractions = distractionsRef.current;
    try {
      const res = await fetch('/api/student/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes, distractions: sessionDistractions }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        resetDistractions();
        toast.success(
          sessionDistractions > 0
            ? `🎉 ${minutes}분 집중 완료! (이번 세션 집중이탈 ${sessionDistractions}회) 10분 휴식 모드로 전환됩니다.`
            : `🎉 ${minutes}분 집중 완료! 흐트러짐 없이 몰입했어요. 10분 휴식 모드로 전환됩니다.`,
          { duration: 4000 },
        );
        setPomodoroMode('rest');
        setPomodoroSeconds(600); // 10분 휴식 = 600초

        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 6000);
        }
      }
    } catch {
      toast.error('뽀모도로 완료 저장 중 문제가 발생했습니다.');
    }
  };

  // 뽀모도로 타이머 루프 및 30초마다 로컬 저장소 동기화
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (pomodoroActive && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds((prev) => {
          const next = prev - 1;
          if (next % 30 === 0) {
            window.localStorage.setItem(pomodoroSecondsKey, String(next));
          }
          return next;
        });
      }, 1000);
    } else if (pomodoroSeconds === 0) {
      if (pomodoroMode === 'focus') {
        handlePomodoroComplete();
      } else {
        toast('휴식 완료! 다시 집중할 시간입니다 🔵', { duration: 4000 });
        setPomodoroMode('focus');
        setPomodoroSeconds(3000);
        resetDistractions(); // 새 집중 세션 시작 — 이탈 카운트 초기화
      }
      setPomodoroActive(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pomodoroActive, pomodoroSeconds, pomodoroMode]);

  useEffect(() => {
    const savedState = window.localStorage.getItem(pomodoroStateKey);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState) as {
          seconds?: number;
          mode?: 'focus' | 'rest';
          active?: boolean;
          updatedAt?: number;
        };
        if (parsed.mode === 'focus' || parsed.mode === 'rest') {
          const savedSeconds = Number(parsed.seconds);
          const elapsedSeconds = parsed.active && parsed.updatedAt
            ? Math.max(0, Math.floor((Date.now() - parsed.updatedAt) / 1000))
            : 0;
          const nextSeconds = Number.isFinite(savedSeconds) ? Math.max(0, savedSeconds - elapsedSeconds) : 3000;
          setPomodoroMode(parsed.mode);
          setPomodoroSeconds(nextSeconds || (parsed.mode === 'rest' ? 600 : 3000));
          setPomodoroActive(Boolean(parsed.active && nextSeconds > 0));
          return;
        }
      } catch {
        // legacy seconds fallback below
      }
    }

    const saved = window.localStorage.getItem(pomodoroSecondsKey);
    if (saved) {
      const secs = Number(saved);
      if (Number.isFinite(secs) && secs > 0) setPomodoroSeconds(secs);
    }
  }, [pomodoroSecondsKey, pomodoroStateKey]);

  useEffect(() => {
    window.localStorage.setItem(pomodoroSecondsKey, String(pomodoroSeconds));
    window.localStorage.setItem(
      pomodoroStateKey,
      JSON.stringify({
        seconds: pomodoroSeconds,
        mode: pomodoroMode,
        active: pomodoroActive,
        updatedAt: Date.now(),
      }),
    );
  }, [pomodoroActive, pomodoroMode, pomodoroSeconds, pomodoroSecondsKey, pomodoroStateKey]);

  const totalSecs = pomodoroMode === 'focus' ? 3000 : 600;
  const remaining = pomodoroSeconds;
  const pct = Math.min(remaining / totalSecs, 1);
  const R = 58;
  const CIRC = 2 * Math.PI * R;
  const dash = pct * CIRC;
  const note = getSpecialNoteObj();
  const todayKey = getSeoulDateKey();
  const sessionCount = note.pomodoro_sessions?.[todayKey] || 0;
  const todayDistractions = note.pomodoro_distractions?.[todayKey] || 0;
  const isFocus = pomodoroMode === 'focus';
  const ringColor = isFocus ? '#0071E3' : '#10B981';
  const glowId = `pomo-glow-${isFocus ? 'blue' : 'green'}`;
  const tipAngle = pct * 2 * Math.PI;
  const tipCx = 70 + R * Math.cos(tipAngle);
  const tipCy = 70 + R * Math.sin(tipAngle);

  // 젠모드용 변수들
  const fsR = 135;
  const fsCIRC = 2 * Math.PI * fsR;
  const fsDash = pct * fsCIRC;
  const fsGlowId = `pomo-fs-glow-${isFocus ? 'blue' : 'green'}`;
  const fsTipAngle = pct * 2 * Math.PI;
  const fsTipCx = 160 + fsR * Math.cos(fsTipAngle);
  const fsTipCy = 160 + fsR * Math.sin(fsTipAngle);

  return (
    <>
      <div className={`rounded-3xl border p-5 flex flex-col justify-between gap-4 transition-all duration-500 ${
        pomodoroActive
          ? isFocus
            ? 'bg-gradient-to-br from-white to-blue-50/60 border-[#0071E3]/20 shadow-[0_8px_32px_rgba(0,113,227,0.12)]'
            : 'bg-gradient-to-br from-white to-emerald-50/60 border-emerald-300/30 shadow-[0_8px_32px_rgba(16,185,129,0.12)]'
          : 'bg-white border-slate-100 shadow-sm'
      }`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">실시간 집중 뽀모도로</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggleFullscreen('pomodoro-fullscreen-container')}
              className="p-1 hover:bg-slate-100 active:scale-95 text-slate-400 hover:text-slate-600 rounded transition"
              title="전체화면 (몰입 모드)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black border transition-all ${
              pomodoroActive
                ? isFocus
                  ? 'bg-[#0071E3] text-white border-[#0071E3] shadow-[0_2px_8px_rgba(0,113,227,0.35)]'
                  : 'bg-emerald-500 text-white border-emerald-500 shadow-[0_2px_8px_rgba(16,185,129,0.35)]'
                : isFocus
                  ? 'bg-[#0071E3]/8 text-[#0071E3] border-[#0071E3]/15'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              {isFocus ? <Target className="w-2.5 h-2.5" /> : <Coffee className="w-2.5 h-2.5" />}
              {isFocus ? '집중 50분' : '휴식 10분'}
            </span>
          </div>
        </div>

        {/* SVG 링 + 타이머 */}
        <div className="flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {/* 배경 링 */}
              <circle cx="70" cy="70" r={R} fill="none" stroke="#F1F5F9" strokeWidth="10" />
              {/* 트랙 눈금 (4세션 구분선) */}
              {[0, 1, 2, 3].map(i => {
                const a = (i / 4) * 2 * Math.PI - Math.PI / 2;
                const x1 = 70 + (R - 7) * Math.cos(a);
                const y1 = 70 + (R - 7) * Math.sin(a);
                const x2 = 70 + (R + 7) * Math.cos(a);
                const y2 = 70 + (R + 7) * Math.sin(a);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="2.5" />;
              })}
              {/* 카운트다운 링 — 꽉 찬 상태에서 줄어듦 */}
              <circle
                cx="70" cy="70" r={R} fill="none"
                stroke={pct > 0.005 ? ringColor : 'transparent'} strokeWidth="10"
                strokeLinecap={pct > 0.99 ? 'butt' : 'round'}
                strokeDasharray={`${dash} ${CIRC}`}
                filter={pomodoroActive && pct < 0.99 ? `url(#${glowId})` : undefined}
                style={{ transition: 'stroke-dasharray 0.8s linear' }}
              />
              {/* tip 빛 점 (진행 중일 때, 꽉 찬 상태가 아닐 때) */}
              {pct > 0.02 && pct < 0.99 && (
                <circle cx={tipCx} cy={tipCy} r="6" fill={ringColor} opacity={pomodoroActive ? 1 : 0.6}
                  filter={pomodoroActive ? `url(#${glowId})` : undefined} />
              )}
              {/* 세션 완료 점 */}
              {sessionCount > 0 && Array.from({ length: Math.min(sessionCount, 8) }).map((_, i) => {
                const angle = (i / 8) * 2 * Math.PI - Math.PI / 2;
                const cx = 70 + (R + 16) * Math.cos(angle);
                const cy = 70 + (R + 16) * Math.sin(angle);
                return <circle key={i} cx={cx} cy={cy} r="4" fill={ringColor} opacity="0.8" />;
              })}
            </svg>
            {/* 중앙 시간 표시 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {isEditingPomoTime ? (
                <form onSubmit={handlePomoTimeSubmit} className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-sm border border-slate-100">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={pomoEditValue}
                    onChange={(e) => setPomoEditValue(e.target.value)}
                    className="w-12 px-1 py-0.5 text-xs text-center border rounded font-black focus:outline-none focus:ring-1 focus:ring-[#0071E3] text-slate-800"
                    placeholder="분"
                    autoFocus
                  />
                  <button type="submit" className="p-1 bg-[#0071E3] text-white rounded text-[9px] font-black hover:bg-[#0077ED]">
                    <Check className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => setIsEditingPomoTime(false)} className="p-1 bg-slate-100 text-slate-400 rounded text-[9px] font-bold hover:bg-slate-200">
                    <X className="w-3 h-3" />
                  </button>
                </form>
              ) : (
                <>
                  <span
                    onClick={() => {
                      setPomoEditValue(String(Math.ceil(pomodoroSeconds / 60)));
                      setIsEditingPomoTime(true);
                    }}
                    className={`text-[28px] font-black leading-none tabular-nums cursor-pointer transition-colors hover:opacity-85 ${
                      pomodoroActive ? (isFocus ? 'text-[#0071E3]' : 'text-emerald-600') : 'text-slate-800'
                    }`}
                    style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                    title="클릭하여 시간 수정"
                  >
                    {formatPomodoroTime(pomodoroSeconds)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPomoEditValue(String(Math.ceil(pomodoroSeconds / 60)));
                      setIsEditingPomoTime(true);
                    }}
                    className="text-[9px] font-bold text-slate-400 mt-0.5 flex items-center gap-0.5 hover:text-[#0071E3] transition"
                  >
                    {isFocus ? '집중' : '휴식'} <Edit2 className="w-2.5 h-2.5 opacity-60" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 버튼 + 세션 카운트 */}
          <div className="flex flex-col gap-2 flex-1">
            <button
              type="button"
              onClick={() => setPomodoroActive(!pomodoroActive)}
              className={`w-full rounded-2xl text-xs font-black py-3 transition active:scale-95 ${
                pomodoroActive
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : isFocus
                    ? 'bg-[#0071E3] hover:bg-[#0077ED] text-white shadow-[0_4px_16px_rgba(0,113,227,0.35)]'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_4px_16px_rgba(16,185,129,0.35)]'
              }`}
            >
              {pomodoroActive ? '⏸ 일시 정지' : isFocus ? '▶ 집중 시작' : '▶ 휴식 시작'}
            </button>
            {isFocus && pomodoroSeconds < 3000 ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    setPomodoroActive(false);
                    clearStoredPomodoro();
                    await handlePomodoroComplete(3000 - pomodoroSeconds);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-2xl border border-[#0071E3]/30 bg-[#0071E3]/5 hover:bg-[#0071E3]/10 text-[#0071E3] py-2.5 text-xs font-black transition active:scale-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 세션 완료
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPomodoroActive(false);
                    setPomodoroMode('focus');
                    setPomodoroSeconds(3000);
                    clearStoredPomodoro();
                  }}
                  className="w-full text-center text-[10px] font-bold text-slate-300 hover:text-slate-400 py-1 transition"
                >
                  ↺ 리셋
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPomodoroActive(false);
                  setPomodoroMode('focus');
                  setPomodoroSeconds(3000);
                  clearStoredPomodoro();
                }}
                className="w-full rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-500 py-2.5 text-xs font-bold transition active:scale-95"
              >
                ↺ 리셋
              </button>
            )}
          </div>
        </div>

        {/* 집중 이탈(알트탭/창전환) 카운트 — 본인·학원 모두 확인 */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-2">
          <span className="text-[10px] font-bold text-slate-400">집중 이탈 (창 전환·알트탭)</span>
          <span className="flex items-center gap-2">
            {pomodoroActive && isFocus && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${distractions > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
                이번 세션 {distractions}회
              </span>
            )}
            <span className="text-[11px] font-black text-slate-600">오늘 {todayDistractions}회</span>
          </span>
        </div>
      </div>

      {/* 🔴 뽀모도로 타이머 전체화면 (Zen 모드) 오버레이 */}
      <div
        id="pomodoro-fullscreen-container"
        className={`fixed inset-0 z-50 flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white transition-all duration-300 ${
          isPomodoroFullscreen ? 'flex opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'
        }`}
      >
        {/* 상단 컨트롤 바 */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3] animate-pulse" />
            <span className="text-xs font-black tracking-wider uppercase opacity-80">SPARTA ZEN FOCUS</span>
            {isFocus && (
              <span className={`ml-1 rounded-full px-2.5 py-1 text-[11px] font-black ${distractions > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-slate-300'}`}>
                집중 이탈 {distractions}회
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleFullscreen('pomodoro-fullscreen-container')}
            className="p-2 hover:bg-white/10 active:scale-95 rounded-xl transition flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white"
            title="전체화면 종료 (Esc)"
          >
            <Minimize2 className="w-4 h-4" />
            <span>화면 축소</span>
          </button>
        </div>

        {/* 중앙 거대 타이머 */}
        <div className="flex flex-col items-center gap-8 max-w-lg w-full px-6">
          {/* 타이머 링 */}
          <div className="relative shrink-0" style={{ width: 320, height: 320 }}>
            <svg width="320" height="320" viewBox="0 0 320 320" style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <filter id={fsGlowId} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* 배경 링 */}
              <circle cx="160" cy="160" r={fsR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
              {/* 4분할 눈금 */}
              {[0, 1, 2, 3].map(i => {
                const a = ((i / 4)) * 2 * Math.PI - (Math.PI / 2);
                const x1 = 160 + (fsR - 10) * Math.cos(a);
                const y1 = 160 + (fsR - 10) * Math.sin(a);
                const x2 = 160 + (fsR + 10) * Math.cos(a);
                const y2 = 160 + (fsR + 10) * Math.sin(a);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth="3" />;
              })}
              {/* 카운트다운 링 */}
              <circle
                cx="160" cy="160" r={fsR} fill="none"
                stroke={pct > 0.005 ? ringColor : 'transparent'} strokeWidth="12"
                strokeLinecap={pct > 0.99 ? 'butt' : 'round'}
                strokeDasharray={`${fsDash} ${fsCIRC}`}
                filter={pomodoroActive && pct < 0.99 ? `url(#${fsGlowId})` : undefined}
                style={{ transition: 'stroke-dasharray 0.8s linear' }}
              />
              {/* tip 빛 점 */}
              {pct > 0.02 && pct < 0.99 && (
                <circle cx={fsTipCx} cy={fsTipCy} r="8" fill={ringColor} opacity={pomodoroActive ? 1 : 0.6}
                  filter={pomodoroActive ? `url(#${fsGlowId})` : undefined} />
              )}
            </svg>

            {/* 중앙 텍스트 (시간 & 상태) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto">
              {isEditingPomoTime ? (
                <form onSubmit={handlePomoTimeSubmit} className="flex flex-col items-center gap-2 bg-slate-900/90 p-4 rounded-3xl border border-slate-800 shadow-2xl">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="180"
                      value={pomoEditValue}
                      onChange={(e) => setPomoEditValue(e.target.value)}
                      className="w-24 px-2 py-1 text-2xl font-black text-center border-2 border-slate-700 bg-slate-950 text-white rounded-xl focus:outline-none focus:border-[#0071E3]"
                      placeholder="분"
                      autoFocus
                    />
                    <span className="text-sm font-bold text-slate-400">분</span>
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <button type="submit" className="px-3 py-1 text-[11px] font-black bg-[#0071E3] text-white rounded-lg hover:bg-[#0077ED] transition">
                      확인
                    </button>
                    <button type="button" onClick={() => setIsEditingPomoTime(false)} className="px-3 py-1 text-[11px] font-bold bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition">
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <span
                    onClick={() => {
                      setPomoEditValue(String(Math.ceil(pomodoroSeconds / 60)));
                      setIsEditingPomoTime(true);
                    }}
                    className={`text-6xl font-black leading-none tabular-nums cursor-pointer transition-colors hover:text-[#0071E3]/80 ${
                      pomodoroActive ? (isFocus ? 'text-[#0071E3]' : 'text-emerald-500') : 'text-white'
                    }`}
                    style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                    title="클릭하여 시간 수정"
                  >
                    {formatPomodoroTime(pomodoroSeconds)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPomoEditValue(String(Math.ceil(pomodoroSeconds / 60)));
                      setIsEditingPomoTime(true);
                    }}
                    className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1 hover:text-white transition"
                  >
                    {isFocus ? <Target className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
                    {isFocus ? '집중 세션' : '휴식 세션'} <Edit2 className="w-3 h-3 opacity-60" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 하단 컨트롤 영역 */}
          <div className="w-full flex flex-col gap-4 items-center">
            {/* 메인 재생/정지 및 완료/리셋 버튼 */}
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setPomodoroActive(!pomodoroActive)}
                className={`flex-1 rounded-2xl text-sm font-black py-3.5 transition active:scale-95 shadow-lg ${
                  pomodoroActive
                    ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                    : isFocus
                      ? 'bg-[#0071E3] hover:bg-[#0077ED] text-white shadow-[0_8px_24px_rgba(0,113,227,0.4)]'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.4)]'
                }`}
              >
                {pomodoroActive ? '⏸ 일시 정지' : isFocus ? '▶ 집중 시작' : '▶ 휴식 시작'}
              </button>

              {isFocus && pomodoroSeconds < 3000 ? (
                <button
                  type="button"
                  onClick={async () => {
                    setPomodoroActive(false);
                    clearStoredPomodoro();
                    await handlePomodoroComplete(3000 - pomodoroSeconds);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 py-3.5 text-sm font-black transition active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> 세션 완료
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setPomodoroActive(false);
                  setPomodoroMode('focus');
                  setPomodoroSeconds(3000);
                  clearStoredPomodoro();
                }}
                className="px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 transition active:scale-95"
                title="리셋"
              >
                ↺ 리셋
              </button>
            </div>

            {/* 퀵 시간 조절 */}
            <div className="flex gap-2 items-center justify-between text-xs font-black text-slate-400 bg-white/5 border border-white/5 rounded-2xl p-2 w-full">
              <button type="button" onClick={() => adjustPomoMinutes(-5)} className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white rounded-lg transition active:scale-90">-5분</button>
              <button type="button" onClick={() => adjustPomoMinutes(-1)} className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white rounded-lg transition active:scale-90">-1분</button>
              <span className="text-white/10 font-normal">|</span>
              <button type="button" onClick={() => adjustPomoMinutes(1)} className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white rounded-lg transition active:scale-90">+1분</button>
              <button type="button" onClick={() => adjustPomoMinutes(5)} className="flex-1 text-center py-1 hover:bg-white/10 hover:text-white rounded-lg transition active:scale-90">+5분</button>
            </div>

            {/* 세션 카운트 현황 */}
            <div className="flex items-center justify-between bg-white/5 border border-white/5 w-full rounded-2xl px-4 py-3 text-xs">
              <span className="text-slate-400 font-bold">오늘 몰입 달성도</span>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.min(sessionCount, 8) }).map((_, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full bg-[#0071E3] shadow-[0_0_8px_rgba(0,113,227,0.6)]" />
                ))}
                {sessionCount > 8 && <span className="text-[10px] font-black text-[#0071E3]">+{sessionCount - 8}</span>}
                {sessionCount === 0 && <span className="text-slate-500 font-black">-</span>}
                <span className="font-black text-white ml-1.5">{sessionCount} 세션 완료</span>
              </div>
            </div>

            {/* 단축키 및 종료 안내 */}
            <p className="text-[10px] text-slate-500 font-semibold tracking-wide mt-2 text-center">
              {"[Space] 재생/일시정지 • [Esc] 전체화면 나가기"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
