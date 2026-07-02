'use client';

import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SubjectProgress, ConsultationLog, SharedMaterial } from '@/lib/types/student';

// 빠른 입력 한 줄의 파싱 결과. 첫 숫자 = 현재 진도 위치, 둘째 = 총량.
export interface QuickPlanPreviewItem {
  original: string;
  subjectName: string;
  title: string;
  type: 'book' | 'lecture';
  currentAmount: number;
  totalAmount: number;
  unit: string;
  cadence: string;
  timeLabel: string;
  studyTime: 'morning' | 'afternoon' | 'night' | '';
  studyDays: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  invalidReason: string;
}

// 상세 시트의 공유 상태/핸들러 컨테이너.
// 값 자체는 부모(student-detail-sheet)에서 타입 검사된다. 여기서는 반복(map/find)에 쓰이는
// 데이터 필드만 실제 타입을 지정하고(타입 추론 유지), 나머지는 인덱스 시그니처로 느슨히 받는다.
export interface DetailSheetCtx {
  subjectsState: SubjectProgress[];
  setSubjectsState: Dispatch<SetStateAction<SubjectProgress[]>>;
  customCategories: string[];
  learningLogs: ConsultationLog[];
  quickPlanPreview: QuickPlanPreviewItem[];
  integratedSearchResults: SharedMaterial[];
  // 업데이터 함수(prev => ...)로 호출되는 setter — prev 의 암시적 any 방지 (구체 타입 필요)
  setCategoryFilter: Dispatch<SetStateAction<Record<string, string>>>;
  setCollapsedSubjects: Dispatch<SetStateAction<Record<string, boolean>>>;
  setEditingGoals: Dispatch<SetStateAction<Record<string, string>>>;
  setMaterialTargetDates: Dispatch<SetStateAction<Record<string, string>>>;
  setSortOrder: Dispatch<SetStateAction<Record<string, string>>>;
  setWeeklyPlanRanges: Dispatch<SetStateAction<Record<string, string>>>;
  [key: string]: any;
}

const Ctx = createContext<DetailSheetCtx | null>(null);

export function useDetailSheet(): DetailSheetCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDetailSheet must be used within <DetailSheetProvider>');
  return v;
}

export const DetailSheetProvider = Ctx.Provider;
