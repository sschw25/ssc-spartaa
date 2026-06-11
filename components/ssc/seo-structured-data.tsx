import { CAMPUS_CONFIG, CampusKey } from '@/lib/campus-config'
import { FAQItem, StreamId } from '@/lib/stream-content'

const SITE_URL = 'https://www.sscsparta.com'

const campusFaqs: FAQItem[] = [
  {
    q: 'SSC스파르타는 어떤 수험생을 위한 학습관인가요?',
    a: '공무원, 임용, 전문자격, 독학재수처럼 장시간 학습과 꾸준한 생활 관리가 필요한 수험생을 위한 시간 관리형 학습관입니다.',
  },
  {
    q: '학습 시간은 어떻게 관리하나요?',
    a: '정해진 교시제에 따라 학습하고 출결, 학습 시간, 스마트폰 사용과 생활 리듬을 함께 점검해 순공시간이 꾸준히 이어지도록 관리합니다.',
  },
  {
    q: '상담 후 시설을 확인할 수 있나요?',
    a: '네. 캠퍼스에 방문해 학습 공간과 운영 방식을 확인하고 현재 준비 중인 시험과 생활 패턴에 맞는 관리 방법을 상담받을 수 있습니다.',
  },
]

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

function getOrganization(campus: CampusKey, name: string, url: string, description: string) {
  const config = CAMPUS_CONFIG[campus]

  return {
    '@context': 'https://schema.org',
    '@type': ['EducationalOrganization', 'LocalBusiness'],
    '@id': `${url}#organization`,
    name,
    url,
    description,
    telephone: config.phone,
    image: `${SITE_URL}${config.image}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: config.addrShort,
      addressLocality: `${config.name}시`,
      addressCountry: 'KR',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '23:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday'],
        opens: '09:00',
        closes: '21:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Sunday'],
        opens: '09:00',
        closes: '18:00',
      },
    ],
    sameAs: [config.naverMapUrl],
  }
}

function getBreadcrumb(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

function getFaqPage(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q.replaceAll('\n', ' '),
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a.replaceAll('\n', ' '),
      },
    })),
  }
}

export function CampusStructuredData({
  campus,
  description,
}: {
  campus: CampusKey
  description: string
}) {
  const config = CAMPUS_CONFIG[campus]
  const url = `${SITE_URL}/${campus}`

  return (
    <>
      <JsonLd
        data={getOrganization(
          campus,
          `SSC스파르타 ${config.name}캠퍼스`,
          url,
          description,
        )}
      />
      <JsonLd
        data={getBreadcrumb([
          { name: 'SSC스파르타', url: SITE_URL },
          { name: `${config.name}캠퍼스`, url },
        ])}
      />
      <JsonLd data={getFaqPage(campusFaqs)} />
    </>
  )
}

export function StreamStructuredData({
  campus,
  stream,
  streamName,
  description,
  faqs,
}: {
  campus: CampusKey
  stream: StreamId
  streamName: string
  description: string
  faqs: FAQItem[]
}) {
  const config = CAMPUS_CONFIG[campus]
  const campusUrl = `${SITE_URL}/${campus}`
  const url = `${campusUrl}/${stream}`

  return (
    <>
      <JsonLd
        data={getOrganization(
          campus,
          `SSC스파르타 ${config.name} ${streamName}`,
          url,
          description,
        )}
      />
      <JsonLd
        data={getBreadcrumb([
          { name: 'SSC스파르타', url: SITE_URL },
          { name: `${config.name}캠퍼스`, url: campusUrl },
          { name: streamName, url },
        ])}
      />
      <JsonLd data={getFaqPage(faqs)} />
    </>
  )
}
