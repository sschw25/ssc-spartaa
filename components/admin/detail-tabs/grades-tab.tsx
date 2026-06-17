'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { Student } from '@/lib/types/student';

interface GradesTabProps {
  student: Student;
  gradeFilter: string;
  setGradeFilter: (v: string) => void;
  gradeTestName: string;
  setGradeTestName: (v: string) => void;
  gradeSubject: string;
  setGradeSubject: (v: string) => void;
  gradeScore: number;
  setGradeScore: (v: number) => void;
  gradeDate: string;
  setGradeDate: (v: string) => void;
  chartData: any[];
  gradeSubjects: string[];
  subjects: string[];
  onAddGrade: (e: React.FormEvent) => void;
  onDeleteGrade: (gradeId: string) => void;
}

// 성적 탭 (프레젠테이셔널). 상태·핸들러는 부모(student-detail-sheet)가 소유하고 props 로 전달.
export function GradesTab({
  student,
  gradeFilter, setGradeFilter,
  gradeTestName, setGradeTestName,
  gradeSubject, setGradeSubject,
  gradeScore, setGradeScore,
  gradeDate, setGradeDate,
  chartData, gradeSubjects, subjects,
  onAddGrade, onDeleteGrade,
}: GradesTabProps) {
  return (
    <>
      {/* 성적 추이 그래프 */}
      <div className="admin-fit-box p-4 rounded-xl border border-black/[0.05] bg-[#F5F5F7]">
        <div className="admin-fit-row flex justify-between items-center mb-4 gap-2 admin-mobile-wrap">
          <h4 className="admin-fit-text admin-fit-label font-bold text-[#1D1D1F]">성적 향상도 추이</h4>
          <div className="flex gap-1.5 min-w-0 overflow-hidden">
            {['전체', '국어', '영어', '수학', '한국사'].map((sub) => (
              <Button
                key={sub}
                size="sm"
                variant={gradeFilter === sub ? 'default' : 'outline'}
                onClick={() => setGradeFilter(sub)}
                className="admin-fit-button text-[9px] h-6 px-2 rounded-md"
              >
                {sub}
              </Button>
            ))}
          </div>
        </div>

        {student.grades.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#86868B]">
            그래프를 표시할 성적 데이터가 없습니다.
          </div>
        ) : (
          <div className="w-full h-[220px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 10 }} />
                {gradeSubjects
                  .filter(s => gradeFilter === '전체' || s === gradeFilter)
                  .map((subject, idx) => {
                    const colors: Record<string, string> = {
                      '국어': '#0071E3',
                      '수학': '#862bf7',
                      '영어': '#F56300',
                      '한국사': '#10B981',
                      '기타': '#EF4444'
                    };
                    const defaultColors = ['#0071E3', '#862bf7', '#F56300', '#10B981', '#EC4899', '#3B82F6', '#EF4444'];
                    return (
                      <Line
                        key={subject}
                        type="monotone"
                        dataKey={subject}
                        name={subject}
                        stroke={colors[subject] || defaultColors[idx % defaultColors.length]}
                        strokeWidth={2.5}
                        activeDot={{ r: 6 }}
                        dot={{ strokeWidth: 2, r: 4 }}
                        connectNulls={true}
                      />
                    );
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 성적 등록 폼 */}
      <form onSubmit={onAddGrade} className="admin-fit-box p-3.5 rounded-xl border border-black/[0.05] bg-white grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-[#86868B]">시험명</Label>
          <Input
            placeholder="예: 6월 모의고사"
            value={gradeTestName}
            onChange={(e) => setGradeTestName(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-[#86868B]">과목</Label>
          <Select value={gradeSubject} onValueChange={setGradeSubject}>
            <SelectTrigger className="rounded-lg border-black/[0.08] text-xs h-9 bg-white">
              <SelectValue placeholder="과목 선택" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              {subjects.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-[#86868B]">점수</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={gradeScore}
            onChange={(e) => setGradeScore(Number(e.target.value))}
            className="rounded-lg border-black/[0.08] text-xs h-9"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-[#86868B]">시험일</Label>
          <Input
            type="date"
            value={gradeDate}
            onChange={(e) => setGradeDate(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9"
            required
          />
        </div>
        <Button
          type="submit"
          className="admin-fit-button rounded-lg text-xs h-9 bg-[#1D1D1F] hover:bg-[#323236] text-white font-bold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          기록 추가
        </Button>
      </form>

      {/* 성적 내역 리스트 */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-[#1D1D1F] border-b border-black/[0.05] pb-2">기록된 성적 내역</h4>
        {student.grades.length === 0 ? (
          <div className="text-center py-4 text-xs text-[#86868B]">기록된 성적이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {[...student.grades].reverse().map((g) => (
              <div key={g.id} className="admin-fit-box flex justify-between items-center gap-3 p-3 rounded-lg border border-black/[0.04] bg-white text-xs">
                <div className="admin-fit-row min-w-0">
                  <span className="font-bold mr-2">{g.subject}</span>
                  <span className="admin-fit-text text-[#86868B] inline-block align-bottom max-w-[10rem]">{g.testName}</span>
                  <span className="admin-fit-caption text-[#86868B] ml-2">({g.date})</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-[#0071E3]">{g.score}점</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDeleteGrade(g.id)}
                    className="text-red-500 hover:text-red-700 w-6 h-6 rounded-md"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
