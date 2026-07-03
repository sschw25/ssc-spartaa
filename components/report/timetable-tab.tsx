'use client';

import React from 'react';
import { Clock, Calendar, Coffee } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Student, SubjectProgress } from '@/lib/types/student';
import { ACADEMY_TIMETABLE } from '@/lib/academy-timetable';
import { getPlanDailyCompletion } from '@/lib/student-activity';

type DayKey = NonNullable<SubjectProgress['studyDays']>[number];

interface TimetableTabProps {
  student: Student;
  isStudentReport: boolean;
  todaySubjects: SubjectProgress[];
  currentMinutes: number;
  todayDayKey: DayKey;
  activeTab: string;
  weekDaySlots: Array<{ key: DayKey; label: string }>;
  studyTimeSlots: Array<{ key: string; label: string; timeRange: string; periodLabel: string }>;
}

export function TimetableTab({
  student,
  isStudentReport,
  todaySubjects,
  currentMinutes,
  todayDayKey,
  activeTab,
  weekDaySlots,
  studyTimeSlots,
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
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  return (
    <div id="timetable" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'timetable' ? '' : 'hidden print:block'}`}>
      {/* 오늘의 실시간 타임라인 계획표 (시간표 연동) */}
      {isStudentReport && (
        <div className="rounded-3xl border border-[#0071E3]/15 bg-white p-5 md:p-6 shadow-sm space-y-4 print-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
              <Clock className="w-4 h-4" /> 실시간 하루 계획표 (시간표 연동)
            </h3>
            <Badge variant="outline" className="text-[10px] font-bold text-slate-500 bg-slate-50 border-slate-200">
              0교시 ~ 8교시
            </Badge>
          </div>

          <div className="relative border-l border-slate-100 pl-4.5 ml-2.5 space-y-3.5 my-2">
            {ACADEMY_TIMETABLE.map((period, pIdx) => {
              const isStudyPeriod = period.type === 'study' || period.type === 'late-study' || period.type === 'supplement';
              const isPast = currentMinutes >= toMinutes(period.end);
              const isCurrent = currentMinutes >= toMinutes(period.start) && currentMinutes < toMinutes(period.end);

              // 오늘 날짜 구하기
              const todayStr = getSeoulDateKey();

              // 이 교시에 공부해야 하는 과목과 그 계획 매핑
              const matchedPlans: Array<{ 
                subjectName: string; 
                title: string; 
                type: 'book' | 'lecture'; 
                range: string; 
                amount: number; 
                speed?: number;
                isCompleted?: boolean;
                actualAmount?: number;
                unit?: string;
              }> = [];

              if (isStudyPeriod && period.studyTime) {
                todaySubjects.forEach(subject => {
                  if (subject.studyTime === period.studyTime) {
                    // 교재 계획 체크
                    (subject.books || []).forEach((book) => {
                      const activePlan = (book.detailedPlans || []).find((plan) => !plan.periodType && plan.startDate <= todayStr && todayStr <= plan.endDate);
                      if (activePlan) {
                        const dailyVal = activePlan.dailyAmount || Math.ceil(activePlan.targetAmount / 6);
                        const dailyCompletion = getPlanDailyCompletion(activePlan, todayStr);
                        matchedPlans.push({
                          subjectName: subject.name,
                          title: book.title,
                          type: 'book',
                          range: activePlan.rangeText,
                          amount: dailyVal,
                          isCompleted: dailyCompletion.isCompleted,
                          actualAmount: dailyCompletion.actualAmount,
                          unit: book.unit || 'p'
                        });
                      }
                    });
                    // 인강 계획 체크
                    (subject.lectures || []).forEach((lecture) => {
                      const activePlan = (lecture.detailedPlans || []).find((plan) => !plan.periodType && plan.startDate <= todayStr && todayStr <= plan.endDate);
                      if (activePlan) {
                        const dailyVal = activePlan.dailyAmount || Math.ceil(activePlan.targetAmount / 6);
                        const dailyCompletion = getPlanDailyCompletion(activePlan, todayStr);
                        matchedPlans.push({
                          subjectName: subject.name,
                          title: lecture.name,
                          type: 'lecture',
                          range: activePlan.rangeText,
                          amount: dailyVal,
                          speed: lecture.speedMultiplier,
                          isCompleted: dailyCompletion.isCompleted,
                          actualAmount: dailyCompletion.actualAmount,
                          unit: '강'
                        });
                      }
                    });
                  }
                });
              }

              // 0교시부터 8교시 매칭 헬퍼 라벨
              let periodNumLabel = '';
              if (period.label.includes('0교시')) periodNumLabel = '0교시';
              else if (period.label.includes('1교시')) periodNumLabel = '1교시';
              else if (period.label.includes('2교시')) periodNumLabel = '2교시';
              else if (period.label.includes('3교시')) periodNumLabel = '3교시';
              else if (period.label.includes('4교시')) periodNumLabel = '4교시';
              else if (period.label.includes('5교시')) periodNumLabel = '5교시';
              else if (period.label.includes('6교시')) periodNumLabel = '6교시';
              else if (period.label.includes('7교시')) periodNumLabel = '7교시';
              else if (period.label.includes('심야 자율')) periodNumLabel = '8교시';

              return (
                <div key={pIdx} className="relative group">
                  <span className={`absolute -left-[27.5px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center transition-all ${
                    isCurrent
                      ? 'border-[#0071E3] ring-4 ring-[#0071E3]/20 scale-110 z-10'
                      : isPast
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200'
                  }`}>
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-ping" />}
                  </span>

                  <div className={`p-3 rounded-2xl border transition-all text-left ${
                    isCurrent 
                      ? 'bg-[#0071E3]/[0.04] border-[#0071E3]/25 shadow-sm' 
                      : isPast
                        ? 'bg-slate-50/50 border-slate-100 opacity-70'
                        : 'bg-white border-slate-100'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {periodNumLabel ? (
                          <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-700 text-[10px] font-black shrink-0 px-2 py-0.5 rounded-lg border-0">
                            {periodNumLabel}
                          </Badge>
                        ) : (
                          <Coffee className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="text-[11px] font-black text-slate-800">{period.label.split(':')[1]?.trim() || period.label}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{period.start} ~ {period.end}</span>
                    </div>

                    {isStudyPeriod && matchedPlans.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-t border-dashed border-slate-100 pt-2">
                        {matchedPlans.map((pl, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-black text-[#0071E3] bg-[#0071E3]/5 border border-[#0071E3]/10 px-1.5 py-0.5 rounded">
                              {pl.subjectName}
                            </span>
                            <span className="font-semibold text-slate-700 truncate max-w-[200px]">
                              {pl.title}
                            </span>
                            <span className="font-bold text-slate-500">
                              오늘 목표: {pl.amount}{pl.unit} ({pl.range.split(' ').slice(1).join(' ') || pl.range})
                              {pl.isCompleted && (
                                <span className="ml-1.5 text-emerald-600 font-extrabold text-[9px] bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                                  (실제: {pl.actualAmount !== undefined ? `${pl.actualAmount}${pl.unit}` : '완료'} 완료 ✅)
                                </span>
                              )}
                            </span>
                            {pl.speed && pl.speed !== 1.0 && (
                              <Badge className="bg-emerald-50 hover:bg-emerald-50 text-emerald-700 text-[9px] border-emerald-100 font-bold px-1 py-0 rounded border-0">
                                {pl.speed}배속 적용됨
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {isStudyPeriod && matchedPlans.length === 0 && (
                      <p className="mt-1 text-[9px] font-bold text-slate-400">
                        개별 자습 및 취약 영역 보완 학습 시간
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#0071E3]" />
          요일별 과목 배치 시간표
        </h3>
        <span className="text-[10px] font-bold text-slate-400">주 6일 스파르타 플래닝</span>
      </div>
      
      <div className="print-week-grid grid grid-cols-2 md:grid-cols-7 gap-3">
        {weekDaySlots.map(day => {
          const subjectsInDay = (student.subjects || []).filter(subject => (subject.studyDays || []).includes(day.key));
          const isWeekend = day.key === 'sat' || day.key === 'sun';
          const isToday = day.key === todayDayKey;

          return (
            <div 
              key={day.key} 
              className={`p-3.5 rounded-2xl border transition-all duration-300 min-h-[105px] flex flex-col shadow-sm ${
                isToday
                  ? 'bg-[#0071E3]/[0.04] border-[#0071E3] ring-1 ring-[#0071E3]/30 shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                  : isWeekend
                    ? 'bg-slate-50/80 border-slate-100'
                    : subjectsInDay.length > 0
                      ? 'bg-white border-[#0071E3]/10 hover:border-[#0071E3]/20 hover:shadow-md'
                      : 'bg-slate-50/30 border-slate-100'
              }`}
            >
              <h4 className={`text-[10px] font-bold tracking-tight mb-2.5 flex items-center gap-1 ${
                isToday ? 'text-[#0071E3]' : isWeekend ? 'text-slate-400' : 'text-slate-700'
              }`}>
                {day.label}
                {isToday && <span className="rounded-full bg-[#0071E3] px-1.5 py-[1px] text-[11px] font-black text-white">오늘</span>}
              </h4>
              {subjectsInDay.length === 0 ? (
                <p className="text-[10px] text-slate-300 font-bold mt-auto mb-1">휴식</p>
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
              case 'morning': return 'border-amber-100 bg-amber-50/10 hover:shadow-[0_8px_30px_rgba(245,158,11,0.04)]';
              case 'afternoon': return 'border-[#0071E3]/10 bg-[#0071E3]/[0.02] hover:shadow-[0_8px_30px_rgba(0,113,227,0.04)]';
              case 'night': return 'border-slate-200 bg-slate-50/20 hover:shadow-[0_8px_30px_rgba(100,116,139,0.05)]';
              default: return 'border-slate-100 bg-slate-50/10';
            }
          };
          
          return (
            <div key={slot.key || 'none'} className={`p-5 rounded-2xl border bg-white space-y-4 shadow-sm transition-all duration-300 ${getSlotStyle(slot.key)}`}>
              <div className="border-b border-slate-100 pb-2.5">
                <div className="flex justify-between items-center gap-2">
                  <h4 className="text-xs font-black text-slate-800">{slot.label}</h4>
                  <span className="text-[10px] text-slate-400 font-extrabold bg-slate-100 px-2 py-0.5 rounded-full">{subjectsInSlot.length}개 과목</span>
                </div>
                <p className="mt-1 text-[10px] font-extrabold text-slate-500">{slot.timeRange || slot.periodLabel}</p>
                {slot.key && (
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">{slot.periodLabel}</p>
                )}
              </div>
              
              {subjectsInSlot.length === 0 ? (
                <p className="text-[10px] text-slate-300 font-bold py-4 text-center">배정된 학습 과목 없음</p>
              ) : (
                <div className="space-y-2.5">
                  {subjectsInSlot.map(subject => (
                    <div key={subject.id} className="rounded-xl bg-white border border-slate-100/80 p-3 text-[10px] shadow-sm hover:shadow transition-all">
                      <div className="flex justify-between items-center mb-1.5">
                        <p className="font-extrabold text-slate-700">{subject.name}</p>
                        <span className="text-[8px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-100">
                          {(subject.books || []).length + (subject.lectures || []).length}개 자료
                        </span>
                      </div>
                      <p className="text-slate-400 text-[10px] truncate">
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
    </div>
  );
}
