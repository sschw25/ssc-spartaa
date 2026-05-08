import {
  Clock,
  CheckSquare,
  BarChart2,
  Heart,
  Home,
  Smartphone,
  BookOpen,
  Award,
  Target,
  Sun,
  Coffee,
  Moon
} from 'lucide-react'
import { StreamSystem } from './stream-content'
import { CampusKey } from './campus-config'

// 공통 시스템
const COMMON_SUMMER_SYSTEMS: StreamSystem[] = [
  { icon: 'Clock', title: '교시제 집중 자습', description: '7교시 · 12시간 순공 시스템으로\n흔들리지 않는 집중력을 유지합니다.' },
  { icon: 'CheckSquare', title: '코멘터 출결 2중 관리', description: '카드와 태블릿 2중 출결 시스템으로\n단 한 번의 이탈도 완벽하게 차단합니다.' },
  { icon: 'BarChart2', title: '다양한 학습 공간', description: '컨디션에 맞춰 선택할 수 있는\n3가지 타입의 프리미엄 공간을 제공합니다.' },
  { icon: 'Heart', title: '정기 조회 및 멘탈 관리', description: '매달 성취감을 공유하고 슬럼프를 예방하는\n정기 멘탈 케어 세션을 진행합니다.' },
  { icon: 'Home', title: '스터디 및 라운지 무상 지원', description: '개별 학습 외에도 개방형 라운지 등\n휴게 공간을 자유롭게 이용 가능합니다.' },
  { icon: 'Smartphone', title: '엄격한 생활루틴 관리', description: '입실 시 핸드폰 수거, 플래너 밀착 피드백,\n원내 친목 및 대화 전면 금지로\n모든 외부 유혹을 완벽하게 차단합니다.' },
]

const COMMON_SCHEDULE = [
  { time: '08:30', label: '등원 및 출석 확인', desc: '휴대폰 제출 및 일일 플래너 작성', icon: 'Sun' },
  { time: '09:00', label: '오전 자습 1교시', desc: '가장 맑은 정신으로 시작하는 집중 학습', icon: 'BookOpen' },
  { time: '10:30', label: '과목별 학습 진행', desc: '계획표에 따른 자기주도 학습 (인강/자습)', icon: 'Target' },
  { time: '12:00', label: '점심시간', desc: '식사 및 휴식', icon: 'Coffee' },
  { time: '13:00', label: '오후 집중학습', desc: '졸음을 이겨내는 오후 120분 몰입', icon: 'BookOpen' },
  { time: '15:00', label: '점검 및 피드백', desc: '학습 점검 및 필요한 경우 테스트 진행', icon: 'CheckSquare' },
  { time: '17:00', label: '담임 상담', desc: '학습 방향성 점검 및 계획 수정', icon: 'Heart' },
  { time: '18:00', label: '저녁시간', desc: '식사 및 휴식', icon: 'Coffee' },
  { time: '19:00', label: '야간 자습', desc: '오늘 목표한 분량 완벽 마무리', icon: 'Moon' },
  { time: '21:30', label: '마감 점검 및 퇴실', desc: '내일 계획 점검 및 귀가', icon: 'Home' },
]

const COMMON_MINDSET = {
  title: '당신의 한계를 깨트릴\n3가지 절대 원칙',
  description: '스스로를 이겨내기란 쉽지 않습니다.\n그래서 스파르타가 당신의 의지가 되어드립니다.\n이 3가지 원칙을 지켜내는 4주 후, 완전히 달라진 자신을 만나게 될 것입니다.',
  items: [
    {
      title: '졸음 원천 차단',
      subtitle: '1분의 시간도 헛되지 않도록',
      desc: '나른한 오후, 쏟아지는 졸음을 이겨내는 것이 진짜 실력입니다. 집중력이 흐트러지는 순간을 놓치지 않고 꼼꼼히 순찰하며, 스스로 스탠딩 책상에서 다시 몰입할 수 있는 환경을 만들어 드립니다. 포기하고 싶은 그 순간, 다시 일어설 수 있는 힘을 길러줍니다.'
    },
    {
      title: '완벽한 디지털 디톡스',
      subtitle: '오직 목표를 향한 순수한 몰입',
      desc: '학원 내에서는 오직 목표를 향한 학습만 허락됩니다. 학습 기기로 딴짓을 하거나 허용되지 않은 기기를 사용하는 것은 엄격히 금지됩니다. 적발 시 기기 일시 사용 정지 및 진심 어린 면담을 통해, 다시금 처음의 다짐을 되새기고 온전히 공부에만 빠져드는 경험을 선사합니다.'
    },
    {
      title: '침묵이 만드는 기적',
      subtitle: '나와 목표에만 집중하는 시간',
      desc: '쉬는 시간조차 완벽한 몰입의 연장선입니다. 학원 내 친목과 불필요한 대화를 원천 차단하여, 타인의 방해 없이 온전히 나와 나의 목표에만 집중할 수 있는 고요하고 단단한 환경을 유지합니다. 묵묵히 쌓아간 침묵의 시간들이 결국 압도적인 결과로 증명될 것입니다.'
    }
  ]
}

