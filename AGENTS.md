# AGENTS.md — SSC 스파르타 작업 지침

> Codex · Antigravity · Claude 등 모든 AI 코딩 도구 공용 규칙.
> 이 저장소를 수정하기 전에 반드시 읽고 따를 것.
>
> **디자인 언어: Apple iOS 26 — "Liquid Glass".**
> 모든 신규/수정 UI는 아래 원칙을 기준으로 한다. (앱 화면 + 마케팅 페이지 공통)

---

## 0. 한 줄 요약

> **콘텐츠가 주인공, 크롬은 유리.** 색은 장식이 아니라 의미(semantic). 형태는 동심원(concentric)으로.
> 의심되면 **불투명·중립·단순**이 기본값. 투명도는 가독성을 이기지 못한다.

---

## 1. Liquid Glass — 핵심 원칙 (iOS 26)

iOS 26은 크롬(내비게이션·컨트롤)을 **반투명 유리 재질**로 띄워 그 아래 콘텐츠가 비치게 한다.
깊이(depth)와 레이어로 위계를 만들고, 콘텐츠 자체는 선명하게 둔다.

1. **Deference to content (콘텐츠 우선).** 유리·이펙트는 콘텐츠를 위해 존재한다. 화면의 주인공은 데이터/글이지 유리가 아니다.
2. **유리는 "떠 있는 레이어"에만.** 내비바·탭바·툴바·시트·팝오버·FAB·스티키 헤더 → 유리. **본문 카드·표·KPI 숫자 → 불투명(또는 거의 불투명).**
3. **유리 위에 유리 금지.** Liquid Glass 레이어는 한 겹. 유리 시트 안의 카드는 솔리드로.
4. **깊이로 위계를 만든다.** 그림자/blur/레이어 순서로 "위에 떠 있음"을 표현. 색을 더 칠해서 위계를 만들지 말 것.
5. **재질에는 두 종류.** *Regular*(기본, 적응형 — 대부분 여기) / *Clear*(더 투명, 사진·영상 위 미디어 배경에서만).
6. **접근성이 재질을 이긴다.** Reduce Transparency / Increase Contrast / Reduce Motion이 켜지면 유리는 **불투명으로 폴백**한다 (§7 필수).

---

## 2. 재질 시스템 (Material) — 웹/Tailwind 변환

네이티브 머티리얼을 CSS `backdrop-filter` + 반투명 배경 + 얇은 하이라이트/보더로 구현한다.

| 티어 | 용도 | 라이트 레시피 | 다크 레시피 |
|---|---|---|---|
| **Glass / Thin** | 떠 있는 크롬(내비·탭·툴바·시트·FAB·스티키) | `bg-white/60 backdrop-blur-xl backdrop-saturate-150` + `border border-white/40` + 상단 1px 하이라이트 | `bg-zinc-900/55 backdrop-blur-xl` + `border-white/10` |
| **Surface (solid)** | 본문 카드·패널·표 컨테이너 | `bg-white` + `shadow-sm` + `border border-black/5` | `bg-zinc-900` + `border-white/8` |
| **Inset / Fill** | 칩·인풋·세그먼트·태그 배경 | `bg-black/[0.04]` (≈ `#F5F5F7`) | `bg-white/[0.06]` |
| **App background** | 앱 셸 루트(`min-h-screen`) | `#F8F9FA` (또는 `systemGroupedBackground` 토큰) | `#000` / `#0A0A0A` |

규칙:
- 유리에는 **항상 얇은 보더 또는 상단 하이라이트**를 줘서 "유리 가장자리"를 드러낸다(엣지 라이트). 보더 없는 blur는 안 됨.
- 유리 뒤 콘텐츠가 스크롤되며 비쳐야 의미가 있다. 비칠 게 없으면 그냥 Surface(solid)를 써라.
- **데이터 밀집 화면(어드민 대시보드/출결 표/랭킹)은 유리 최소화.** 내비/툴바만 유리, 표·셀은 solid. 가독성 우선.

---

## 3. 색상 시스템 — Semantic / System Colors (iOS 26 HIG)

