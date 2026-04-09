/**
 * 내부시설 섹션
 * ─────────────────────────────────────────────────────────────────────────────
 * 역할: 자습실·라운지·사물함 등 내부시설 사진을 보여주는 섹션.
 *       합격후기(Testimonials) 바로 다음에 위치.
 *       이미지 파일만 넣으면 자동으로 세로 배열로 표시됩니다.
 *
 * 📁 사진 넣는 위치:
 *   원주   → public/images/interior/wonju/
 *   춘천   → public/images/interior/chuncheon/
 *   충주   → public/images/interior/chungju/
 *
 * 📌 파일 명명 규칙 (순서가 중요한 경우):
 *   01_자습실.jpg, 02_스탠딩라운지.jpg, 03_사물함.jpg, 04_편의시설.jpg ...
 *   → 파일명 오름차순으로 위에서 아래로 표시됩니다.
 *
 * 📌 지원 형식: jpg, jpeg, png, webp, gif
 *
 * 📌 이미지가 한 장도 없으면 이 섹션 전체가 렌더링되지 않습니다.
 *    (navbar에서 '내부시설' 클릭 시 반응 없음 — 정상 동작)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs'
import path from 'path'
import Image from 'next/image'

interface Props {
  campus: string
}

export function InteriorFacilities({ campus }: Props) {
  // public/images/interior/{campus}/ 폴더에서 이미지 목록을 읽어옵니다
  const dir = path.join(process.cwd(), 'public', 'images', 'interior', campus)

  let images: string[] = []
  try {
    const files = fs.readdirSync(dir)
    images = files
      .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f)) // 이미지 파일만 필터
      .sort()                                                 // 파일명 오름차순 정렬
      .map((f) => `/images/interior/${campus}/${f}`)
  } catch {
    // 폴더가 없거나 비어있으면 섹션 숨김 (빌드 에러 방지)
  }

  // 이미지가 없으면 섹션 전체를 렌더링하지 않음
  if (images.length === 0) return null

  return (
    <section id="interior-facilities" className="bg-background py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-navy dark:text-foreground text-balance mb-3 -tracking-tight">
            내부시설
          </h2>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            공부가 유지될 수밖에 없는 구조
          </p>
        </div>

        {/* 이미지 목록: 세로 배열, 각 이미지 전체 너비 */}
        <div className="flex flex-col gap-4">
          {images.map((src, i) => (
            <div key={i} className="relative w-full rounded-[12px] overflow-hidden">
              <Image
                src={src}
                alt={`내부시설 ${i + 1}`}
                width={1200}
                height={800}
                className="w-full h-auto"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
