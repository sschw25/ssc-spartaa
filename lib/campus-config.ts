/**
 * 센터별 설정 파일
 *
 * 전화번호, 주소, 운영시간, 카카오/네이버 링크 등
 * 캠퍼스 관련 정보를 모두 여기서 관리합니다.
 *
 * 수정 방법:
 * - 전화번호 변경 → 아래 phone 값 수정
 * - 카카오 채널 변경 → kakaoUrl 수정
 * - 네이버 톡톡 변경 → naverTalkUrl 수정
 * - 주소/운영시간 변경 → address, addrShort, hours 수정
 */

export const CAMPUS_CONFIG = {
  wonju: {
    name: '원주',
    phone: '033-766-7999',
    address: '강원특별자치도 원주시 치악로 1793 농협건물 4층',
    addrShort: '치악로 1793 농협건물 4층',
    hours: '평일 06:30 – 22:00 / 주말 07:00 – 22:00',
    naverMapUrl: 'https://naver.me/xAFXrxdb',
    kakaoUrl: 'https://pf.kakao.com/_example',
    naverTalkUrl: 'https://talk.naver.com/ct/w4zhf8',
    image: '/images/campus-wonju.jpg',
  },
  chuncheon: {
    name: '춘천',
    phone: '0507-1366-8881',
    address: '강원특별자치도 춘천시 퇴계로 249 5층',
    addrShort: '퇴계로 249 5층',
    hours: '평일 06:30 – 22:00 / 주말 07:00 – 22:00',
    naverMapUrl: 'https://naver.me/5RhgAeoi',
    kakaoUrl: 'https://pf.kakao.com/_example',
    naverTalkUrl: 'https://talk.naver.com/ct/w4kwt8?frm=mnmb&frm=nmb_detail#nafullscreen',
    image: '/images/campus-chuncheon.jpg',
  },
  chungju: {
    name: '충주',
    phone: '0507-1492-5574',
    address: '충청북도 충주시 계명대로 283',
    addrShort: '계명대로 283',
    hours: '평일 06:30 – 22:00 / 주말 07:00 – 22:00',
    naverMapUrl: 'https://naver.me/xmxZQakb',
    kakaoUrl: 'https://pf.kakao.com/_example',
    naverTalkUrl: 'https://talk.naver.com/ct/w40pkj?frm=mnmb&frm=nmb_detail#nafullscreen',
    image: '/images/campus-chungju.jpg',
  },
}

export type CampusKey = keyof typeof CAMPUS_CONFIG
