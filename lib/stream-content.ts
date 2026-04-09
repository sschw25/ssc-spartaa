import {
  Clock,
  CheckSquare,
  BarChart2,
  MessageSquare,
  Heart,
  Home,
  BookOpen,
  ClipboardList,
  Target,
  Award,
  LucideIcon
} from 'lucide-react'

export type StreamId = 'gongmuwon' | 'suneung' | 'imyong' | 'professional' | 'job'

export interface FAQItem {
  q: string
  a: string
}

export interface StreamSystem {
  icon: string
  title: string
  description: string
}

export interface TestimonialItem {
  name: string
  result: string
  quote: string
}

export interface StreamContent {
  id: StreamId
  name: string
  hero: {
    title: string
    subtitle: string
    description?: string
  }
  differentiation: {
    title: string
    items: {
      title: string
      desc: string
    }[]
  }
  systems: StreamSystem[]
  faqs: FAQItem[]
  testimonials: TestimonialItem[]
}

export const COMMON_SYSTEMS: StreamSystem[] = [
  { icon: 'Clock', title: '교시제 집중 자습', description: '7교시 · 12시간 순공 시스템으로\n흔들리지 않는 집중력을 유지합니다.' },
  { icon: 'CheckSquare', title: '코멘터 출결 2중 관리', description: '카드와 태블릿 2중 출결 시스템으로\n단 한 번의 이탈도 완벽하게 차단합니다.' },
  { icon: 'BarChart2', title: '다양한 학습 공간', description: '컨디션에 맞춰 선택할 수 있는\n3가지 타입의 프리미엄 공간을 제공합니다.' },
  { icon: 'Heart', title: '정기 조회 및 멘탈 관리', description: '매달 성취감을 공유하고 슬럼프를 예방하는\n정기 멘탈 케어 세션을 진행합니다.' },
  { icon: 'Home', title: '스터디 및 라운지 무상 지원', description: '개별 학습 외에도 개방형 카페와\n휴게 공간을 자유롭게 이용 가능합니다.' }
]

