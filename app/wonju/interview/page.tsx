import React from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Users,
  Target,
  FileText,
  Phone,
  Rocket,
  Lightbulb,
  Laptop,
} from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { Footer } from '@/components/ssc/footer'
import { FAQSection } from '@/components/ssc/faq-section'
import { Testimonials } from '@/components/ssc/testimonials'
import { getInterviewMetadata } from '@/lib/seo-utils'

export const metadata = getInterviewMetadata('wonju')

// FAQ 데이터
const FAQ_LIST = [
  {
    question: '필기합격 발표 전에도 신청(사전등록)할 수 있나요?',
    answer: '네, 사전등록이 적극 권장됩니다! 필기합격 발표 이후에는 자기소개서 제출과 면접 대비 기간이 매우 짧기 때문에 합격 확실권에 있으신 분들은 미리 신청해 두시는 것이 유리합니다. 발표 직후 수강 신청이 몰려 선착순 마감되거나 희망하시는 1:1 코멘팅 시간 배정이 어려울 수 있습니다. (※ 발표 후 불합격 시 전액 환불됩니다.)',
  },
  {
    question: '외부 수강생도 등록할 수 있나요?',
    answer: '네, 가능합니다. SSC스파르타 기존 원생이 아니더라도 강원 공무원 면접을 준비하는 수험생이라면 누구나 등록하여 동일한 혜택(사물함 선착순 제공 등)을 누리실 수 있습니다. 다만 면접반 단기 수강생에게는 별도의 자습 공간(독서실 좌석)은 제공되지 않는 점 양해 부탁드립니다.',
  },
  {
    question: '1:1 개인코멘팅은 어떻게 진행되나요?',
    answer: '1:1 추가반을 신청하시면 SSC스파르타의 1:1 개별 밀착 코멘팅이 50분간 제공됩니다. 작성하신 자기소개서와 지원동기 첨삭뿐만 아니라 실제 말할 때의 속도, 시선 처리, 태도, 나쁜 습관 교정까지 개인별 맞춤 피드백을 전달해 드립니다. (※ 지난 국가직 및 경채 면접반의 경우 수강생의 90%가 1:1 개인코멘팅 포함반을 신청해 면접을 대비했습니다.)',
  },
  {
    question: '사물함을 이용할 수 있나요?',
    answer: '사물함은 센터별 잔여 현황에 따라 제공 가능 여부가 달라집니다. 신청서 작성 시 필요 여부를 기재해주시면, 잔여 수량이 있는 센터에 한해 선착순으로 무료로 지원해 드립니다. (※ 면접반 단기 수강생 대상 자율학습 좌석 및 자습 공간은 별도로 제공되지 않는 점 양해 부탁드립니다.)',
  },
  {
    question: '수업에 결석하면 보강이 가능한가요?',
    answer: '면접반은 단기 집중 과정으로 운영되어 별도의 개인 보강 수업은 진행되지 않습니다. 다만 결석 시 해당 차시의 수업 자료와 상세 피드백 과제를 완벽히 전달해 드려 학습에 공백이 없도록 철저히 안내해 드립니다.',
  },
  {
    question: '기술직이나 특수직렬 수강생도 도움을 받을 수 있나요?',
    answer: '네, 물론입니다. 매년 기계, 토목, 건축 등 특수 및 기술직렬 최종 합격자를 다수 배출해 온 데이터가 구축되어 있어 신뢰할 수 있습니다. 면접 공통 주제 외에도 특수직렬 맞춤형 기출 질문 및 답변 팁이 정리된 전문 자료를 제공합니다. 전공 및 직렬 특화 질문이 핵심인 만큼, 1:1 개인코멘팅 밀착반을 수강하시면 합격 확률을 극대화하실 수 있습니다.',
  },
]

