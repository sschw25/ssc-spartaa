// 관리자 네비 단일소스 — 사이드바(AdminMenuList)와 하단 퀵탭(AdminGlassTabBar)이
// 같은 항목 정의(라벨·아이콘·경로·액션)를 공유한다. 새 화면을 추가하면 여기 한 곳만 고친다.
import {
  Home,
  Inbox,
  Stethoscope,
  CalendarDays,
  ClipboardCheck,
  Presentation,
  Utensils,
  AlarmClock,
  BookOpen,
  CalendarClock,
  UserPlus,
  Search,
  Plus,
  ClipboardList,
  LayoutGrid,
  ScanLine,
  Shield,
  CalendarHeart,
  Ticket,
  MessageSquare,
  Trophy,
  Sparkles,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react';

// href 없는 항목의 동작 종류 — 소비처(사이드바/퀵탭)가 각자 핸들러로 해석한다.
export type AdminMenuAction = 'search' | 'addStudent' | 'kiosk' | 'chatDock';

export interface AdminMenuItem {
  key: string;
  icon: LucideIcon;
  /** 사이드바용 상세 라벨 */
  label: string;
  /** 퀵탭 팝오버용 간결 라벨 — 없으면 label 사용 */
  shortLabel?: string;
  href?: string;
  action?: AdminMenuAction;
}

export interface AdminMenuSection {
  key: string;
  title: string;
  items: AdminMenuItem[];
}

// 항목 사전 — key 로 참조해 사이드바 섹션과 퀵탭 그룹을 조립한다.
const ITEM: Record<string, AdminMenuItem> = {
  dashboard: { key: 'dashboard', icon: Home, label: '홈 대시보드', shortLabel: '홈', href: '/admin/dashboard' },
  inbox: { key: 'inbox', icon: Inbox, label: '통합 인박스', href: '/admin/inbox' },
  diagnostics: { key: 'diagnostics', icon: Stethoscope, label: '계획 정합성 점검', shortLabel: '정합성 점검', href: '/admin/diagnostics' },
  calendar: { key: 'calendar', icon: CalendarDays, label: '캘린더 (일정 생성·알림)', shortLabel: '캘린더', href: '/admin/calendar' },
  mockExam: { key: 'mock-exam', icon: ClipboardCheck, label: '모의고사 관리', shortLabel: '모의고사', href: '/admin/mock-exam' },
  otEvents: { key: 'ot-events', icon: Presentation, label: 'OT · 설명회 관리', shortLabel: 'OT·설명회', href: '/admin/ot-events' },
  meals: { key: 'meals', icon: Utensils, label: '도시락 신청 · 정산', shortLabel: '도시락', href: '/admin/meals' },
  schedules: { key: 'schedules', icon: AlarmClock, label: '예약 스케줄', href: '/admin/schedules' },
  consultation: { key: 'consultation', icon: BookOpen, label: '학생 종합 관리', href: '/admin/consultation' },
  consultationBookings: { key: 'consultation-bookings', icon: CalendarClock, label: '상담 예약', href: '/admin/consultation-bookings' },
  applications: { key: 'applications', icon: UserPlus, label: '가입신청', href: '/admin/applications' },
  search: { key: 'search', icon: Search, label: '학생 검색', action: 'search' },
  addStudent: { key: 'add', icon: Plus, label: '학생 추가', action: 'addStudent' },
  attendance: { key: 'attendance', icon: ClipboardList, label: '출결 상세', href: '/admin/attendance' },
  seatBoard: { key: 'seat-board', icon: LayoutGrid, label: '좌석 현황판', href: '/admin/seat-board' },
  kiosk: { key: 'kiosk', icon: ScanLine, label: '등하원 체크 ↗', shortLabel: '등하원 체크', action: 'kiosk' },
  penalties: { key: 'penalties', icon: Shield, label: '벌점 · 상점 관리', shortLabel: '벌점·상점', href: '/admin/penalties' },
  leaveRequests: { key: 'leave-requests', icon: CalendarHeart, label: '휴식 · 반차 관리', shortLabel: '휴식·반차', href: '/admin/leave-requests' },
  coupons: { key: 'leave', icon: Ticket, label: '쿠폰 관리', shortLabel: '쿠폰', href: '/admin/leave' },
  chatDock: { key: 'chat-dock', icon: MessageSquare, label: '학생 채팅', action: 'chatDock' },
  messages: { key: 'messages', icon: MessageSquare, label: '메시지 발송', href: '/admin/messages' },
  leaderboard: { key: 'leaderboard', icon: Trophy, label: '순공 랭킹', href: '/admin/leaderboard' },
  missions: { key: 'missions', icon: Sparkles, label: '쿠폰 미션 설정', shortLabel: '쿠폰 미션', href: '/admin/missions' },
  healthScore: { key: 'health-score', icon: HeartPulse, label: '케어 지수', href: '/admin/health-score' },
  accounts: { key: 'accounts', icon: Shield, label: '관리자 계정 관리', href: '/admin/accounts' },
};

// 사이드바 섹션 — 기존 AdminMenuList 구성 그대로(+소통에 학생 채팅).
export function getSidebarSections(isSuper: boolean): AdminMenuSection[] {
  return [
    { key: 'main', title: '메인', items: [ITEM.dashboard, ITEM.inbox, ITEM.diagnostics] },
    {
      // 모의고사·OT·도시락은 캘린더 날짜에서 생성·알림하는 것이 기본 동선이지만,
      // 성적 입력·정산·인쇄용 단독 화면도 유지된다. 메뉴가 곧 전체 지도이도록 여기서 함께 노출.
      key: 'schedule',
      title: '캘린더 · 일정',
      items: [ITEM.calendar, ITEM.mockExam, ITEM.otEvents, ITEM.meals, ITEM.schedules],
    },
    {
      key: 'students',
      title: '학생 관리',
      items: [ITEM.consultation, ITEM.consultationBookings, ITEM.applications, ITEM.search, ITEM.addStudent],
    },
    {
      key: 'attendance',
      title: '출결 · 생활',
      items: [ITEM.attendance, ITEM.seatBoard, ITEM.kiosk, ITEM.penalties, ITEM.leaveRequests, ITEM.coupons],
    },
    { key: 'comms', title: '소통', items: [ITEM.chatDock, ITEM.messages] },
    { key: 'stats', title: '통계', items: [ITEM.leaderboard, ITEM.missions, ITEM.healthScore] },
    ...(isSuper ? [{ key: 'settings', title: '설정', items: [ITEM.accounts] }] : []),
  ];
}

export interface AdminQuickTabGroup {
  key: string;
  icon: LucideIcon;
  label: string;
  /** 좁은 화면(모바일)용 축약 라벨 — 없으면 label */
  shortLabel?: string;
  /** 바로 이동/실행하는 단일 목적지 (팝오버 없음) */
  href?: string;
  action?: AdminMenuAction;
  /** 팝오버로 펼치는 하위 항목들 */
  items?: AdminMenuItem[];
}

// 하단 퀵탭 그룹 — 사이드바의 모든 라우트/액션을 5그룹+채팅으로 재배치(관리자 계정만 사이드바 전용).
// 캘린더·일정 섹션은 별도 탭 대신 '소통' 팝오버에 병합해 탭 수를 유지한다.
export function getQuickTabGroups(): AdminQuickTabGroup[] {
  return [
    { key: 'home', icon: Home, label: '홈', href: '/admin/dashboard' },
    {
      key: 'students',
      icon: UserPlus,
      label: '학생',
      items: [ITEM.consultation, ITEM.consultationBookings, ITEM.applications, ITEM.search, ITEM.addStudent],
    },
    {
      key: 'attendance',
      icon: ClipboardList,
      label: '출결·생활',
      shortLabel: '출결',
      items: [ITEM.attendance, ITEM.seatBoard, ITEM.kiosk, ITEM.penalties, ITEM.leaveRequests, ITEM.coupons],
    },
    {
      key: 'comms',
      icon: Inbox,
      label: '소통·일정',
      shortLabel: '소통',
      items: [ITEM.inbox, ITEM.messages, ITEM.calendar, ITEM.mockExam, ITEM.otEvents, ITEM.meals, ITEM.schedules],
    },
    {
      key: 'stats',
      icon: Trophy,
      label: '통계',
      items: [ITEM.leaderboard, ITEM.missions, ITEM.healthScore, ITEM.diagnostics],
    },
    // 채팅 — 팝오버 없이 전역 채팅 독을 바로 연다(아이콘에 미읽음+미처리 배지).
    { key: 'chat', icon: MessageSquare, label: '채팅', action: 'chatDock' },
  ];
}
