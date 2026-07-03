'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, MessageSquare } from 'lucide-react';
import { Student, MockExam } from '@/lib/types/student';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

type GradeForm = {
  testName: string;
  subject: string;
  score: string;
  date: string;
};

type RequestForm = {
  requestType: string;
  message: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks';
  goalValue: string;
  proposedWeekNumber: string;
  proposedRangeText: string;
  speedMultiplier: string;
  currentGoalSnapshot: { goalType?: string; goalValue?: number; speedMultiplier?: number } | null;
};

interface GradeAnalysisTabProps {
  student: Student;
  isStudentReport: boolean;
  chartData: Array<Record<string, string | number | null>>;
  gradeSubjects: string[];
  gradeForm: GradeForm;
  setGradeForm: React.Dispatch<React.SetStateAction<GradeForm>>;
  gradeSubmitting: boolean;
  gradeError: string;
  submitGrade: (e: React.FormEvent) => Promise<void>;
  deleteGrade: (id: string) => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setRequestForm: React.Dispatch<React.SetStateAction<RequestForm>>;
  setRequestCustomOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mockExams?: MockExam[];
}

export function GradeAnalysisTab({
  student,
  isStudentReport,
  chartData,
  gradeSubjects,
  gradeForm,
  setGradeForm,
  gradeSubmitting,
  gradeError,
  submitGrade,
  deleteGrade,
  activeTab,
  setActiveTab,
  setRequestForm,
  setRequestCustomOpen,
  mockExams = [],
}: GradeAnalysisTabProps) {
  const weeklyMockExams = React.useMemo(() => {
    if (!mockExams) return [];
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const getYYYYMMDD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dateVal = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dateVal}`;
    };

    const monStr = getYYYYMMDD(monday);
    const sunStr = getYYYYMMDD(sunday);

    return mockExams.filter((e) => e.date >= monStr && e.date <= sunStr);
  }, [mockExams]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 성적 하락 감지 함수
  const detectScoreDrop = () => {
    if (!student || !student.grades || student.grades.length < 2) return null;

    const gradesBySubject: Record<string, typeof student.grades> = {};
    student.grades.forEach(g => {
      const sub = (g.subject || '').trim();
      if (!sub) return;
      if (!gradesBySubject[sub]) {
        gradesBySubject[sub] = [];
      }
      gradesBySubject[sub].push(g);
    });

    const drops: { subject: string; prevScore: number; currentScore: number; testName: string; dropPercent: number }[] = [];

    for (const subject in gradesBySubject) {
      const list = [...gradesBySubject[subject]].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (list.length < 2) continue;

      for (let i = 1; i < list.length; i++) {
        const prev = Number(list[i-1].score) || 0;
        const curr = Number(list[i].score) || 0;
        if (prev > 0 && curr < prev) {
          const dropPercent = ((prev - curr) / prev) * 100;
          if (dropPercent >= 15) {
            drops.push({
              subject,
              prevScore: prev,
              currentScore: curr,
              testName: list[i].testName,
              dropPercent: Math.round(dropPercent * 10) / 10
            });
          }
        }
      }
    }

    return drops.length > 0 ? drops[drops.length - 1] : null;
  };

  return (
    <div id="grade-analysis" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'grade-analysis' ? '' : 'hidden print:block'}`}>
      <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
        <Calendar className="w-4 h-4 text-emerald-600" />
        모의고사 성적 추이 및 주간 테스트 분석 결과
      </h3>

      {isStudentReport && (
        <form onSubmit={submitGrade} className="no-print p-4 rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-[#0071E3]">
            <Plus className="w-3.5 h-3.5" /> 성적 직접 입력
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={gradeForm.subject}
              onChange={(e) => setGradeForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="과목 (예: 국어)"
              list="grade-subject-options"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
            />
            <datalist id="grade-subject-options">
              {[...new Set((student.subjects || []).map((s) => s.name).filter(Boolean))].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <input
              value={gradeForm.testName}
              onChange={(e) => setGradeForm((f) => ({ ...f, testName: e.target.value }))}
              placeholder="시험명 (예: 6월 모평)"
              list="weekly-mock-exam-options"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
            />
            <datalist id="weekly-mock-exam-options">
              {weeklyMockExams.map((exam) => (
                <option key={exam.id} value={exam.name} />
              ))}
            </datalist>
            <input
              type="number"
              inputMode="numeric"
              value={gradeForm.score}
              onChange={(e) => setGradeForm((f) => ({ ...f, score: e.target.value }))}
              placeholder="점수"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
            />
            <input
              type="date"
              value={gradeForm.date}
              onChange={(e) => setGradeForm((f) => ({ ...f, date: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
            />
          </div>
          {gradeError && <p className="text-[10px] font-bold text-red-500">{gradeError}</p>}
          <button
            type="submit"
            disabled={gradeSubmitting}
            className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
          >
            {gradeSubmitting ? '저장 중...' : '성적 추가하기'}
          </button>
        </form>
      )}

      {student.grades.length === 0 ? (
        <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
          <Calendar className="w-7 h-7 text-slate-300" />
          <p className="text-xs font-bold text-slate-400">아직 성적 기록이 없어요.</p>
          <p className="text-[10px] text-slate-400/80 font-semibold">위 입력란에서 직접 추가하거나, 테스트 후 관리자가 입력하면 추이 그래프가 나타나요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">

          {/* 성적 차트 시각화 */}
          <div className={`${isStudentReport ? 'md:col-span-2' : 'md:col-span-3'} p-5 rounded-3xl bg-gradient-to-br from-white to-slate-50/80 border border-slate-100 shadow-sm overflow-hidden relative`}>
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#0071E3]/[0.04] pointer-events-none" />
            <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-emerald-400/[0.04] pointer-events-none" />
            <div className="relative flex items-center justify-between mb-4">
              <div>
                <h4 className="text-[11px] font-black text-slate-700 tracking-tight">성적 향상 곡선</h4>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">과목별 점수 추이 및 5회 가중평균</p>
              </div>
              <span className="text-[9px] font-black text-[#0071E3] bg-[#0071E3]/8 border border-[#0071E3]/15 px-2.5 py-1 rounded-full">최근 {chartData.length}회 시험</span>
            </div>
            {mounted && chartData.length >= 2 ? (
              <div className="w-full h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.6)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold' }} />
                    <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', backgroundColor: '#ffffff', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 10, fontWeight: 'bold', fill: '#1E293B' }} />
                    <Line
                      type="monotone"
                      dataKey="추세선"
                      name="5회 가중평균 추세 (전체)"
                      stroke="#64748B"
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls={true}
                    />
                    {gradeSubjects.map((subject, idx) => {
                      const lineStyles = [
                        { stroke: '#0071E3' },
                        { stroke: '#475569', strokeDasharray: '6 3' },
                        { stroke: '#0071E3', strokeDasharray: '2 3' },
                        { stroke: '#64748B', strokeDasharray: '8 4' },
                        { stroke: '#0F172A', strokeDasharray: '3 5' },
                      ];
                      const lineStyle = lineStyles[idx % lineStyles.length];
                      return (
                        <Line
                          key={subject}
                          type="monotone"
                          dataKey={subject}
                          name={subject}
                          stroke={lineStyle.stroke}
                          strokeDasharray={lineStyle.strokeDasharray}
                          strokeWidth={2.5}
                          activeDot={{ r: 5 }}
                          dot={{ strokeWidth: 2, r: 3.5 }}
                          connectNulls={true}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[190px] flex flex-col items-center justify-center gap-3">
                <svg width="260" height="100" viewBox="0 0 260 100" fill="none" aria-hidden="true">
                  {[20, 35, 55, 42, 68, 50, 75, 60].map((h, i) => (
                    <rect
                      key={i}
                      x={i * 32 + 4} y={100 - h} width="22" height={h} rx="4"
                      fill={i % 2 === 0 ? 'rgba(0,113,227,0.12)' : 'rgba(226,232,240,0.8)'}
                      className="animate-pulse"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </svg>
                <p className="text-[11px] font-bold text-slate-400">
                  {!mounted ? '차트 불러오는 중...' : '시험 기록 2회 이상이면 추이 그래프가 표시돼요'}
                </p>
              </div>
            )}
          </div>

          {/* 성적 목록 요약 */}
          {isStudentReport && (
            <div className="p-5 rounded-3xl border border-slate-100 bg-white space-y-3.5 flex flex-col justify-between max-h-[280px] print:max-h-none shadow-sm">
              <div>
                <h4 className="text-[10px] font-black text-slate-400 tracking-wider uppercase border-b border-slate-100 pb-2">최근 실시한 시험 목록</h4>
                <div className="space-y-3 mt-3 overflow-y-auto max-h-[160px] pr-1 print:max-h-none print:overflow-visible print:pr-0">
                  {[...student.grades].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(g => (
                    <div key={g.id} className="flex justify-between items-center text-[10px] border-b border-slate-100/50 pb-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-lg shrink-0">{g.subject}</span>
                        <span className="text-slate-500 font-semibold truncate max-w-[80px]">{g.testName}</span>
                        {g.source === 'student' && <span className="shrink-0 text-[7px] font-black text-[#0071E3] bg-[#0071E3]/10 px-1.5 py-0.5 rounded-full">직접</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-black text-[#0071E3]">{g.score}점</span>
                        {g.source === 'student' && (
                          <button type="button" onClick={() => deleteGrade(g.id)} className="no-print text-slate-300 hover:text-red-500 transition-colors" aria-label="성적 삭제">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {student.grades.length > 5 && (
                <p className="text-[8px] text-slate-400 italic text-center font-bold">누적 성적 테스트 기록 총 {student.grades.length}건 보존 중</p>
              )}
            </div>
          )}

        </div>
      )}

      {/* 성적 하락 격려 위젯 */}
      {isStudentReport && (() => {
        const dropInfo = detectScoreDrop();
        if (!dropInfo) return null;
        return (
          <div className="no-print mt-4 p-5 rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up">
            <div className="space-y-1">
              <h4 className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                <span>🧡</span> 이번 {dropInfo.subject} 시험은 조금 아쉬웠지만 괜찮아요!
              </h4>
              <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                이전 시험({dropInfo.prevScore}점) 대비 점수가 약 <span className="text-[#F56300] font-black">{dropInfo.dropPercent}%</span> 하락({dropInfo.currentScore}점)한 것으로 분석되었습니다.
                공부법이나 취약 유형을 분석하고 보완하면 다음 시험에서는 충분히 극복할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('student-requests');
                  setRequestCustomOpen(true);
                  setRequestForm({
                    requestType: 'etc',
                    message: `${dropInfo.subject} 성적 보완을 위한 1:1 약점 피드백 상담을 신청합니다. (최근 시험: ${dropInfo.testName} ${dropInfo.currentScore}점)`,
                    materialId: '',
                    materialType: 'book',
                    goalType: 'deadlineWeeks',
                    goalValue: '',
                    proposedWeekNumber: '',
                    proposedRangeText: '',
                    speedMultiplier: '1.0',
                    currentGoalSnapshot: null,
                  });
                  setTimeout(() => {
                    window.scrollTo({ top: document.getElementById('student-requests')?.offsetTop || 0, behavior: 'smooth' });
                  }, 100);
                }}
                className="rounded-xl bg-[#F56300] hover:bg-[#E05200] text-white px-3.5 py-2 text-[10px] font-black transition active:scale-[0.98] shadow-sm flex items-center gap-1"
              >
                <MessageSquare className="w-3 h-3" />
                1:1 약점 피드백 상담 신청
              </button>
              <a
                href="https://band.us"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3.5 py-2 text-[10px] font-bold transition shadow-sm flex items-center gap-1"
              >
                밴드 톡 바로가기
              </a>
            </div>
          </div>
        );
      })()}

      {/* 오답 실수 유형 취약성 진단 차트 */}
      {(() => {
        const aggregatedTags = {
          calculation_error: 0,
          time_limit: 0,
          misread_condition: 0,
          concept_leak: 0
        };

        (student.subjects || []).forEach(s => {
          (s.books || []).forEach(b => {
            if (b.incorrectTags) {
              aggregatedTags.calculation_error += Number(b.incorrectTags.calculation_error || 0);
              aggregatedTags.time_limit += Number(b.incorrectTags.time_limit || 0);
              aggregatedTags.misread_condition += Number(b.incorrectTags.misread_condition || 0);
              aggregatedTags.concept_leak += Number(b.incorrectTags.concept_leak || 0);
            }
          });
        });

        const totalIncorrect = Object.values(aggregatedTags).reduce((a, b) => a + b, 0);

        const pieData = [
          { name: '연산실수', value: aggregatedTags.calculation_error },
          { name: '시간부족', value: aggregatedTags.time_limit },
          { name: '조건오독', value: aggregatedTags.misread_condition },
          { name: '개념부족', value: aggregatedTags.concept_leak }
        ].filter(d => d.value > 0);

        const COLORS = {
          '연산실수': '#EF4444',
          '시간부족': '#F56300',
          '조건오독': '#FBBF24',
          '개념부족': '#0071E3'
        };

        return (
          <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">오답 원인 분석 (취약성 진단)</h4>
                <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">교재 학습 과정에서 직접 등록된 실수 요인 비율</p>
              </div>
              {totalIncorrect > 0 && (
                <span className="text-[9px] font-extrabold text-[#0071E3] bg-[#0071E3]/5 px-2 py-0.5 rounded-lg border border-[#0071E3]/10">
                  총 오답 기록: {totalIncorrect}건
                </span>
              )}
            </div>

            {totalIncorrect === 0 ? (
              <div className="py-8 px-4 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5">
                <p className="text-xs font-bold text-slate-400">아직 오답 원인 분석 데이터가 부족합니다.</p>
                <p className="text-[10px] text-slate-400/80 font-semibold">학습 진도 영역의 교재 목록에서 푼 문항 수 아래에 있는 '오답 사유 추가' 단추들을 눌러서 실수의 원인을 등록해보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="relative w-full h-[150px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#64748B'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute text-center">
                    <p className="text-sm font-black text-slate-800">{totalIncorrect}건</p>
                    <p className="text-[8px] font-bold text-slate-400">오답 총합</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {pieData.map((d) => {
                    const pct = ((d.value / totalIncorrect) * 100).toFixed(1);
                    return (
                      <div key={d.name} className="flex justify-between items-center text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[d.name as keyof typeof COLORS] }} />
                          {d.name}
                        </span>
                        <span className="text-slate-700">
                          {d.value}건 <span className="text-[10px] font-semibold text-slate-400">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
