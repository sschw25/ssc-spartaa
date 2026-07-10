// 자료(교재/인강)별 색상 — 학생이 지정하고, 시간표·캘린더·홈 등 앱 전체에서 이 색으로 표시한다.
// 색상은 동적(학생 선택)이라 Tailwind 클래스 대신 인라인 스타일로 적용한다.
// iOS26 Liquid Glass 규칙에 맞춰 보라/인디고는 팔레트에서 제외한다.
import type React from 'react';

export interface MaterialColorDef {
  key: string;
  label: string;
  hex: string;
}

// 학생이 고를 수 있는 색상 팔레트(보라/인디고 제외, 서로 구분 잘 되는 12색).
export const MATERIAL_COLORS: MaterialColorDef[] = [
  { key: 'blue', label: '블루', hex: '#0071E3' },
  { key: 'sky', label: '스카이', hex: '#38BDF8' },
  { key: 'teal', label: '틸', hex: '#14B8A6' },
  { key: 'green', label: '그린', hex: '#22A559' },
  { key: 'lime', label: '라임', hex: '#84CC16' },
  { key: 'amber', label: '앰버', hex: '#F59E0B' },
  { key: 'orange', label: '오렌지', hex: '#F97316' },
  { key: 'red', label: '레드', hex: '#EF4444' },
  { key: 'rose', label: '로즈', hex: '#F43F5E' },
  { key: 'pink', label: '핑크', hex: '#EC4899' },
  { key: 'brown', label: '브라운', hex: '#A16207' },
  { key: 'slate', label: '그레이', hex: '#64748B' },
];

const BY_KEY: Record<string, string> = Object.fromEntries(MATERIAL_COLORS.map((c) => [c.key, c.hex]));
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// 자료 id → 팔레트 인덱스(안정적 해시). 색 미지정 자료도 항상 같은 기본색을 갖는다.
function hashIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % MATERIAL_COLORS.length;
}

// 자료의 표시 색(hex) 반환. color 가 팔레트 key면 그 hex, '#RRGGBB'면 그대로, 미설정이면 id 해시 기본색.
export function getMaterialColor(material: { id?: string; color?: string } | undefined): string {
  const c = material?.color;
  if (c) {
    if (BY_KEY[c]) return BY_KEY[c];
    if (HEX_RE.test(c)) return c;
  }
  return MATERIAL_COLORS[hashIndex(material?.id || '')].hex;
}

// color 값이 실제 학생 지정인지(파생 기본색이 아닌지) — 피커에서 '선택됨' 표시용.
export function hasExplicitColor(color?: string): boolean {
  return !!color && (!!BY_KEY[color] || HEX_RE.test(color));
}

// 저장 허용 값인지(API 검증) — 팔레트 key 또는 '#RRGGBB'. (빈 문자열=해제는 호출부에서 별도 처리.)
export function isValidMaterialColor(color: unknown): color is string {
  return typeof color === 'string' && (!!BY_KEY[color] || HEX_RE.test(color));
}

// 배경색 위에 얹을 가독성 좋은 글자색(#fff 또는 진한 회색) — 명도 기준. 컬러 바 라벨용.
export function readableTextOn(hex: string): string {
  const m = HEX_RE.test(hex) ? hex : '#64748B';
  const r = parseInt(m.slice(1, 3), 16), g = parseInt(m.slice(3, 5), 16), b = parseInt(m.slice(5, 7), 16);
  // 상대 명도(sRGB 근사). 밝으면 진한 글자, 어두우면 흰 글자.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1c1c1e' : '#ffffff';
}

// #RRGGBB → rgba(문자열). alpha 로 연한 배경 틴트를 만든다.
export function hexToRgba(hex: string, alpha: number): string {
  const m = HEX_RE.test(hex) ? hex : '#64748B';
  const r = parseInt(m.slice(1, 3), 16);
  const g = parseInt(m.slice(3, 5), 16);
  const b = parseInt(m.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 자료 컬러박스 인라인 스타일 — 연한 틴트 배경 + 좌측 색 강조 바(borderLeft). 라이트/다크 공통으로 무난.
export function materialBoxStyle(hex: string): React.CSSProperties {
  return {
    backgroundColor: hexToRgba(hex, 0.12),
    borderLeft: `3px solid ${hex}`,
  };
}

// 작은 색 점(dot) 스타일 — 캘린더 마커·범례용.
export function materialDotStyle(hex: string): React.CSSProperties {
  return { backgroundColor: hex };
}
