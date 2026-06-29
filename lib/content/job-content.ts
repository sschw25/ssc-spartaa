import type { StreamContent } from '../stream-content'
import { COMMON_SYSTEMS } from './common-systems'

export const jobContent: StreamContent = {
  id: 'job',
  name: '취업준비',
  hero: {
    title: '{{region}} 취업준비 베이스캠프\n공백기 깨고 초단기 합격 완성',
    subtitle: '가장 치열하게 준비하는\n취업준비생을 위한 맞춤형 베이스캠프',
    description: '단기 자격증 취득부터 꾸준한 NCS 대비까지.\n독서실에서 버티는 외로운 싸움 대신\n스파르타의 체계적인 관리를 선택하세요.',
  },
  worries: {
    title: '길어지는 공백기,\n취업준비생의 진짜 걱정',
    subtitle: '혼자 버티는 독서실 대신, 관리되는 베이스캠프.',
    items: [
      {
        icon: 'Briefcase',
        worry: '공백기가 길어지며\n생활리듬과 방향을 잃는다',
        worryDetail: '뚜렷한 일정이 없으면 기상·취침이 무너지고, NCS·인적성·자격증 사이에서 우선순위를 못 잡은 채 시간만 흘려보내기 쉽습니다.',
        solution: '교시제 베이스캠프 + 2중 출결',
        solutionDetail: '교시제로 하루를 고정 편성하고 2중 출결로 등하원을 관리해, 공백기에도 직장인 같은 규칙적 리듬을 강제합니다. 순공시간 집계로 NCS·자격 준비의 실제 학습량을 숫자로 확인합니다.',
      },
      {
        icon: 'PenTool',
        worry: '자소서·서류 작업에\n집중할 공간이 없다',
        worryDetail: '무소음 독서실에서는 노트북 타이핑 소음이 눈치 보이고, 카페는 산만합니다. 자소서 수정과 서류 접수는 몰입할 전용 공간이 필요합니다.',
        solution: '타이핑 허용 라운지(자소서 집중존)',
        solutionDetail: '소음이 허용되는 라운지를 별도로 운영해 눈치 보지 않고 자소서 수정·서류 접수에 완전히 몰입할 수 있습니다. 화상·AI 면접은 독립 스터디룸을 예약해 방해 없이 치를 수 있습니다.',
      },
      {
        icon: 'Users',
        worry: '정보가 부족하고\n혼자 준비하니 막막하다',
        worryDetail: 'NCS 출제 경향, 면접 정보는 혼자 모으기 어렵습니다. 고립된 채 준비하면 비효율적인 시행착오가 반복됩니다.',
        solution: '취업 스터디 매칭 + 면접 연습',
        solutionDetail: '인원 충족 시 오프라인 스터디룸에서 NCS 리뷰·면접 준비 스터디를 매칭합니다. 정보 교류와 모의 면접 피드백으로 혼자 할 때보다 준비 속도를 끌어올립니다.',
      },
    ],
  },
  management: {
    title: 'SSC스파르타\n취업준비 관리 시스템',
    subtitle: '독서실에 없는 강제력과 전용 공간을 더합니다.',
    features: [
      {
        icon: 'CheckSquare',
        title: '카드+태블릿 2중 출결관리',
        desc: '등하원 키오스크/QR과 교시별 체크로 공백기에도 규칙적인 등원 리듬을 강제합니다.',
        metric: '2중',
      },
      {
        icon: 'Timer',
        title: '순공시간 자동 집계',
        desc: 'NCS·인적성·자격 준비의 실제 집중 시간을 누적 집계해 진짜 학습량을 숫자로 봅니다.',
        metric: '순공',
      },
      {
        icon: 'Clock',
        title: '교시제 자습',
        desc: '하루를 교시 단위로 고정 편성해 직장인 같은 규칙적 리듬을 만듭니다.',
        metric: '교시제',
      },
      {
        icon: 'PenTool',
        title: '자소서 타이핑 라운지',
        desc: '소음 허용 라운지에서 눈치 없이 자소서 수정·서류 접수에 집중할 수 있습니다.',
        metric: '라운지',
      },
      {
        icon: 'Target',
        title: '취업 스터디 매칭',
        desc: '인원 충족 시 NCS·면접 스터디를 매칭해 정보 교류와 모의 피드백을 지원합니다.',
        metric: '스터디',
      },
      {
        icon: 'MessageSquare',
        title: '프라이빗 면접룸',
        desc: '독립 스터디룸을 예약해 화상·AI 면접을 타인의 방해 없이 치를 수 있습니다.',
        metric: '면접',
      },
    ],
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