const INTERVIEW_TESTIMONIALS = [
  {
    name: '김O우 수험생',
    result: '지방직 일반행정직 최종 합격',
    quote: '필기 합격 발표 후에 면접 준비 기간이 생각보다 너무 짧아서 눈앞이 캄캄했습니다. 하지만 SSC스파르타 면접반에서 제공해 준 기출 핵심 분석집과 답변 구조화 공식 덕분에 어떤 예상외 질문이 들어와도 당황하지 않고 차분히 답변 뼈대를 구성해 낼 수 있었습니다. 1:1 개인코멘팅 때 원장님께서 제 시선 처리나 말끝을 흐리는 세세한 습관까지 날카롭게 짚어 교정해 주신 덕분에 실전 면접장에서 최고의 태도로 임할 수 있었습니다.',
  },
  {
    name: '이O정 수험생',
    result: '지방직 토목직 최종 합격',
    quote: '전공 과목 면접에 대한 부담이 정말 컸는데, SSC스파르타에 축적되어 있던 기계·토목·건축 등 기술직렬 합격자 데이터와 전공 질문 요약집이 구세주였습니다. 면접 공통 주제를 넘어 제 전공 지식을 자연스럽게 공직 가치와 엮어 표현하는 1:1 밀착 코멘팅이 결정적이었습니다. 꼬리 질문이 쏟아졌을 때도 코멘팅 때 배운 방어 요령을 적용해 무사히 면접을 마칠 수 있었습니다.',
  },
  {
    name: '박O현 수험생',
    result: '강원 교육행정직 최종 합격',
    quote: '교육행정 면접은 지자체 도정 현안뿐만 아니라 교육청 고유의 핵심 정책을 꿰뚫고 있어야 해서 막막했습니다. 학원에서 챙겨준 강원 교육정책 핵심 요약집 덕분에 정책 방향을 완벽히 이해할 수 있었습니다. 특히 매주 금요일 스터디원들과 실전처럼 조를 짜서 모의면접을 하고 상호 피드백 시트를 교환하며 반복 연습했던 것이 말문이 트이는 데 엄청난 도움이 되었습니다.',
  }
]

