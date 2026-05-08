export type FacilityItem = {
  id: number
  icon: string
  image: string
  title: string
  description: string
}

export const defaultFacilities: FacilityItem[] = [
  {
    id: 1,
    icon: 'BookOpen',
    image: '/images/facility-study.jpg',
    title: '개별 지정석 자습실',
    description:
      '불필요한 자극을 최소화한 공간. 모든 좌석은 개별 지정석으로 운영되며, 백색소음과 공조시스템으로 장시간 집중 환경을 유지합니다.',
  },
  {
    id: 2,
    icon: 'Users',
    image: '/images/facility-lounge.jpg',
    title: '스탠딩 라운지',
    description:
      '졸음이 오거나 집중이 끊길 때 자리를 완전히 이탈하지 않고 서서 공부하며 흐름을 회복하는 공간입니다.',
  },
  {
    id: 3,
    icon: 'Box',
    image: '/images/facility-locker.jpg',
    title: '개인 사물함 · 신발장',
    description:
      '모든 좌석에 개인 사물함이 제공됩니다. 신발장도 개인별로 배정되어 쾌적한 환경을 유지합니다.',
  },
  {
    id: 4,
    icon: 'Coffee',
    image: '/images/facility-surroundings.jpg',
    title: '편의시설 (병원, 카페 등)',
    description:
      '공부의 리듬을 잃지 않으면서 에너지를 챙길 수 있는 주변환경',
  },
]
