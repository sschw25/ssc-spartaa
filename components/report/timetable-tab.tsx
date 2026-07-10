'use client';

import React from 'react';
import { Clock, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Student, SubjectProgress } from '@/lib/types/student';
import { ACADEMY_TIMETABLE } from '@/lib/academy-timetable';
import { getMaterialColor, materialBoxStyle } from '@/lib/material-color';
import { getDayGridBlocks, getPeriodNumLabel } from '@/lib/today-schedule';
import type { AssignedScheduleItem, DayGridBlock } from '@/lib/today-schedule';
import { getMaterialStudyDays } from '@/lib/progress-plan';
import { getAwayRangesForDay, type WeekdayKey } from '@/lib/away-impact';
import { getLeaveTypeLabel } from '@/lib/leave';
import type { LeaveRequest } from '@/lib/types/student';

type DayKey = NonNullable<SubjectProgress['studyDays']>[number];

type SelfPacedItem = {
  id: string;
  subject: string;
  title: string;
  materialType: 'book' | 'lecture';
  materialId: string;
  unit: string;
  current: number;
  studyTime: string;
  loggedToday: boolean;
};

interface TimetableTabProps {
  student: Student;
  isStudentReport: boolean;
  todaySubjects: SubjectProgress[];
  todaySelfPacedItems?: SelfPacedItem[];
  currentMinutes: number;
  todayDayKey: DayKey;
  activeTab: string;
  weekDaySlots: Array<{ key: DayKey; label: string }>;
  studyTimeSlots: Array<{ key: string; label: string; timeRange: string; periodLabel: string }>;
  // 오늘 계획 자동 배치(교시별). 전달 시 이걸로 렌더(미지정 자료도 교시에 노출). 미전달=학부모 뷰 폴백.
  todaySchedule?: Map<string, AssignedScheduleItem[]>;
  // 교시 항목 탭 → 자료 상세 시트(학생 뷰 전용, 미전달 시 비활성).
  openMaterialDetail?: (materialType: 'book' | 'lecture', materialId: string) => void;
}