**대원칙(불변): 색 = 의미.** 색은 장식이 아니라 *상태·역할·위계*를 표현한다. 같은 성격의 정보는 같은 색. "다양해 보이려고" 임의 색을 칠하지 말 것 — iOS 26도 색을 의미로만 쓴다.

이전 규칙의 "보라/인디고 전면 금지"는 **해제**한다. 대신 모든 색은 **역할(role)** 에 묶인다 — 아무 데나 못 쓰는 건 동일하다.

### 3-1. 의미색 (System Colors → 역할)
| 역할 | iOS system color | 토큰(Tailwind 근사) | 쓰는 곳 |
|---|---|---|---|
| 정보 · 주요 · 링크 | systemBlue `#007AFF` | `blue-500/600` | 총 원생, 진도율, 1차 액션, 클릭 가능 |
| 양호 · 완료 · 등원 | systemGreen `#34C759` | `emerald-500` | 출석, 누적 학습, 성공 상태 |
| 주의 · 조치 필요 | systemOrange `#FF9500` | `amber/orange-500` | 미입력, 미학습, 진도 부족, 상담 도래, 지각 |
| 위험 · 실패 · 미등원 | systemRed `#FF3B30` | `red-500` | 결석, 만료, 처리 실패 |
| 강조 · 프리미엄 · 브랜드 액센트 | systemIndigo `#5856D6` / systemPurple `#AF52DE` | `indigo/violet-500` | 마케팅 히어로, 등급/리워드, 브랜드 그라데이션 |
| 중립(텍스트·분류) | label 계열 | `#1D1D1F` / `#86868B` / `slate-*` | 본문, 일반 수치, 캠퍼스 태그 |

### 3-2. 라벨 색 (Label — 텍스트 위계)
- `label` 본문 `#1D1D1F` (다크 `#F5F5F7`)
- `secondaryLabel` 보조 `#86868B`
- `tertiaryLabel` 비활성/플레이스홀더 `#C7C7CC`
- 유리 위 텍스트는 **vibrancy** 처럼 — 배경과 섞이되 충분한 대비 확보(§7). 유리 위 회색 저대비 텍스트 금지.

### 3-3. Tint (강조색)
- 화면당 **주요 tint는 하나**(보통 systemBlue). tint는 "지금 누를 수 있는 것"을 가리킨다.
- 같은 성격의 KPI를 카드마다 다른 색으로 칠하지 말 것(과거 사고 지점). 위계는 §1·§2의 **깊이/재질**로.

### 3-4. 금지 (여전히 유효)
- ❌ **존재하지 않는 Tailwind 셰이드** `-450 / -650 / -750 / -850` 등. 클래스가 생성 안 돼 **검정으로 렌더**된다. 유효 셰이드(`50,100,...,600,...,900`)만.
- ❌ 의미 없는 색 난사 / 동일 역할에 다색.
- ❌ 하드코딩 hex 남발 — 가능하면 토큰/CSS 변수.

---

## 4. 형태 (Geometry) — Concentric

iOS 26은 **동심(concentric) 라운딩**을 쓴다: 중첩 요소들이 공통 중심을 공유하고, 안쪽 radius = 바깥 radius − padding.

- **Radius 스케일:** 컨테이너 `1rem`(16px) / 카드 `0.75rem`(12px) / 칩·인풋 `0.5rem`(8px) / 버튼·뱃지 = **capsule**(`rounded-full`).
- 중첩 시 안쪽이 항상 더 작은 radius. (16px 카드 안 12px 패널 안 8px 칩)
- 1차 버튼·세그먼트·탭·필터는 **캡슐(pill)** 형태가 기본.
- 터치 타깃 최소 **44×44px**(모바일/키오스크 필수).
- 간격: 8pt 그리드(4/8/12/16/24/32).

---

## 5. 타이포그래피

- 폰트: **Pretendard**(SF Pro 대응). 한글 본문 가독성 우선.
- 본문 행간 넉넉히, 저대비 회색 본문 금지. 숫자 KPI는 `tabular-nums`(자리 흔들림 방지).

