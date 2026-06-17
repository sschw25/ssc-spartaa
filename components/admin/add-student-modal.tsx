'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Student } from '@/lib/types/student';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newStudent: Student) => void;
  students?: Student[];
}

export function AddStudentModal({ isOpen, onClose, onSuccess, students = [] }: AddStudentModalProps) {
  const [name, setName] = useState('');
  const [campus, setCampus] = useState('wonju');
  const [manager, setManager] = useState('');
  const [contact, setContact] = useState('');
  const [nextConsultationDate, setNextConsultationDate] = useState('');
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [specialNote, setSpecialNote] = useState('');
  const [loading, setLoading] = useState(false);

  // 등록된 기존 원생들의 목표시험 목록 중복제거 추출
  const uniqueExams = Array.from(
    new Set(
      students
        .map(s => s.contact)
        .filter((exam): exam is string => typeof exam === 'string' && exam.trim() !== '')
    )
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('원생 이름을 입력해 주세요.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: name.trim(),
        campus,
        manager: manager.trim(),
        contact: contact.trim(),
        nextConsultationDate: nextConsultationDate || undefined,
        speedMultiplier,
        lifeComment: '',
        specialNote,
        consultationLogs: [],
        books: [],
        lectures: [],
        grades: [],
        subjects: [],
      };

      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`${name} 원생이 성공적으로 등록되었습니다.`);
        onSuccess(data.data);
        
        // 폼 리셋
        setName('');
        setCampus('wonju');
        setManager('');
        setContact('');
        setNextConsultationDate('');
        setSpeedMultiplier(1.0);
        setSpecialNote('');
        onClose();
      } else {
        toast.error(data.message || '등록에 실패했습니다.');
      }
    } catch (err) {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl border-black/[0.05] p-6 bg-white overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg font-bold text-[#1D1D1F]">신규 원생 등록</DialogTitle>
          <DialogDescription className="text-xs text-[#86868B]">
            스파르타 밀착 관리를 위한 신규 원생 기본 프로필을 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-xs font-semibold text-[#1D1D1F]">
                이름 *
              </Label>
              <Input
                id="new-name"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="new-campus" className="text-xs font-semibold text-[#1D1D1F]">
                소속 캠퍼스
              </Label>
              <Select value={campus} onValueChange={setCampus}>
                <SelectTrigger id="new-campus" className="rounded-xl border-black/[0.08] text-xs py-4.5 bg-white">
                  <SelectValue placeholder="캠퍼스 선택" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="wonju" className="text-xs">원주 캠퍼스</SelectItem>
                  <SelectItem value="chuncheon" className="text-xs">춘천 캠퍼스</SelectItem>
                  <SelectItem value="chungju" className="text-xs">충주 캠퍼스</SelectItem>
                  <SelectItem value="etc" className="text-xs">기타/퇴원</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-manager" className="text-xs font-semibold text-[#1D1D1F]">
                담당 관리자
              </Label>
              <Input
                id="new-manager"
                placeholder="원주센터장"
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-contact" className="text-xs font-semibold text-[#1D1D1F]">
                목표시험
              </Label>
              <Input
                id="new-contact"
                placeholder="예: 수능, 9급 공무원, 임용"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                list="target-exams-list"
                className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5 bg-white"
              />
              <datalist id="target-exams-list">
                {uniqueExams.map(exam => (
                  <option key={exam} value={exam} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-speed" className="text-xs font-semibold text-[#1D1D1F]">
              학습 속도 가중치
            </Label>
            <Select value={String(speedMultiplier)} onValueChange={(val) => setSpeedMultiplier(Number(val))}>
              <SelectTrigger id="new-speed" className="rounded-xl border-black/[0.08] text-xs py-4.5 bg-white">
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

          <div className="space-y-1.5">
            <Label htmlFor="new-next-consult" className="text-xs font-semibold text-[#1D1D1F]">
              다음 상담 예정일
            </Label>
            <Input
              id="new-next-consult"
              type="date"
              value={nextConsultationDate}
              onChange={(e) => setNextConsultationDate(e.target.value)}
              className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5 bg-white"
            />
            <p className="text-[10px] text-[#86868B]">
              지정하면 상담 알림 대시보드에 자동으로 반영됩니다. (선택)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-special-note" className="text-xs font-semibold text-[#1D1D1F]">
              특이사항
            </Label>
            <Textarea
              id="new-special-note"
              placeholder="예: 연락 가능 시간, 보호자 요청, 건강/생활 참고사항 등 내부 관리 메모를 입력하세요."
              value={specialNote}
              onChange={(e) => setSpecialNote(e.target.value)}
              className="rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs min-h-[72px]"
            />
            <p className="text-[10px] text-[#86868B]">
              내부 관리용 메모이며 학부모용 결과지에는 표시되지 않습니다.
            </p>
          </div>

          <DialogFooter className="pt-3 border-t border-black/[0.05] mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl text-xs py-4 bg-white"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl text-xs bg-[#1D1D1F] hover:bg-[#323236] text-white py-4"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  등록 중...
                </>
              ) : (
                '원생 등록'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