export const streamContents: Record<StreamId, StreamContent> = {
  gongmuwon: {
    id: 'gongmuwon',
    name: '공무원',
    hero: {
      title: '공무원 단기합격의\n가장 확실한 길',
      subtitle: '국가직·지방직 맞춤형 관리와\n인강에 최적화된 압도적 열공공간',
      description: '노량진 커넥츠프랩 공단기의\n독한 관리 시스템을 그대로 이식했습니다.\n합격으로 증명하는 합격자의\n교시제 출결 통제를 직접 경험하세요.',
    },
    differentiation: {
      title: '왜 공무원 시험은\nSSC스파르타인가',
      items: [
        {
          title: '노량진 테스트\n완벽하게 이식',
          desc: '매일 오전 모의고사 진행 및\n전국 단위 성적 분석을 통해\n객관적인 현재 위치 파악이 가능합니다.',
        },
        {
          title: '압도적인\n순공 시간 확보',
          desc: '스마트폰 압수, 인터넷 통제,\n합격자 교시제로 하루 최소 10시간 이상의\n흐트러짐 없는 집중을 보장합니다.',
        },
        {
          title: '직렬별\n맞춤 멘토링',
          desc: '국가직, 지방직, 경찰/소방 등\n각 직렬별 특성에 맞는 수험 전략과\n멘탈 관리를 매니저가 직접 코칭합니다.',
        }
      ]
    },
    systems: [
      COMMON_SYSTEMS[0],
      COMMON_SYSTEMS[1],
      COMMON_SYSTEMS[2],
      { icon: 'MessageSquare', title: '1:1 면접 코칭 프로그램', description: '필기 합격부터 최종 실전 면접까지,\n전 과정을 코치진과 긴밀하게 준비합니다.' },
      COMMON_SYSTEMS[3],
      COMMON_SYSTEMS[4]
    ],
    faqs: [
      { q: '노량진 1타 강사진의\n콘텐츠를 그대로 이용하나요?', a: '네, SSC스파르타은 공단기·경단기·소단기의 공식 파트너입니다.\n노량진 본원과 동일한 주간/월간 테스트 및\n하프 모의고사 등 핵심 콘텐츠를 실시간으로 응시합니다.' },
      { q: '경찰·소방 직렬을 위한\n특별한 지원이 있나요?', a: '필기 합격은 물론, 이후 체력 학원 연계 및\n최종 면접 파이프라인을 구축하고 있습니다.\n합격 데이터를 기반으로 최종 합격 로드맵을 그려드립니다.' },
      { q: '이미 수강 중인 프리패스를\n그대로 이용해도 되나요?', a: '물론입니다. 기존 인강을 활용하시되,\n저희는 여러분의 진도율과 학습 시간표를 최적화합니다.\n혼자서는 놓치기 쉬운 복습 주기까지 철저히 관리합니다.' },
      { q: '공무원 전용 면접반은\n어떻게 운영되나요?', a: '필기 합격자 발표 직후, 즉시 집중 면접 준비에\n돌입할 수 있도록 커리큘럼이 구성됩니다.\n직렬별 특성에 맞춰 실전 감각을 극대화합니다.' },
    ],
    testimonials: [
      {
        name: '임O님',
        result: '농업직 경력채용 단기합격',
        quote: '한 달밖에 안 남아서\n너무 초조했었는데,\n코멘터 분과 상담 후\n멘탈을 제대로 잡았습니다.\n덕분에 매일 11시간씩\n무조건 채우고 합격했습니다.',
      },
      {
        name: '신O지님',
        result: '보건직 9급합격 (영어 95점)',
        quote: '직장 다니느라 시간이\n진짜 없었는데,\n매일 아침 단어시험과\n빡센 출결 관리 덕에\n오히려 전략적으로\n점수 따고 합격했어요.',
      },
      {
        name: '김O현님',
        result: '사회복지직 합격',
        quote: '면접에서 떨어지고 그냥\n포기하고 싶었거든요.\n정기 상담으로 겨우 위로받고,\n취약점 분석 노트를\n닳을 때까지 반복해서 본 게\n합격의 비결입니다.',
      },
      {
        name: '윤O님',
        result: '교육청 사서직 3개월 합격',
        quote: '매드클래스 들으면서\n과목별로 시간 나누고\n약한 유형 파고든 게\n신의 한 수였네요.\n짧고 굵게 집중하는 법을\n여기서 제대로 배웠습니다.',
      },
      {
        name: '이O정님',
        result: '출입국관리직 8개월 합격',
        quote: '시간표 딱딱 맞춰서\n앉고 일어서는 분위기가\n절어있으니까 딴짓할 틈이\n전혀 없더라고요.\n그냥 합격할 때까지\n공부에만 미친 듯 몰입하게 됩니다.',
      },
      {
        name: '김O민님',
        result: '경찰직 최종 합격',
        quote: '집이나 도서관에선\n10시간 못 채우겠던데,\n여기선 시스템이 억지로라도\n하게 만들더라고요.\n노량진 안 가고도\n원주에서 단기 합격했습니다.',
      }
    ]
  },
  suneung: {
    id: 'suneung',
    name: '수능(재수)',
    hero: {
      title: 'N수생의 합격 의지를\n완성하는 결전의 장',
      subtitle: '독학재수의 불안함을 압도적 관리로\n확신으로 바꾸는 유일한 공간',
      description: '단순한 자습실을 넘어선 초밀착 관리.\n수능 실전 바이오리듬에 맞춘 교시제로\n당신의 1년을 가장 밀도 있게 채웁니다.',
    },
    differentiation: {
      title: '독학 재수, 실패 없는\n성공 방정식을 제안합니다',
      items: [
        {
          title: '수능 맞춤형 교시제',
          desc: '수능 당일 시간표와 100% 동일한 교시제로\n오직 학습에만 온전히 침잠할 수 있는\n완벽한 실전 감각을 기릅니다.',
        },
        {
          title: '검증된 학습 콘텐츠',
          desc: '대성, 메가스터디 등 전국 모의고사 및\n최상위권 수험 자료를 완비하여\n노량진 본원과 동일한 혜택을 제공합니다.',
        },
        {
          title: '철저한 생활 관리',
          desc: '지각부터 무단결석, 스마트폰 소지까지\n단호한 규정 적용으로 흐트러지기 쉬운\n정신을 합격 직전까지 잡아줍니다.',
        }
      ]
    },
    faqs: [
      { q: '독학재수생을 위한\n성적 관리 테스트가 있나요?', a: '가장 중요한 핵심 3과목인\n국영수 테스트를 정기적으로 제공합니다.\n집중 학습을 통해 취약 과목을 보완하고\n실전 감각을 유지합니다.' },
      { q: '사설 모의고사 및\n외부 평가 시험 응시가 가능한가요?', a: '이감 모의고사 등\n메이저 자료 이용이 가능하며,\n매월 \'더프(대성 더 프리미엄)\'를 실시하여\n객관적으로 본인의 현재 위치를 파악합니다.' },
      { q: '학습 상담이나 멘토링은\n어떻게 이루어지나요?', a: '정기적인 상담을 통해 취약점을 분석하고\n주간 계획을 점검합니다.\n수험 생활 중 겪는 슬럼프 극복을 위한\n심리 케어도 병행합니다.' },
    ],
    systems: [
      COMMON_SYSTEMS[0],
      COMMON_SYSTEMS[1],
      COMMON_SYSTEMS[2],
      { icon: 'BookOpen', title: '교과별 질의응답 시스템', description: '모르는 문제는 바로바로 해결할 수 있도록\n명쾌한 질의응답 피드백을 지원합니다.' },
      COMMON_SYSTEMS[3],
      COMMON_SYSTEMS[4]
    ],
    testimonials: [
      {
        name: '전O제 님',
        result: '부산교대 정시 합격',
        quote: '혼자 재수할 때\n시간 관리가 막막했었는데,\n시스템으로 다 잡아주신\n덕분에 오직 공부에만\n전념할 수 있었습니다.\n결국 꿈에 그리던 합격을 했네요.',
      },
      {
        name: '김O민 님',
        result: '연세대 정시 합격',
        quote: '독학재수는 나태함 잡는 게\n수험 생활의 전부인데,\n매일 시간 인증하고\n출결 통제받다 보니까\n억지로라도 책상에 앉게 됐고\n그게 기적을 만들었습니다.',
      },
      {
        name: '정O지 님',
        result: '경희대 정시 합격',
        quote: '필요 없는 강제 수업\n들을 필요 없이,\n제가 원하는 인강 스케줄에\n맞춰서 관리해 주니까\n효율이 극대화됐습니다.\n모의고사 분석도 큰 도움이 됐어요.',
      }
    ]
  },
  imyong: {
    id: 'imyong',
    name: '임용시험',
    hero: {
      title: '임용 합격의 마지막 관문\n절대 몰입 공간',
      subtitle: '초/중/고 임용 수험생을 위한\n친목 차단과 순공 시간 극대화',
      description: '방대한 암기량 앞에 흔들리는 마음을 다잡아 드립니다.\n조용한 고요함 속에 울려 퍼지는\n암기의 숨소리만 허용되는 공간입니다.',
    },
    differentiation: {
      title: '임용 준비생이\n스파르타를 선택하는 이유',
      items: [
        {
          title: '철저한 친목/대화 금지',
          desc: '임용 전문 스터디 매칭은 지원하되,\n원내 개인 간 사적 대화는 엄격히 금지하여\n오직 공부에만 에너지를 쓰게 합니다.',
        },
        {
          title: '방대한 서적 수납 시스템',
          desc: '각론서 등 두꺼운 책들을 마음껏 펼칠 수 있는\n넓은 책상과 보관함을 지원합니다.',
        },
        {
          title: '2차 면접/실연 지원',
          desc: '1차 필기 합격 후, 원내 스터디룸에서\n심층 면접 및 수업 시연을 연습할 수 있도록\n공간을 개방합니다.',
        }
      ]
    },
    faqs: [
      { q: '교육학 스터디를\n학원에서도 지원해 주시나요?', a: '네, 인원 충족 시 교육학 스터디 매칭 및\n장소를 지원합니다.\n혼자 하기 힘든 인풋/아웃풋 과정을\n동료들과 함께 효율적으로 소화할 수 있습니다.' },
      { q: '임용 시험에 특화된 상담을\n받을 수 있을까요?', a: '축적된 임용 합격 데이터를\n기반으로 상담을 진행합니다.\n전공별 특성에 맞는 공부법과\n시기별 전략을 제시해 드립니다.' },
    ],
    systems: [
      COMMON_SYSTEMS[0],
      COMMON_SYSTEMS[1],
      COMMON_SYSTEMS[2],
      { icon: 'Target', title: '전공별 스터디 매칭', description: '원할 경우 같은 전공 수험생들과\n조용한 방향 공유 스터디를 연결해 드립니다.' },
      COMMON_SYSTEMS[3],
      COMMON_SYSTEMS[4]
    ],
    testimonials: [
      {
        name: '정OO님',
        result: '유아임용 3수종결 합격',
        quote: '친목질 생기는 게 싫었는데,\n아예 대화를 금지시켜버리니까\n속이 너무 편했어요.\n끝까지 흔들림 없이\n집중해서 합격할 수 있었습니다.',
      },
      {
        name: '박O주님',
        result: '중등영어 임용 합격',
        quote: '1점 차 소수점으로\n떨어졌을 때 정말 힘들었지만,\n멘탈 케어와 실전 모의고사\n시스템 덕분에 다시 일어섰고\n결국 최종 합격의\n기쁨을 누리게 되었습니다.',
      },
      {
        name: '최OO님',
        result: '중등지리 초단기 합격',
        quote: '혼자 계획 짤 때\n머리 아플 일 하나 없이,\n학원에서 짜준 스케줄대로\n단순하게 공부만 했습니다.\n그게 단기 합격의\n가장 빠른 지름길이었어요.',
      },
      {
        name: '배O서님',
        result: '초등특수 임용 최종 합격',
        quote: '임용은 각론서 두께가\n장난이 아니잖아요.\n책상이 정말 넓어서\n책 여러 권 펼쳐두고도\n공간이 남는 게\n학습 효율에 큰 도움이 됐습니다.',
      },
      {
        name: '이O진님',
        result: '전문상담교사 합격',
        quote: '같은 전공 준비하는\n원생분들과 함께 앉아\n서로 소리 없는 자극을\n주고받았던 게 컸던 것 같아요.\n함께 있었기에\n끝까지 완주했습니다.',
      },
      {
        name: '강O성님',
        result: '중등체육 임용 합격',
        quote: '실기 준비 때문에\n공부 시간이 항상 부족했는데,\n교시제에 저를 던져넣으니까\n버리는 시간 없이\n밀도 있게 이론 정리를\n끝낼 수 있었습니다.',
      }
    ]
  },
  professional: {
    id: 'professional',
    name: '전문자격사',
    hero: {
      title: '평범함을 거부하는\n자격사 시험의 요새',
      subtitle: '세무사·노무사·CPA 준비생을 위한\n성인 전용 프리미엄 관리반',
      description: '나태해지기 쉬운 성인 수험생을 위한\n강력한 강제 교시제 시스템.\n합격이라는 결과만을 위해 설계된\n철저한 전문가용 관리 시스템입니다.',
    },
    differentiation: {
      title: '전문자격 시험을 위한\n빈틈없는 지원',
      items: [
        {
          title: '정숙함 이상의\n성숙한 분위기',
          desc: '자격증 취득이라는 목표를 가진\n성인 학습자들이 주축이 되어\n상부 시너지를 내는 최상위 환경입니다.',
        },
        {
          title: '효율 극대화\n교시제',
          desc: '짧은 시간의 몰입도를 최상으로 올리는\n스파르타식 시간표로 과목별\n암기 시간 단축을 돕습니다.',
        },
        {
          title: '피로를 잊는\n베이스캠프',
          desc: '장시간 착석에 최적화된 메쉬 의자와\n간접 조명으로 수험생의\n만성 피로와 거북목을 방지합니다.',
        }
      ]
    },
    faqs: [
      { q: '계산기 사용이나\n노트북 타이핑 작업은 어디서 하나요?', a: '세무사, 회계사 수험생을 위해\n소음이 허용되는 \'라운지\' 공간을\n별도로 운영합니다.\n열람실(무소음존) 밖에서 자유롭게 학습 가능합니다.' },
      { q: '학습 플래너 관리를\n도와주시나요?', a: '네, 방대한 공부 분량을\n체계적으로 소화하도록\n코멘터가 주기적으로 플래너를 점검합니다.\n실행력을 높이는 것이 관리의 핵심입니다.' },
    ],
    systems: [
      COMMON_SYSTEMS[0],
      COMMON_SYSTEMS[1],
      COMMON_SYSTEMS[2],
      { icon: 'Heart', title: '장기 수험 대비 멘탈 케어', description: '긴 레이스에 지치지 않도록\n개인별 맞춤형 슬럼프 방지 상담을 제공합니다.' },
      COMMON_SYSTEMS[4],
      { icon: 'ClipboardList', title: 'CPA/CTA 모의고사 연계', description: '실전 모의고사 일정이 있을 경우,\n원내에서 동일한 긴장감으로 응시할 수 있도록 조율합니다.' }
    ],
    testimonials: [
      {
        name: '이O영님',
        result: '공인노무사 1차 단기 합격',
        quote: '피곤해 미칠 것 같을 때도\n학원 오면 폰부터 내고\n교시제에 던져지니까\n어떻게든 저를 책상에\n묶어두게 되더라고요.\n그 강제성이 합격을 만들었습니다.',
      },
      {
        name: '박O민님',
        result: '세무사(CTA) 최종 합격',
        quote: '세법 외우다 짜증 날 때\n코멘터 분의 밀착 상담이\n진짜 큰 힘이 됐습니다.\n라운지에서 계산기\n마음껏 두드릴 수 있었던 것도\n정말 만족스러운 환경이었어요.',
      },
      {
        name: '유O준님',
        result: '공인회계사(CPA) 합격',
        quote: '나이 먹고 시작해서\n포기하고 싶을 때가 많았는데,\n벌점 규정 지키려고\n아등바등 나오다 보니까\n수험 기간 1년은\n거뜬히 줄인 것 같습니다.',
      },
      {
        name: '박O승님',
        result: '감정평가사 1차 패스',
        quote: '다들 숨소리도 안 내고\n공부하는 성인 전용 존이라\n제대로 자극받았습니다.\n옆자리 분 공부하는 것만\n봐도 나태해질 수가 없어요.',
      },
      {
        name: '문서O님',
        result: '법무사 1차 합격',
        quote: '하루 종일 앉아 있는데\n허리가 하나도 안 아파서\n의자가 정말 좋다는 걸\n실감하며 공부했습니다.\n조명 밝기도 조절 가능해서\n눈이 편안했어요.',
      },
      {
        name: '이O현님',
        result: '관세사 최종 합격',
        quote: '몇 년씩 준비하면서\n슬럼프 올 때마다\n독설과 격려를 번갈아 가며\n해주신 매니저님 덕분에\n결국 합격증을\n손에 쥘 수 있었습니다.',
      }
    ]
  },
  job: {
    id: 'job',
    name: '취업준비',
    hero: {
      title: '공백기 깨고 합격,\n효과적인 초단기 완성',
      subtitle: '가장 치열하게 준비하는\n취업준비생을 위한 맞춤형 베이스캠프',
      description: '단기 자격증 취득부터 꾸준한 NCS 대비까지.\n독서실에서 버티는 외로운 싸움 대신\n스파르타의 체계적인 관리를 선택하세요.',
    },
    differentiation: {
      title: '취업 준비생 전용\n최후의 몰입존',
      items: [
        {
          title: '비실무 자격시험\n특화',
          desc: '번거로운 준비보다는 단기 자격 취득과\nNCS / 인적성 등 필기 위주의\n빠른 스펙업에 몰입할 수 있습니다.',
        },
        {
          title: '자기소개서 집중\n존',
          desc: '소음 방지 타이핑 존(라운지)이 마련되어 있어\n눈치 보지 않고 자소서 수정 및\n서류 접수에 완전한 집중이 가능합니다.',
        },
        {
          title: '취업 스터디\n연계',
          desc: '인원 충족 시 오프라인 스터디룸을 통하여\nNCS 리뷰나 면접 준비 스터디 결성을\n적극적으로 돕고 있습니다.',
        }
      ]
    },
    faqs: [
      { q: '화상 면접이나 AI 면접을 볼 수 있는\n프라이빗한 공간이 있나요?', a: '네, 독립된 프라이빗 스터디룸을 예약하여\n타인의 방해 없이 화상 면접을 치를 수 있습니다.\n최상급 면접 환경을 보장합니다.' },
    ],
    systems: [
      COMMON_SYSTEMS[0],
      COMMON_SYSTEMS[1],
      COMMON_SYSTEMS[2],
      { icon: 'Target', title: '취업 지원 맞춤 스터디', description: '관련 인원 충족 시, 면접이나 NCS 정보 통과를 위한\n상부상조 스터디를 원내에서 매칭해 드립니다.' },
      COMMON_SYSTEMS[3],
      COMMON_SYSTEMS[4]
    ],
    testimonials: [
      {
        name: '신OO님',
        result: '국민건강보험공단 합격',
        quote: 'NCS 책상 넓은 게\n정말 중요하거든요.\n여긴 책상이 넓어서\n문제집 여러 권 펴놓고도\n방해 하나도 안 받고\n점수 쫙 올릴 수 있었습니다.',
      },
      {
        name: '임O나님',
        result: '한국전력공사 필기 통과',
        quote: '노트북 타이핑 소음\n눈치 안 봐도 되는\n전용 라운지가 있어서\n자소서 수정이나 서류 접수에\n최적화된 몰입 환경을\n누릴 수 있었습니다.',
      },
      {
        name: '강O우님',
        result: '코레일 필기 합격',
        quote: '취업 전용 스터디룸에서\n면접 연습하고 피드백\n주고받은 게 큰 도움 됐어요.\n혼자 할 때보다\n정보 교류도 훨씬 원활했습니다.',
      }
    ]
  }
}