export interface SummerContent {
  reservationUrl: string;
  hero: { title: string; subtitle: string; description: string };
  overview: { target: string; period: string; hours: string; capacity: string; registration: string };
  mindsetRules: typeof COMMON_MINDSET;
  features: { title: string; items: { title: string; desc: string }[] };
  systems: StreamSystem[];
  schedule: typeof COMMON_SCHEDULE;
  recommendedFor: string[];
  registrationSteps: { step: string; title: string; desc: string }[];
  pricing: { tuition: string; included: string };
  faqs: { q: string; a: string }[];
  testimonials: { name: string; result: string; quote: string }[];
}

const baseContent: Omit<SummerContent, 'reservationUrl'> = {
  hero: {
    title: '2026 SSC 스파르타\n썸머스쿨 모집',
    subtitle: '여름방학 4주, 생활습관과 공부루틴을\n다시 잡는 집중관리 프로그램',
    description: '혼자서는 무너지는 여름방학을 관리로 바꾸는 시간.\n방학의 차이가 합격의 격차를 만듭니다.',
  },
  overview: {
    target: '고등학생 (고1 ~ 고3) 중 여름방학 집중관리가 필요한 학생',
    period: '학교별 상이 (방학 날짜에 따라 4주 진행)',
    hours: '오전 등원 ~ 야간 자습',
    capacity: '선착순 마감',
    registration: '구글폼 예약 → 개별 안내 진행'
  },
  mindsetRules: COMMON_MINDSET,
  features: {
    title: '불필요한 강의는 빼고\n필요한 관리만 담은 스마트 썸머스쿨',
    items: [
      {
        title: '프리미엄 환경과 개인별 맞춤 학습',
        desc: '필요하지 않은 의무 강의를 억지로 들을 필요가 없습니다.\n최고의 몰입을 위한 프리미엄 환경에서 본인에게 꼭 필요한\n인터넷 강의와 교재로만 맞춤 학습을 진행하세요.',
      },
      {
        title: '대치동식 개인별 관리학습 시스템',
        desc: '단순 자습이 아닙니다. 대치의 관리 시스템을 도입하여,\n학습 계획 점검, 휴대폰 수거, 등하원 통제 등\n혼자서는 유지하기 힘든 완벽한 생활습관을 만들어줍니다.',
      },
      {
        title: '선택형 관리와 테스트 피드백',
        desc: '매일 영단어 및 국/영/수 주간테스트 등은 모두\n본인의 필요에 따라 참여 여부와 관리 강도를 선택할 수 있어,\n강압적이지 않으면서도 확실한 피드백을 제공합니다.',
      }
    ]
  },
  systems: COMMON_SUMMER_SYSTEMS,
  schedule: COMMON_SCHEDULE,
  recommendedFor: [
    '방학만 되면 늦잠과 스마트폰으로 생활패턴이 무너지는 고등학생',
    '불필요한 현장 강의 대신, 나만의 인강 커리큘럼에 집중하고 싶은 학생',
    '집이나 독서실에서 혼자 공부하면 유혹을 견디기 힘든 학생',
    '대치동 수준의 밀착 관리와 쾌적한 프리미엄 학습 환경이 필요한 학생',
    '여름방학 4주 동안 압도적인 순공시간을 기록하고 싶은 학생'
  ],
  registrationSteps: [
    { step: '1단계', title: '구글폼 접수', desc: '썸머스쿨 예약 구글폼을 작성하여 제출' },
    { step: '2단계', title: '개별 안내', desc: '제출된 내용을 바탕으로 개별 안내 문자 발송' },
    { step: '3단계', title: '일정/좌석 확인', desc: '등록 가능 일정 및 캠퍼스별 좌석 확인' },
    { step: '4단계', title: '등록 및 등원', desc: '등록 완료 및 썸머스쿨 등원 안내' },
    { step: '문의', title: '네이버 톡톡', desc: '상담이 필요한 경우 네이버 톡톡으로 문의' }
  ],
  pricing: {
    tuition: '상담 시 상세 안내\n* 예약금: 1만원\n* 얼리버드 혜택: 5~6월 등록 시 3만원 할인',
    included: '지정석 이용, 출결/휴대폰 관리, 학습계획 피드백, 정기 상담 등\n* 도시락은 별도로 신청할 수 있으며 집에서 싸오셔도 됩니다.',
  },
  faqs: [
    {
      q: '썸머스쿨은 누구에게 적합한가요?',
      a: '방학 동안 생활패턴과 공부시간을 강하게 관리받고 싶은 고등학생(고1~고3)에게 적합합니다. 불필요한 현장 강의 없이 본인만의 맞춤 학습(인강/자습)에 집중하고 싶은 학생에게 특히 효과적입니다.'
    },
    {
      q: '학원에서 직접 진행하는 강의가 있나요?',
      a: '직접 진행하는 의무 수강 강의는 없습니다. 대치동의 개인별 관리학습 시스템이 도입되어 있어, 학생들이 기존에 수강 중인 인터넷 강의나 교재를 바탕으로 최적의 학습을 할 수 있도록 관리해주는 스마트 썸머스쿨입니다.'
    },
    {
      q: '하루 종일 의무적으로 있어야 하나요?',
      a: '학교에 가지 않는 방학 기간이므로, 본인의 다른 학원(단과 등) 스케줄에 맞춰 등하원 시간을 유동적으로 조정할 수 있습니다. 상담 시 미리 스케줄을 조율해 주시면 됩니다.'
    },
    {
      q: '테스트는 의무로 진행되나요?',
      a: '테스트를 의무로 진행하지 않습니다. 매일 영단어 테스트 및 국/영/수 주간테스트 등은 본인의 필요와 목표에 따라 참여 여부와 관리 강도를 자유롭게 선택할 수 있습니다.'
    },
    {
      q: '휴대폰 관리는 어떻게 하나요?',
      a: '등원 시 휴대폰을 일괄 수거하여 별도 보관하며, 점심 및 저녁 식사 시간에 한하여 사용이 가능합니다. 학습 중 가장 큰 방해 요소를 철저하게 차단합니다.'
    },
    {
      q: '식사는 어떻게 해결하나요?',
      a: '도시락은 학원에 별도로 신청하여 드실 수 있으며, 원하실 경우 집에서 직접 싸오셔도 됩니다.'
    },
    {
      q: '등록 전에 방문 상담이 꼭 필요한가요?',
      a: '방문 상담 없이 구글폼 작성을 통해 바로 예약을 진행하시면 됩니다. 이후 개별 안내에 따라 등록 절차가 진행되며, 궁금하신 사항은 네이버 톡톡으로 문의해주시면 친절히 답변해 드립니다.'
    },
    {
      q: '썸머스쿨도 1일 무료체험이 가능한가요?',
      a: '썸머스쿨은 단기 집중 프로그램 특성상 1일 무료체험을 제공하지 않습니다.'
    }
  ],
  testimonials: [
    {
      name: '김O민 학생',
      result: '공부 루틴 정착',
      quote: '하루 평균 6~10시간씩 정해진 시간에 공부하는 루틴이 생겼어요.\n미루는 습관이 확연히 줄어든 게 가장 큰 변화입니다.'
    },
    {
      name: '이O진 학생',
      result: '일정 병행 관리',
      quote: '학교, 학원 일정으로 바쁜 와중에도 SSC 썸머스쿨 덕분에\n무너지지 않고 끝까지 저만의 공부 루틴을 유지할 수 있었어요.'
    },
    {
      name: '박O우 학생',
      result: '집중력 대폭 향상',
      quote: '집보다 훨씬 집중이 잘 됐습니다. 고정좌석제와 라운지를 오가며\n장소 변화를 줄 수 있었고, 다들 열심히 하는 분위기라 자극을 받았어요.'
    }
  ]
};

export const campusSummerContent: Record<CampusKey, SummerContent> = {
  wonju: {
    ...baseContent,
    reservationUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdeG0f43iMLgvJY_4q7VuEWFbZ53OHRbZT5DaI2SOSFUBYOkw/viewform'
  },
  chuncheon: {
    ...baseContent,
    reservationUrl: 'https://docs.google.com/forms/d/1zB9xJWiCvyipnPxx2Li96lQinSuuFSqWAZlM40JjBUI/viewform'
  },
  chungju: {
    ...baseContent,
    reservationUrl: 'https://forms.gle/F2MohzXsLx9zmER86'
  }
};

// 하위 호환성을 위해 wonju 데이터를 기본으로 export
export const summerContent = campusSummerContent.wonju;