export function TimetableTab({
  student,
  isStudentReport,
  todaySubjects,
  todaySelfPacedItems = [],
  currentMinutes,
  todayDayKey,
  activeTab,
  weekDaySlots,
  studyTimeSlots,
  todaySchedule,
  openMaterialDetail,
}: TimetableTabProps) {

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

  const toMinutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };

  const getSubjectColorClass = (subjectName?: string) => {
    void subjectName;
    return 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10';
  };

  // 자료(교재/인강) id → 학생 지정 색(hex). 미지정이면 id 해시 기본색. 시간표 컬러박스·색점에 쓴다.
  const allBooks = (student.subjects || []).flatMap((s) => s.books || []);
  const allLectures = (student.subjects || []).flatMap((s) => s.lectures || []);
  const colorOf = (type: 'book' | 'lecture', id: string): string => {
    const m = (type === 'book' ? allBooks : allLectures).find((x) => x.id === id);
    return getMaterialColor(m || { id });
  };

  // ── 오늘 빠지는 시간(휴가·정기외출) → 교시별 표시 ─────────────────────────────
  // 일회성 승인 휴가는 슬롯/전일로, 정기 외출은 시간 겹침으로 판정한다.
  const absenceTodayStr = getSeoulDateKey();
  const todayLeaves = (student.leaveRequests || []).filter(
    (req) => req.status === 'approved' && req.date === absenceTodayStr,
  );
  // 휴가 종류 → 면제 슬롯. getLeaveExemptions(진도 소스)와 동일 규칙으로 맞춘다.
  const resolveLeaveSlot = (req: LeaveRequest): 'morning' | 'afternoon' | 'night' | 'fullday' => {
    const t = req.type;
    if (t === 'morning' || t === 'afternoon' || t === 'night') return t;
    if (t === 'fullday' || t === 'personal_fullday') return 'fullday';
    const s = req.slot;
    if (s === 'morning' || s === 'afternoon' || s === 'night' || s === 'fullday') return s;
    return 'fullday'; // 병가·개인반차(슬롯 미지정) → 하루 종일
  };
  const awayRanges = getAwayRangesForDay(student.awaySchedules, absenceTodayStr, todayDayKey as WeekdayKey);

  // study 교시 하나가 휴가/외출로 비는지 — 비면 배지 라벨과 종류 반환.
  const getPeriodAbsence = (period: (typeof ACADEMY_TIMETABLE)[number]): { label: string; kind: 'leave' | 'away' } | null => {
    const isStudy = period.type === 'study' || period.type === 'late-study' || period.type === 'supplement';
    if (!isStudy) return null;
    for (const req of todayLeaves) {
      const slot = resolveLeaveSlot(req);
      if (slot === 'fullday' || (period.studyTime && period.studyTime === slot)) {
        return { label: getLeaveTypeLabel(req.type), kind: 'leave' };
      }
    }
    const pStart = toMinutes(period.start);
    const pEnd = toMinutes(period.end);
    for (const r of awayRanges) {
      if (pStart < r.end && r.start < pEnd) return { label: r.label, kind: 'away' };
    }
    return null;
  };

  // ── 비례 하루 그리드(실시간 하루 계획표) — 자료를 실제 시각 위치의 컬러 박스로 ─────
  const PPM = 1.3;             // 분당 픽셀(하루 창 ≈ 1170px)
  const GUTTER = 52;          // 좌측 시간/교시 라벨 폭(px)
  const grid = getDayGridBlocks(student, absenceTodayStr, todayDayKey);
  const dayStartMin = grid.dayStartMin;
  const dayEndMin = grid.dayEndMin;
  const gridHeight = (dayEndMin - dayStartMin) * PPM;
  const yOf = (min: number) => (min - dayStartMin) * PPM;

  // 겹치는 블록 → 나란한 컬럼(그리디). 상호 겹침 클러스터마다 컬럼 수를 계산한다.
  type PositionedBlock = DayGridBlock & { col: number; cols: number };
  const positionedBlocks: PositionedBlock[] = [];
  {
    const sorted = grid.blocks; // 이미 start 오름차순
    let i = 0;
    while (i < sorted.length) {
      let clusterEnd = sorted[i].endMin;
      let j = i + 1;
      while (j < sorted.length && sorted[j].startMin < clusterEnd) {
        clusterEnd = Math.max(clusterEnd, sorted[j].endMin);
        j++;
      }
      const cluster = sorted.slice(i, j);
      const colEnds: number[] = []; // 컬럼별 마지막 종료분
      cluster.forEach((b) => {
        let col = colEnds.findIndex((end) => end <= b.startMin);
        if (col === -1) { col = colEnds.length; colEnds.push(b.endMin); }
        else colEnds[col] = b.endMin;
        positionedBlocks.push({ ...b, col, cols: 0 });
      });
      const cols = colEnds.length;
      for (let k = positionedBlocks.length - cluster.length; k < positionedBlocks.length; k++) {
        positionedBlocks[k].cols = cols;
      }
      i = j;
    }
  }

  const isStudyPeriodType = (t: (typeof ACADEMY_TIMETABLE)[number]['type']) =>
    t === 'study' || t === 'late-study' || t === 'supplement';

  // 블록 안 목표/자율 한 줄 요약(박스가 좁아 짧게).
  const blockGoalText = (b: DayGridBlock): string => {
    if (b.selfPaced) return `자율 · 누적 ${b.current ?? 0}${b.unit}`;
    if (b.weekly) return `주간 ${b.amount}${b.unit}`;
    return `오늘 ${b.amount}${b.unit}`;
  };

  return (
    <div id="timetable" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'timetable' ? '' : 'hidden print:block'}`}>
      {/* 주말 보강 스케줄은 학습 '보강' 탭 + 홈 주말 박스로 일원화됨(원장 기반). 여기서는 표시하지 않는다. */}

      {/* 오늘의 실시간 타임라인 계획표 (시간표 연동) */}
      {isStudentReport && (
        <div className="rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 md:p-6 shadow-sm space-y-4 print-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
              <Clock className="w-4 h-4" /> 실시간 하루 계획표 (시간표 연동)
            </h3>
            <Badge variant="outline" className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10">
              0교시 ~ 8교시
            </Badge>
          </div>

          {/* 비례 하루 그리드: 자료를 실제 시각 위치의 컬러 박스로. 교시 경계는 실금. */}
          <div className="relative w-full overflow-x-hidden">
            <div className="relative w-full" style={{ height: gridHeight }}>
              {/* 교시 경계 실금 + 좌측 시간/교시 라벨 */}
              {ACADEMY_TIMETABLE.map((period, pIdx) => {
                const isStudy = isStudyPeriodType(period.type);
                const top = yOf(toMinutes(period.start));
                const numLabel = getPeriodNumLabel(period.periodKey);
                return (
                  <React.Fragment key={pIdx}>
                    <div
                      className={`absolute left-0 right-0 border-t ${isStudy ? 'border-slate-200 dark:border-white/15' : 'border-slate-100 dark:border-white/[0.06]'}`}
                      style={{ top }}
                    />
                    <div className="absolute left-0 w-[48px] pr-1.5 text-right" style={{ top: top - 5 }}>
                      <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 tabular-nums leading-none">{period.start}</span>
                      {isStudy && numLabel && (
                        <span className="block mt-0.5 text-[9px] font-black text-slate-500 dark:text-slate-400 leading-none break-keep">{numLabel}</span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              {/* 마지막 종료 실금 + 라벨 */}
              <div className="absolute left-0 right-0 border-t border-slate-200 dark:border-white/15" style={{ top: gridHeight }} />
              <div className="absolute left-0 w-[48px] pr-1.5 text-right" style={{ top: gridHeight - 5 }}>
                <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 tabular-nums leading-none">
                  {ACADEMY_TIMETABLE[ACADEMY_TIMETABLE.length - 1].end}
                </span>
              </div>

              {/* 블록 영역(좌측 거터 이후) */}
              <div className="absolute top-0 bottom-0" style={{ left: GUTTER, right: 0 }}>
                {/* 휴가/외출 밴드 — 막힌 학습 교시 구간에 옅은 앰버 밴드 */}
                {ACADEMY_TIMETABLE.map((period, pIdx) => {
                  if (!isStudyPeriodType(period.type)) return null;
                  const absence = getPeriodAbsence(period);
                  if (!absence) return null;
                  const top = yOf(toMinutes(period.start));
                  const height = (toMinutes(period.end) - toMinutes(period.start)) * PPM;
                  return (
                    <div
                      key={`ab_${pIdx}`}
                      className="absolute left-0 right-0 rounded-lg bg-amber-100/50 dark:bg-amber-500/[0.08] border border-dashed border-amber-200/70 dark:border-amber-500/20 px-2 py-1 overflow-hidden"
                      style={{ top, height }}
                    >
                      <span className="text-[9px] font-black text-amber-700/80 dark:text-amber-300/80 break-keep">
                        {absence.kind === 'away' ? '외출' : '휴가'} · {absence.label}
                      </span>
                    </div>
                  );
                })}

                {/* 자료 블록 — 절대 위치(top/height=시간, left/width=겹침 컬럼) */}
                {positionedBlocks.map((b, idx) => {
                  const hex = colorOf(b.materialType, b.materialId);
                  const top = yOf(b.startMin);
                  const height = Math.max(34, (b.endMin - b.startMin) * PPM);
                  return (
                    <div
                      key={idx}
                      className="absolute p-[2px]"
                      style={{ top, height, left: `${(b.col / b.cols) * 100}%`, width: `${(1 / b.cols) * 100}%` }}
                    >
                      <button
                        type="button"
                        onClick={() => openMaterialDetail?.(b.materialType, b.materialId)}
                        aria-label={`${b.subjectName} ${b.title} 상세 보기`}
                        className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-xl px-2 py-1 text-left leading-tight transition hover:brightness-95 active:scale-[0.99]"
                        style={{ ...materialBoxStyle(hex), opacity: b.blocked ? 0.4 : 1 }}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-black shrink-0"
                            style={{ backgroundColor: `${hex}22`, color: hex }}
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                            <span className="break-keep">{b.subjectName}</span>
                          </span>
                          {b.isCompleted && <span className="text-[9px] shrink-0">✅</span>}
                          {b.speed && b.speed !== 1.0 && (
                            <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">{b.speed}배속</span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{b.title}</p>
                        {height >= 48 && (
                          <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 truncate break-keep">
                            {blockGoalText(b)}
                          </p>
                        )}
                      </button>
                    </div>
                  );
                })}

                {positionedBlocks.length === 0 && (
                  <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 break-keep">
                    오늘 시간표에 배치된 학습이 없어요
                  </p>
                )}
              </div>

              {/* "지금" 표시 — 파란 실선 + 좌측 점 */}
              {currentMinutes >= dayStartMin && currentMinutes <= dayEndMin && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: yOf(currentMinutes) }}>
                  <span className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full bg-[#0071E3]" />
                  <div className="border-t-2 border-[#0071E3]" />
                </div>
              )}
            </div>
          </div>

          {/* 시간 미지정 · 자율 학습 — 그리드에 못 앉힌 자료를 컬러 칩으로 */}
          {grid.unpinned.length > 0 && (
            <div className="pt-1">
              <p className="mb-2 text-[10px] font-black text-slate-500 dark:text-slate-400 break-keep">시간 미지정 · 자율 학습</p>
              <div className="flex flex-wrap gap-1.5">
                {grid.unpinned.map((u, idx) => {
                  const hex = colorOf(u.materialType, u.materialId);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => openMaterialDetail?.(u.materialType, u.materialId)}
                      aria-label={`${u.subjectName} ${u.title} 상세 보기`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition hover:brightness-95 active:scale-95"
                      style={{ backgroundColor: `${hex}22`, color: hex }}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                      <span className="break-keep">{u.subjectName}</span>
                      <span className="max-w-[130px] truncate font-semibold text-slate-600 dark:text-slate-300">{u.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 요일별 그리드·시간대 배정 뷰는 학부모 리포트 전용 — 학생 페이지 '오늘 계획'은 실시간 하루 계획표만 노출 */}
      {!isStudentReport && (
      <>
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-wider uppercase flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#0071E3]" />
          요일별 과목 배치 시간표
        </h3>
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">주 6일 스파르타 플래닝</span>
      </div>

      <div className="print-week-grid grid grid-cols-2 md:grid-cols-7 gap-3">
        {weekDaySlots.map(day => {
          // 과목 요일이 그날을 포함하거나, 그 과목의 어떤 자료라도 개별 요일이 그날을 포함하면 배치.
          // (자료별 요일을 따로 지정한 자료가 시간표에서 사라지지 않도록 union 으로 판정)
          const subjectsInDay = (student.subjects || []).filter(subject => {
            const materials = [...(subject.books || []), ...(subject.lectures || [])];
            return materials.some(m => (getMaterialStudyDays(subject.studyDays, m.studyDays) || []).includes(day.key))
              || (materials.length === 0 && (subject.studyDays || []).includes(day.key));
          });
          const isWeekend = day.key === 'sat' || day.key === 'sun';
          const isToday = day.key === todayDayKey;

          return (
            <div
              key={day.key}
              className={`p-3.5 rounded-2xl border transition-all duration-300 min-h-[105px] flex flex-col shadow-sm ${
                isToday
                  ? 'bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 border-[#0071E3] ring-1 ring-[#0071E3]/30 shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                  : isWeekend
                    ? 'bg-slate-50/80 dark:bg-white/5 border-slate-100 dark:border-white/10'
                    : subjectsInDay.length > 0
                      ? 'bg-white dark:bg-[#1c1c1e] border-[#0071E3]/10 dark:border-white/10 hover:border-[#0071E3]/20 hover:shadow-md'
                      : 'bg-slate-50/30 dark:bg-white/5 border-slate-100 dark:border-white/10'
              }`}
            >
              <h4 className={`text-[10px] font-bold tracking-tight mb-2.5 flex items-center gap-1 ${
                isToday ? 'text-[#0071E3]' : isWeekend ? 'text-slate-400 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'
              }`}>
                {day.label}
                {isToday && <span className="rounded-full bg-[#0071E3] px-1.5 py-[1px] text-[11px] font-black text-white">오늘</span>}
              </h4>
              {subjectsInDay.length === 0 ? (
                <p className="text-[10px] text-slate-300 dark:text-slate-600 font-bold mt-auto mb-1">휴식</p>
              ) : (
                <div className="space-y-1.5 mt-auto">
                  {subjectsInDay.map(subject => (
                    <span
                      key={`${day.key}_${subject.id}`}
                      className={`text-[8px] font-extrabold px-2 py-0.5 rounded-lg border block text-center truncate shadow-sm transition-transform hover:-translate-y-0.5 ${getSubjectColorClass(subject.name)}`}
                    >
                      {subject.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 시간대 배정 뷰 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {studyTimeSlots.map(slot => {
          const subjectsInSlot = (student.subjects || []).filter(subject => (subject.studyTime || '') === slot.key);
          if (slot.key === '' && subjectsInSlot.length === 0) return null;

          const getSlotStyle = (key: string) => {
            switch(key) {
              case 'morning': return 'border-amber-100 dark:border-white/10 bg-amber-50/10 dark:bg-amber-500/10 hover:shadow-[0_8px_30px_rgba(245,158,11,0.04)]';
              case 'afternoon': return 'border-[#0071E3]/10 dark:border-white/10 bg-[#0071E3]/[0.02] dark:bg-[#0071E3]/15 hover:shadow-[0_8px_30px_rgba(0,113,227,0.04)]';
              case 'night': return 'border-slate-200 dark:border-white/10 bg-slate-50/20 dark:bg-white/5 hover:shadow-[0_8px_30px_rgba(100,116,139,0.05)]';
              default: return 'border-slate-100 dark:border-white/10 bg-slate-50/10 dark:bg-white/5';
            }
          };

          return (
            <div key={slot.key || 'none'} className={`p-5 rounded-2xl border bg-white dark:bg-[#1c1c1e] space-y-4 shadow-sm transition-all duration-300 ${getSlotStyle(slot.key)}`}>
              <div className="border-b border-slate-100 dark:border-white/10 pb-2.5">
                <div className="flex justify-between items-center gap-2">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">{slot.label}</h4>
                  <span className="text-[10px] text-slate-400 font-extrabold bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full">{subjectsInSlot.length}개 과목</span>
                </div>
                <p className="mt-1 text-[10px] font-extrabold text-slate-500 dark:text-slate-400">{slot.timeRange || slot.periodLabel}</p>
                {slot.key && (
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-400">{slot.periodLabel}</p>
                )}
              </div>

              {subjectsInSlot.length === 0 ? (
                <p className="text-[10px] text-slate-300 dark:text-slate-600 font-bold py-4 text-center">배정된 학습 과목 없음</p>
              ) : (
                <div className="space-y-2.5">
                  {subjectsInSlot.map(subject => (
                    <div key={subject.id} className="rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-100/80 dark:border-white/10 p-3 text-[10px] shadow-sm hover:shadow transition-all">
                      <div className="flex justify-between items-center mb-1.5">
                        <p className="font-extrabold text-slate-700 dark:text-slate-300">{subject.name}</p>
                        <span className="text-[8px] text-slate-400 font-bold bg-slate-50 dark:bg-white/5 px-1.5 py-0.5 rounded-lg border border-slate-100 dark:border-white/10">
                          {(subject.books || []).length + (subject.lectures || []).length}개 자료
                        </span>
                      </div>
                      <p className="text-slate-400 dark:text-slate-400 text-[10px] truncate">
                        {[...(subject.books || []).map(book => book.title), ...(subject.lectures || []).map(lecture => lecture.name)].join(' · ') || '등록 학습자료 없음'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
