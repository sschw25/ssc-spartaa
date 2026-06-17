'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2 } from 'lucide-react';

interface InfoTabProps {
  name: string;
  setName: (v: string) => void;
  campus: string;
  setCampus: (v: string) => void;
  manager: string;
  setManager: (v: string) => void;
  contact: string;
  setContact: (v: string) => void;
  speedMultiplier: number;
  setSpeedMultiplier: (v: number) => void;
  nextConsultationDate: string;
  setNextConsultationDate: (v: string) => void;
  specialNote: string;
  setSpecialNote: (v: string) => void;
  uniqueExams: string[];
  loading: boolean;
  onUpdateInfo: () => void;
  onDeleteStudent: () => void;
}

// 학생 기본정보 탭 (프레젠테이셔널). 상태·핸들러는 부모가 소유하고 props 로 전달.
export function InfoTab({
  name, setName,
  campus, setCampus,
  manager, setManager,
  contact, setContact,
  speedMultiplier, setSpeedMultiplier,
  nextConsultationDate, setNextConsultationDate,
  specialNote, setSpecialNote,
  uniqueExams,
  loading,
  onUpdateInfo,
  onDeleteStudent,
}: InfoTabProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name" className="text-xs font-semibold text-[#1D1D1F]">
            이름 *
          </Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-campus" className="text-xs font-semibold text-[#1D1D1F]">
            소속 센터
          </Label>
          <Select value={campus} onValueChange={setCampus}>
            <SelectTrigger id="edit-campus" className="rounded-lg border-black/[0.08] text-xs h-9 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="wonju" className="text-xs">원주 캠퍼스</SelectItem>
              <SelectItem value="chuncheon" className="text-xs">춘천 캠퍼스</SelectItem>
              <SelectItem value="chungju" className="text-xs">충주 캠퍼스</SelectItem>
              <SelectItem value="etc" className="text-xs">기타/퇴원</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-manager" className="text-xs font-semibold text-[#1D1D1F]">
            담당 상담자
          </Label>
          <Input
            id="edit-manager"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-contact" className="text-xs font-semibold text-[#1D1D1F]">
            목표시험
          </Label>
          <Input
            id="edit-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            list="edit-target-exams-list"
            placeholder="예: 수능, 9급 공무원, 임용"
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
          <datalist id="edit-target-exams-list">
            {uniqueExams.map((exam) => (
              <option key={exam} value={exam} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-speed" className="text-xs font-semibold text-[#1D1D1F]">
            학습 속도 가중치
          </Label>
          <Select value={String(speedMultiplier)} onValueChange={(val) => setSpeedMultiplier(Number(val))}>
            <SelectTrigger id="edit-speed" className="rounded-lg border-black/[0.08] text-xs h-9 bg-white">
              <SelectValue placeholder="가중치 선택" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="0.5" className="text-xs">0.5배속 (매우 느림 / 기초)</SelectItem>
              <SelectItem value="0.8" className="text-xs">0.8배속 (조금 느림)</SelectItem>
              <SelectItem value="1.0" className="text-xs">1.0배속 (보통 / 기본)</SelectItem>
              <SelectItem value="1.2" className="text-xs">1.2배속 (조금 빠름)</SelectItem>
              <SelectItem value="1.5" className="text-xs">1.5배속 (매우 빠름)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="edit-next" className="text-xs font-semibold text-[#1D1D1F]">
            다음 상담 예정일
          </Label>
          <Input
            id="edit-next"
            type="date"
            value={nextConsultationDate}
            onChange={(e) => setNextConsultationDate(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="edit-special-note" className="text-xs font-semibold text-[#1D1D1F]">
            특이사항
          </Label>
          <Textarea
            id="edit-special-note"
            placeholder="보호자 요청, 연락 가능 시간, 건강/생활 참고사항 등 내부 관리 메모를 입력하세요."
            value={specialNote}
            onChange={(e) => setSpecialNote(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[78px]"
          />
          <p className="text-[10px] text-[#86868B]">
            내부 관리용 메모이며 학부모용 결과지에는 표시되지 않습니다.
          </p>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          onClick={onDeleteStudent}
          disabled={loading}
          variant="destructive"
          className="rounded-lg text-xs py-4 px-4 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          원생 영구 삭제
        </Button>

        <Button
          onClick={onUpdateInfo}
          disabled={loading}
          className="rounded-lg text-xs py-4 px-6 bg-[#1D1D1F] hover:bg-[#323236] text-white font-bold"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              저장 중...
            </>
          ) : (
            '원생 정보 저장'
          )}
        </Button>
      </div>
    </>
  );
}