export default function WonjuInterviewPage() {
  const googleFormUrl = 'https://forms.gle/hJyRHB9A9afAjHbB7'

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Course',
      'name': '2026 지방직·교육행정직 공무원 면접반 (원주캠퍼스)',
      'description': '원주 공무원 면접학원 SSC스파르타. 강원 지방직·교육행정직 필기합격자 대상 면접 집중 대비반. 12시간 정규수업 및 1:1 코멘팅 제공.',
      'provider': {
        '@type': 'EducationalOrganization',
        'name': 'SSC스파르타 원주캠퍼스',
        'sameAs': 'https://www.sscsparta.com/wonju',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'School',
      '@id': 'https://www.sscsparta.com/wonju/interview#school',
      'name': 'SSC스파르타 원주캠퍼스 (원주 공무원 면접학원)',
      'telephone': '0507-1424-7999',
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': '치악로 1793 농협건물 4층',
        'addressLocality': '원주시',
        'addressRegion': '강원특별자치도',
        'addressCountry': 'KR',
      },
    }
  ]

  return (
    <main className="overflow-x-hidden bg-[#F8F9FA] text-[#1D1D1F] min-h-screen pb-24 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      {/* 뒤로가기 & 서브 네비게이션 */}
      <div className="pt-20 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/wonju"
            className="inline-flex items-center gap-1 text-[#86868B] hover:text-[#1D1D1F] text-sm transition-colors"
          >
            <ChevronLeft size={16} />
            원주캠퍼스 홈
          </Link>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#F5F5F7] text-[#86868B]">
            강원 지방직·교육행정직 대비
          </span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-white py-16 md:py-24 border-b border-[#E5E7EB]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#007AFF] text-xs font-semibold mb-6">
            <Sparkles size={12} />
            2026 최종 합격을 향한 마지막 단 하나의 선택
          </div>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-[#1D1D1F] leading-tight mb-6">
            원주 공무원 면접학원의 절대 기준<br />
            <span className="text-[#007AFF]">SSC스파르타 원주 면접반</span>
          </h1>
          <p className="text-base md:text-lg text-[#86868B] max-w-2xl mx-auto mb-10 leading-relaxed">
            강원 및 충북 전역, 인근 경기도 지역까지 아우르는 면접 준비생 대상.<br />
            SSC스파르타의 체계적인 면접 대비 시스템으로 원주캠퍼스에서 본수업과 1:1 피드백을 밀착 진행합니다.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={googleFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-xl bg-[#007AFF] text-white font-semibold hover:bg-blue-700 hover:scale-102 active:scale-98 transition-all shadow-md shadow-blue-500/10 text-center"
            >
              <Rocket size={16} />
              면접반 사전신청 바로가기
            </a>
            <a
              href="tel:0507-1424-7999"
              className="w-full sm:w-auto px-6 py-4 rounded-xl border border-[#E5E7EB] bg-white text-[#1D1D1F] font-semibold hover:bg-[#F5F5F7] transition-all text-center flex items-center justify-center gap-2"
            >
              <Phone size={16} />
              전화 상담 문의
            </a>
          </div>
        </div>
      </section>

      {/* 핵심 특징 3개 */}
      <section className="py-16 max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-2xl border border-[#E5E7EB] shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-[#007AFF] mb-6">
              <Target size={24} />
            </div>
            <h3 className="text-lg font-semibold mb-2">SSC스파르타 면접 시스템</h3>
            <p className="text-[#86868B] text-sm leading-relaxed">
              수많은 합격생을 배출한 SSC스파르타만의 명쾌한 면접 가이드라인. 추상적인 답변 대신 면접관이 채점표에 즉각 체크하는 직관적인 모범 답변 구조를 완성합니다.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-[#E5E7EB] shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-[#34C759] mb-6">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-semibold mb-2">체계적인 금요 자율스터디</h3>
            <p className="text-[#86868B] text-sm leading-relaxed">
              매주 금요일 오전 원주캠퍼스에서 진행되는 실전 자율스터디. 3~5명씩 조를 편성하고 면접관과 수험생 역할을 상호 교대하며 말문이 트이도록 무한 훈련합니다.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-[#E5E7EB] shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-[#FF9500] mb-6">
              <BookOpen size={24} />
            </div>
            <h3 className="text-lg font-semibold mb-2">강원·충북·경기 지역 특화 분석</h3>
            <p className="text-[#86868B] text-sm leading-relaxed">
              강원 및 충북 전역, 경기도까지 아우르는 지자체별 정책·현안 완벽 분석. 행정직뿐만 아니라 기계, 토목, 건축 등 기술직 및 특수직렬 맞춤 예상 질문과 합격자 배출 데이터를 바탕으로 면접에 특화된 대비를 제공합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 수강 과정 및 가격 안내 */}
      <section className="py-12 bg-white border-y border-[#E5E7EB]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">수강 과정 & 등록 수강료</h2>
            <p className="text-sm md:text-base text-[#86868B]">수강생의 준비 수준과 필요에 맞춰 스마트한 코스를 제안합니다.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 기본반 */}
            <div className="border border-[#E5E7EB] rounded-2xl p-8 relative flex flex-col justify-between bg-[#F8F9FA]">
              <div>
                <h3 className="text-xl font-semibold mb-2">면접 기본 과정</h3>
                <p className="text-[#86868B] text-sm mb-6">면접 본수업과 체계적인 조별 스터디로 답변 뼈대를 완성합니다.</p>
                <div className="text-3xl font-semibold text-[#1D1D1F] mb-6">
                  38만 원
                </div>
                <ul className="space-y-3.5 text-sm text-[#515154] mb-8">
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>SSC스파르타 정규 수업 4회 (총 12시간)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>매주 금요일 오전 자율스터디 & 피드백 시트 제공</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>원주/강원도 지자체 지역 현안 핵심 요약집</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>원주캠퍼스 사물함 제공 (잔여 수량 있을 시 선착순)</span>
                  </li>
                </ul>
              </div>
              <a
                href={googleFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3.5 rounded-xl border border-[#007AFF] text-[#007AFF] font-semibold text-center hover:bg-blue-50 transition-colors"
              >
                기본 과정 신청하기
              </a>
            </div>

            {/* 1:1 추가반 */}
            <div className="border-2 border-[#007AFF] rounded-2xl p-8 relative flex flex-col justify-between bg-white shadow-lg shadow-blue-500/5">
              <div className="absolute top-0 right-8 -translate-y-1/2 bg-[#007AFF] text-white px-3.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                <Sparkles size={12} />
                추천! 수강생 90% 선택
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold">1:1 개인코멘팅 밀착 과정</h3>
                </div>
                <p className="text-[#86868B] text-sm mb-6">자소서부터 실전 시뮬레이션까지, 1:1 과외식 피드백으로 완성도를 올립니다.</p>
                <div className="text-3xl font-semibold text-[#007AFF] mb-6">
                  44만 원
                </div>
                <div className="flex items-start gap-2 p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-[#007AFF] leading-relaxed mb-6">
                  <Lightbulb size={14} className="shrink-0 mt-0.5" />
                  <span><b>수강생 선호도:</b> 지난 국가직 및 경채 면접반의 경우 전체 수강생의 90% 이상이 본 1:1 추가반을 선택해 면접을 탄탄히 대비했습니다.</span>
                </div>
                <ul className="space-y-3.5 text-sm text-[#515154] mb-8">
                  <li className="flex items-start gap-2 font-semibold text-[#1D1D1F]">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>[핵심] 1:1 집중 개인코멘팅 1회 (50분) 포함</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>SSC스파르타 정규 수업 4회 (총 12시간)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>매주 금요일 오전 자율스터디 & 피드백 시트 제공</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>자기소개서·지원동기 개별 서면 첨삭</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span>원주캠퍼스 사물함 제공 (잔여 수량 있을 시 선착순)</span>
                  </li>
                </ul>
              </div>
              <a
                href={googleFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3.5 rounded-xl bg-[#007AFF] text-white font-semibold text-center hover:bg-blue-700 hover:scale-101 active:scale-99 transition-all shadow-md shadow-blue-500/10"
              >
                1:1 밀착 과정 신청하기
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 체계적인 4회 완결 커리큘럼 */}
      <section className="py-16 max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <span className="text-xs font-semibold text-[#007AFF] uppercase tracking-wider">Curriculum</span>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2 mb-3">4회 완성 합격 로드맵</h2>
          <p className="text-sm md:text-base text-[#86868B]">수강생들이 실제로 말할 수 있도록 돕는 실질적 훈련 커리큘럼입니다.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-[#E5E7EB] flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#007AFF] font-semibold text-sm flex items-center justify-center shrink-0">
              1회
            </div>
            <div>
              <h4 className="font-semibold text-[#1D1D1F] mb-1">자기소개서 및 지원동기 작성법</h4>
              <p className="text-[#86868B] text-sm leading-relaxed mb-2">
                나를 가장 선명하게 어필하는 핵심 키워드 선별 및 자소서 작성법. 면접관의 호기심을 유발하는 1분 스피치 구성 요령.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded bg-[#F5F5F7] text-[#86868B]">
                <BookOpen size={13} />
                교재 학습 + 사전과제 배포
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-[#E5E7EB] flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#007AFF] font-semibold text-sm flex items-center justify-center shrink-0">
              2회
            </div>
            <div>
              <h4 className="font-semibold text-[#1D1D1F] mb-1">공직가치관 및 상황제시형 질문 대응</h4>
              <p className="text-[#86868B] text-sm leading-relaxed mb-2">
                민주성, 공정성, 청렴성 등 공직 가치 이해와 실제 경험 매핑. 업무 중 발생할 수 있는 딜레마(상사와의 갈등, 악성 민원 등) 논리적 해결 프로세스 제시.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded bg-[#F5F5F7] text-[#86868B]">
                <Laptop size={13} />
                실강 + 5단 답변 템플릿
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-[#E5E7EB] flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#007AFF] font-semibold text-sm flex items-center justify-center shrink-0">
              3회
            </div>
            <div>
              <h4 className="font-semibold text-[#1D1D1F] mb-1">지자체 지역현안 및 직렬별 기출 분석 (강원·충북·경기 특화)</h4>
              <p className="text-[#86868B] text-sm leading-relaxed mb-2">
                강원·충북·경기 지역 핵심 도정 및 지자체별 역점 사업 완벽 요약. 일반 행정직 및 기계, 토목, 건축 등 기술직/특수직렬 기출 및 전공 질문 완벽 대비.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded bg-[#F5F5F7] text-[#86868B]">
                <BookOpen size={13} />
                지자체 현안 특별 자료집
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-[#E5E7EB] flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#007AFF] font-semibold text-sm flex items-center justify-center shrink-0">
              4회
            </div>
            <div>
              <h4 className="font-semibold text-[#1D1D1F] mb-1">실전 밀착 모의면접 및 모니터링</h4>
              <p className="text-[#86868B] text-sm leading-relaxed mb-2">
                실전 면접장과 동일한 분위기 속에서 복장, 시선, 말투, 제스처 등 다차원 피드백 진행. 개별 약점 분석 및 최종 보완 가이드 제공.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded bg-emerald-50 text-[#34C759]">
                <Target size={13} />
                1:1 프리미엄 코멘팅 (선택 시)
              </span>
            </div>
          </div>

          <div className="bg-[#F5F5F7] p-6 rounded-xl border border-[#E5E7EB] flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#34C759] font-semibold text-sm flex items-center justify-center shrink-0">
              스터디
            </div>
            <div>
              <h4 className="font-semibold text-[#1D1D1F] mb-1">금요 면접 자율스터디 (오전 09:30~12:30)</h4>
              <p className="text-[#86868B] text-sm leading-relaxed">
                SSC스파르타가 제공하는 면접 스터디 커리큘럼에 맞춰 센터 매니저가 스터디 조를 편성합니다. 서로 면접관과 수험생이 되어 자소서 피드백, 모의 문답을 주 1회씩 무한 훈련합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 원주센터 전체 일정 타임라인 */}
      <section className="py-16 bg-white border-y border-[#E5E7EB]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">원주캠퍼스 면접반 전체 일정</h2>
            <p className="text-sm md:text-base text-[#86868B]">필기합격 발표부터 모의면접까지, 일정을 꼭 미리 체크해두세요.</p>
          </div>

          {/* 일정 표 */}
          <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-[#F5F5F7] text-xs font-semibold text-[#86868B] uppercase tracking-wider border-b border-[#E5E7EB]">
                  <th className="py-4 px-6">일자</th>
                  <th className="py-4 px-6">과정/일정</th>
                  <th className="py-4 px-6">진행 시간</th>
                  <th className="py-4 px-6">학생 확인 및 조치 사항</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#1D1D1F]">
                <tr>
                  <td className="py-4 px-6 font-semibold">7/9(목)</td>
                  <td className="py-4 px-6">강원 일반 지방직 공채 필기 발표</td>
                  <td className="py-4 px-6">-</td>
                  <td className="py-4 px-6 text-[#007AFF] font-semibold">필기 합격 확인 즉시 면접반 신청 및 센터 상담</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-semibold">7/10(금)</td>
                  <td className="py-4 px-6">면접 전용 플랫폼 가입</td>
                  <td className="py-4 px-6">-</td>
                  <td className="py-4 px-6">자체 면접 플랫폼 가입 및 자기소개서 사전과제 작성 시작</td>
                </tr>
                <tr className="bg-blue-50/20">
                  <td className="py-4 px-6 font-semibold text-[#007AFF]">7/13(월)</td>
                  <td className="py-4 px-6 font-semibold">원주 공채 1차시 본수업</td>
                  <td className="py-4 px-6 text-[#007AFF] font-semibold">오전 09:30~12:30</td>
                  <td className="py-4 px-6">자기소개서 및 1분 자기소개 작성 뼈대 빌드업 (실강)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-semibold">7/15(수)</td>
                  <td className="py-4 px-6">강원교육청 교육행정 필기 발표</td>
                  <td className="py-4 px-6">-</td>
                  <td className="py-4 px-6">강원 교행 합격생 면접반 긴급 모집 및 과제 배포</td>
                </tr>
                <tr className="bg-blue-50/20">
                  <td className="py-4 px-6 font-semibold text-[#007AFF]">7/17(금)</td>
                  <td className="py-4 px-6">공채 자율스터디 / 교행 1차시</td>
                  <td className="py-4 px-6">
                    오전 09:30~12:30 (스터디)<br />
                    오후 14:00~17:00 (교행 1차시)
                  </td>
                  <td className="py-4 px-6">
                    <span className="block text-xs font-semibold text-[#FF9500]">★ 강원 교육행정 수강생 1차시 통합수업 진행 (원주)</span>
                    공채 수강생은 오전 자율스터디 참여
                  </td>
                </tr>
                <tr className="bg-blue-50/20">
                  <td className="py-4 px-6 font-semibold text-[#007AFF]">7/20(월)</td>
                  <td className="py-4 px-6 font-semibold">원주 통합반 2차시 본수업</td>
                  <td className="py-4 px-6 text-[#007AFF] font-semibold">오전 09:30~12:30</td>
                  <td className="py-4 px-6">공채 및 교육행정 통합 수업 (공직가치관/상황질문 답변 공식)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-semibold">7/24(금)</td>
                  <td className="py-4 px-6">원주 2차 자율스터디</td>
                  <td className="py-4 px-6">오전 09:30~12:30</td>
                  <td className="py-4 px-6">스터디원 교대 모의면접 피드백 훈련</td>
                </tr>
                <tr className="bg-blue-50/20">
                  <td className="py-4 px-6 font-semibold text-[#007AFF]">7/28(화)</td>
                  <td className="py-4 px-6 font-semibold">원주 통합반 3차시 본수업</td>
                  <td className="py-4 px-6 text-[#007AFF] font-semibold">오전 09:30~12:30</td>
                  <td className="py-4 px-6">지자체 현안 및 직렬별 예상 질문 분석</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-semibold">7/29(수)</td>
                  <td className="py-4 px-6 font-semibold text-emerald-600">원주 1:1 개인 코멘팅 진행</td>
                  <td className="py-4 px-6 text-emerald-600">개별 예약 타임</td>
                  <td className="py-4 px-6">1:1 추가반 신청자 개별 밀착 대면 코멘팅 (원장단 직접 첨삭)</td>
                </tr>
                <tr className="bg-blue-50/20">
                  <td className="py-4 px-6 font-semibold text-[#007AFF]">7/30(목)</td>
                  <td className="py-4 px-6 font-semibold">원주 통합반 4차시 본수업</td>
                  <td className="py-4 px-6 text-[#007AFF] font-semibold">오전 09:30~12:30</td>
                  <td className="py-4 px-6">실전 대면 모의면접 피드백 및 답변 최종 정교화</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-semibold">7/31(금)</td>
                  <td className="py-4 px-6">원주 최종 자율스터디</td>
                  <td className="py-4 px-6">오전 09:30~12:30</td>
                  <td className="py-4 px-6">실전 최종 점검 및 모의 면접 교대 진행</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 강원 교행 춘천 수강 희망자 특이사항 경고 */}
          <div className="mt-6 p-5 rounded-2xl bg-amber-50/60 border border-amber-100 flex items-start gap-3">
            <AlertTriangle size={18} className="text-[#FF9500] shrink-0 mt-0.5" />
            <div className="text-xs md:text-sm text-[#FF9500] leading-relaxed">
              <span className="font-semibold">강원 교육행정직 춘천 수강생 안내사항:</span><br />
              교육행정 1차시 수업(7/17 금 오후)은 원주캠퍼스 통합 진행이 기본입니다. 단, <b>필기합격 발표(7/15) 전 미리 사전등록을 완료한 춘천 지역 수강생에 한하여</b> 1차시 수업을 원주 이동 없이 춘천에서 수강할 수 있도록 특별 편성합니다. 발표(7/15) 이후 등록 시에는 1차시 수강을 위해 원주캠퍼스로 이동하셔야 하므로, 춘천 수강을 원하시는 분들은 반드시 발표 전 사전등록을 마쳐주시기 바랍니다.
            </div>
          </div>
        </div>
      </section>

      {/* 합격생 후기 */}
      <Testimonials testimonials={INTERVIEW_TESTIMONIALS} campusName="원주" />

      {/* 자주 묻는 질문 FAQ */}
      <section className="py-16 max-w-3xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">자주 묻는 질문 (FAQ)</h2>
          <p className="text-sm md:text-base text-[#86868B]">수강생들이 면접반 등록 전에 가장 많이 질문하시는 내용들을 요약했습니다.</p>
        </div>

        <FAQSection faqList={FAQ_LIST} />
      </section>

      {/* CTA Banner */}
      <section className="py-16 bg-[#1D1D1F] text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-4">
            단 12시간, 최종합격으로 가는 마지막 관문
          </h2>
          <p className="text-white/70 text-sm md:text-base max-w-lg mx-auto mb-8">
            필기합격의 감동을 최종 합격의 기쁨으로 바꾸십시오. 치밀한 커리큘럼과 엄격한 관리로 함께하겠습니다.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={googleFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-xl bg-[#007AFF] text-white font-semibold hover:bg-blue-700 hover:scale-102 active:scale-98 transition-all text-center shadow-lg shadow-blue-500/20"
            >
              <Rocket size={16} />
              구글 신청서 작성하기
            </a>
            <a
              href="https://naver.me/xAFXrxdb"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-4 rounded-xl border border-white/20 bg-white/10 text-white font-semibold hover:bg-white/20 transition-all text-center"
            >
              <MapPin size={16} />
              원주캠퍼스 위치 보기
            </a>
          </div>
        </div>
      </section>

      <Footer />

      {/* 모바일 플로팅 CTA 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white border-t border-[#E5E7EB] md:hidden shadow-lg">
        <div className="grid grid-cols-2 gap-2">
          <a
            href="tel:0507-1424-7999"
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-50 text-[#FF9500] border border-amber-100 font-semibold text-xs"
          >
            <Phone size={14} />
            전화 상담 문의
          </a>
          <a
            href={googleFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#007AFF] text-white font-semibold text-xs shadow-md shadow-blue-500/10"
          >
            <Rocket size={14} />
            면접반 사전신청
          </a>
        </div>
      </div>
    </main>
  )
}
