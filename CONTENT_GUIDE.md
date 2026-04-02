# SSC스파르타 콘텐츠 수정 가이드

센터별로 텍스트/연락처/이미지를 수정할 때 이 파일을 참고하세요.

---

## 1. 전화번호 · 카카오 · 네이버 톡톡 · 주소 · 운영시간

**수정 파일: `lib/campus-config.ts`**

모든 캠퍼스의 연락처 정보가 이 파일 하나에 모여 있습니다. 여기를 수정하면 전화 버튼(모바일 하단 바, CTA 배너, 캠퍼스 섹션)이 자동으로 바뀝니다.

```ts
// lib/campus-config.ts

wonju: {
  phone: '033-766-7999',        // 전화번호
  kakaoUrl: 'https://pf.kakao.com/...',   // 카카오 채널 링크
  naverTalkUrl: 'https://talk.naver.com/...',  // 네이버 톡톡 링크
  naverMapUrl: 'https://naver.me/...',     // 네이버 지도 링크
  address: '강원특별자치도 원주시 치악로 1793 농협건물 4층',  // 전체 주소
  addrShort: '치악로 1793 농협건물 4층',   // 푸터에 표시되는 짧은 주소
  hours: '평일 06:30 – 22:00 / 주말 07:00 – 22:00',  // 운영시간
},

chuncheon: {
  phone: '0507-1366-8881',
  // ... 위와 동일한 구조
},

chungju: {
  phone: '0507-1492-5574',
  // ... 위와 동일한 구조
},
```

---

## 2. 메인 히어로 슬라이더 텍스트 (센터별)

각 센터 페이지 파일의 상단에 있는 `slides` 배열을 수정하세요.

| 센터 | 파일 |
|------|------|
| 원주 | `app/wonju/page.tsx` → `wonjuSlides` 배열 |
| 춘천 | `app/chuncheon/page.tsx` → `chuncheonSlides` 배열 |
| 충주 | `app/chungju/page.tsx` → `chungju​Slides` 배열 |

각 슬라이드 항목:
```ts
{
  title: '슬라이드 제목\n줄바꿈은 \\n 사용',
  subtitle: '부제목',
  description: '설명 텍스트',
  ctaLabel: 'CTA 버튼 텍스트',
}
```

---

## 3. 이달의 프로그램 소개 문구

**파일: `app/{캠퍼스}/page.tsx`**

각 센터 페이지 내부 `id="monthly-program"` 섹션:
```tsx
<h2>이달의 프로그램</h2>
<p>매달 업데이트되는 원주 캠퍼스 합격 전략 프로그램</p>  // ← 이 텍스트 수정
```

---

## 4. 프로그램 섹션 (공무원/임용/전문자격/독학재수)

**파일: `components/ssc/programs.tsx`**

각 프로그램 카드의 제목, 설명, 블로그 링크 등을 수정할 수 있습니다.

---

## 5. FAQ

**파일: `components/ssc/faq.tsx`**

질문/답변 목록이 이 파일에 배열로 정의되어 있습니다.

---

## 6. 푸터 퀵링크

**파일: `components/ssc/footer.tsx`** → `quickLinks` 배열

---

## 7. 이미지 교체 방법

이미지는 파일을 교체하는 것만으로 적용됩니다. 코드 수정 불필요.

| 이미지 종류 | 폴더 경로 |
|------------|---------|
| 메인 히어로 슬라이드 배경 | `public/images/maincard/{캠퍼스}/` (01, 02, 03... 순서) |
| 내부시설 4-카드 | `public/images/facility/{캠퍼스}/` (01~04 순서) |
| 내부시설 갤러리 전체 | `public/images/interior/{캠퍼스}/` |
| 프로그램 섹션 이미지 | `public/images/programs/{캠퍼스}/` |
| 캠퍼스 대표 사진 | `public/images/campus-{캠퍼스}.jpg` |

> 캠퍼스 폴더명: `wonju` / `chuncheon` / `chungju`
>
> 예) 원주 시설 사진 교체 → `public/images/facility/wonju/01.jpg` 파일을 교체

---

## 8. 합격후기 더보기 링크 (센터별)

**파일: `app/{캠퍼스}/page.tsx`**

```tsx
<Testimonials reviewUrl="https://blog.naver.com/..." />  // ← URL 수정
```

---

## 9. CTA 배너 텍스트 (하단 상담 신청 섹션)

**파일: `components/ssc/cta-banner.tsx`**

"지금 상담 신청하면 1일 무료체험 가능합니다" 등의 문구를 수정할 수 있습니다.

---

## 10. SNS 링크 (인스타그램, 네이버 블로그, 카카오)

**파일: `components/ssc/footer.tsx`** → `href="https://instagram.com/..."` 등 수정
