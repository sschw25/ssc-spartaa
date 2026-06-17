'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from 'lucide-react';
import { ConsultationLog } from '@/lib/types/student';

interface ConsultTabProps {
  lifeComment: string;
  setLifeComment: (v: string) => void;
  studentLifeComment: string;
  setStudentLifeComment: (v: string) => void;
  lifeLogs: ConsultationLog[];
}

// 생활 관리 탭 (프레젠테이셔널). 코멘트 저장은 부모의 마스터 저장/자동저장 경로에서 처리.
export function ConsultTab({
  lifeComment, setLifeComment,
  studentLifeComment, setStudentLifeComment,
  lifeLogs,
}: ConsultTabProps) {
  return (
    <>
      <div className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[#1D1D1F]">학부모 공유용 생활 코멘트</h4>
            <p className="text-[10px] text-[#86868B] mt-0.5">
              학부모용 결과지에 그대로 표시되는 담임 생활 관리 피드백입니다.
            </p>
          </div>
        </div>
        <Textarea
          placeholder="예: 등원 시간, 휴대폰 통제, 수면/식사, 자습 태도, 멘탈 관리에 대한 코멘트를 입력하세요."
          value={lifeComment}
          onChange={(e) => setLifeComment(e.target.value)}
          className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[110px]"
        />
      </div>

      <div className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[#1D1D1F]">학생 공유용 생활 코멘트</h4>
            <p className="text-[10px] text-[#86868B] mt-0.5">
              학생 본인이 확인할 생활 습관, 자습 태도, 다음 행동 피드백입니다.
            </p>
          </div>
        </div>
        <Textarea
          placeholder="예: 이번 주는 등원 루틴을 유지하고, 쉬는 시간 휴대폰 사용을 줄이며, 자습 시작 전 오늘 목표를 먼저 적어주세요."
          value={studentLifeComment}
          onChange={(e) => setStudentLifeComment(e.target.value)}
          className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[110px]"
        />
      </div>

      <div id="life-consultation-logs" className="space-y-4">
        <h3 className="text-sm font-bold border-b border-black/[0.05] pb-2 flex items-center">
          <Calendar className="w-4 h-4 mr-2 text-[#86868B]" />
          누적 생활 면담 기록 ({lifeLogs.length}건)
        </h3>

        {lifeLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#86868B]">
            등록된 생활 면담 기록이 없습니다.
          </div>
        ) : (
          <div className="relative border-l border-black/[0.08] pl-5 ml-2.5 space-y-5">
            {lifeLogs.map((log) => (
              <div key={log.id} className="relative group">
                <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-[#1D1D1F] bg-white group-hover:bg-[#0071E3] transition-colors" />
                <div className="p-4 rounded-xl border border-black/[0.05] bg-white space-y-2 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#1D1D1F]">{log.date}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-[#F5F5F7] rounded-full text-[#86868B] font-semibold">
                      면담자: {log.manager}
                    </span>
                  </div>
                  <pre className="text-xs text-[#434345] leading-relaxed whitespace-pre-wrap font-sans">
                    {log.content}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