### 타입 스케일 — 역할마다 **고정 크기** (들쭉날쭉 금지)
| 역할 | 크기 | 무게 | 색 |
|---|---|---|---|
| KPI/지표 숫자 | **18px** | semibold | 의미색/잉크 (제목보다 작게 — 위계 역전 금지) |
| 섹션 타이틀 | **17px** | semibold | 잉크 |
| 카드·위젯 제목 | **15px** | semibold | 잉크 |
| 본문·1차 라벨 | **13px** | medium | 잉크/보조 |
| 캡션·보조 | **12px** | regular/medium | 보조회색 |
| 마이크로(뱃지·밀집 메타) | **11px(바닥)** | medium | 보조회색 |

- **금지: `font-black`(900)·`font-extrabold`(800)·`font-bold`(700)** — Apple 톤 아님. 무게는 **2단(본문 400 / 강조 semibold 600)** 만. (globals.css 전역 강제: `.font-black/.font-extrabold/.font-bold`·`b/strong` → 600 !important.)
- **금지: 9·10px** — 가독 최소선 11px. (앱 셸에서 전역으로 11px 바닥 적용됨.)
- 같은 역할엔 같은 크기. 임의 `text-[NNpx]` 남발 말고 위 6단에 맞출 것.

---

## 6. 모션

- iOS 26 모션은 **물리적·연속적**: 유리가 눌리며 퍼지고, 시트가 아래에서 떠오른다. `ease-out`/스프링 느낌, `transition-[transform,opacity]`.
- 의미 있는 전환에만(등장·상태변화). 장식성 무한 애니메이션 자제.
- `transition-premium` 등 공용 유틸은 **반드시 `app/globals.css`** 에(§8).

---

## 7. 접근성 — 재질보다 우선 (필수)

유리는 "있으면 좋은 것"이고, 가독성은 "지켜야 하는 것"이다. 아래 폴백 없으면 머지 금지.

```css
@media (prefers-reduced-transparency: reduce) {
  /* 유리 → 불투명. backdrop-blur 제거, 배경 opacity 1로 */
  .glass { background: #fff; backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  /* 보더·텍스트 대비 강화 */
}
@media (prefers-reduced-motion: reduce) {
  /* transition/animation 최소화 */
}
```
- 유리 위 텍스트/아이콘은 대비 **4.5:1 이상**(작은 텍스트). 안 나오면 그 자리는 solid surface로.
- 색만으로 상태를 전달하지 말 것 — 텍스트/아이콘 병행(색맹 대응). (캠퍼스=회색 뱃지+텍스트, 교재=BookOpen·인강=Monitor **lucide 아이콘** + 파랑.)
- **앱 UI(admin/attend/report)에 이모지 라벨 금지** → lucide 아이콘. (예외: 학생 리포트의 격려·축하 이모지 🎉🎁🧡👋 = 의도적 제품 보이스, 유지.)

---

## 8. CSS / 엔지니어링 함정 (실제 사고 — 디자인과 무관하게 불변)

- **전역 CSS는 `app/globals.css` 하나만 live.** `styles/globals.css`는 **죽은 파일**(어디서도 import 안 됨, shadcn 잔재). 공용 유틸·클래스·키프레임·glass 토큰은 **반드시 `app/globals.css`** 에. (과거 죽은 파일에 넣어 전부 무효였던 사고 있음.)
- **어드민 앱 셸 배경 = `#F8F9FA`**(대시보드/상담/랭킹/출결 루트). 작은 채움색은 `#F5F5F7`.
- §3-4의 무효 셰이드(`-450/-650/...`) 재확인 — 검정 렌더 사고.

---

## 9. 변경 후 확인

- [ ] 유리는 떠 있는 크롬에만? 본문/표는 solid? (유리 위 유리 없음?)
- [ ] 색이 §3 역할에 매핑되는가? 동일 역할에 다색 없는가?
- [ ] radius가 동심(바깥>안쪽)이고 버튼은 캡슐인가?
- [ ] `prefers-reduced-transparency / contrast / motion` 폴백 있는가? 유리 위 텍스트 대비 4.5:1?
- [ ] `grep -rE "\-(450|650|750|850)\b"` — 무효 셰이드 없는가?
- [ ] 공용 유틸을 `app/globals.css`에 넣었는가? dev 프리뷰 콘솔 에러 0?
