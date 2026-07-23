// 인박스 공유 타입 — 페이지(리스트 뷰)와 채팅 뷰가 같은 항목 모델을 쓴다.
export type InboxItemType =
  | 'leave' | 'request' | 'suggestion' | 'ot_absence' | 'mock_absence'
  | 'reward' | 'meal_add' | 'signup' | 'chat';

export type TimelineTone = 'amber' | 'blue' | 'emerald';

export interface InboxItem {
  id: string;
  studentId: string;
  studentName: string;
  campus: string;
  type: InboxItemType;
  category: 'living' | 'counsel' | 'facility';
  title: string;
  content: string;
  date: string;
  status: string;
  statusText: '접수중' | '처리중' | '완료';
  needsAction: boolean;
  tone: TimelineTone;
  adminReply: string;
  createdAt: string;
  rawItem: any;
}

// 채팅 뷰 좌측 대화목록 한 줄 요약.
export interface ConversationSummary {
  studentId: string;
  studentName: string;
  campus: string;
  lastActivityAt: string;
  lastPreview: string;
  needsActionCount: number;
  unread: boolean;
}
