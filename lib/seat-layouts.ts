// 센터별 좌석 배치 정의 — PDF 기반
// null = 빈 간격 (통로·여백)

export type Cell = number | null;

export interface LayoutPage {
  label: string;             // 탭 레이블 (예: "1~38")
  rows: Cell[][];            // 2D 배열: 행×열
  hallwayAfterRow?: number;  // 이 행 다음에 복도 구분선 삽입
  hallwayLabels?: { left: string; center: string; right: string };
  separatorAfterRow?: number; // 단순 공백 구분 (라벨 없음)
}

export type CampusKey = 'chungju' | 'wonju' | 'chuncheon';

export const CAMPUS_LABELS: Record<CampusKey, string> = {
  chungju:   '충주',
  wonju:     '원주',
  chuncheon: '춘천',
};

export function isCampusKey(value: unknown): value is CampusKey {
  return value === 'chungju' || value === 'wonju' || value === 'chuncheon';
}

// 캠퍼스 배치도에 실제 존재하는 좌석번호 집합 — 신청 좌석 검증용.
export function getCampusSeatNumbers(campus: CampusKey): Set<number> {
  const seats = new Set<number>();
  for (const page of CAMPUS_LAYOUTS[campus]) {
    for (const row of page.rows) {
      for (const cell of row) {
        if (typeof cell === 'number') seats.add(cell);
      }
    }
  }
  return seats;
}

export const CAMPUS_LAYOUTS: Record<CampusKey, LayoutPage[]> = {

  // ── 충주 ─────────────────────────────────────────────────────────────────
  chungju: [
    {
      label: '1 ~ 38',
      // 왼쪽(1~25) + 오른쪽(26~38): 26·27은 오른쪽 끝(col 10)에 단독 배치
      // col:  0   1   2   3   4   5   6   7   8   9  10
      rows: [
        [1,  2,  3,  4,  5,    null, null, null, null, null, 26],
        [6,  7,  8,  9,  null, null, null, null, null, null, 27],
        [10, 11, 12, 13, null, null, null, 28, 29,   30,   31],
        [14, 15, 16, 17, null, null, null, 32, 33,   34,   35],
        [18, 19, 20, 21, null, null, null, 36, 37,   38,   null],
        [22, 23, 24, 25, null, null, null, null, null, null, null],
      ],
    },
    {
      label: '39 ~ 108',
      // 상단: 왼쪽(39~58) + 오른쪽(59~76)
      // 하단: 왼쪽(108~93, 역방향) + 오른쪽(92~77)
      rows: [
        [39,  40,  41,  42,  null, 59,  60,  61,  62],
        [43,  44,  45,  46,  null, 63,  64,  65,  66],
        [47,  48,  49,  50,  null, 67,  68,  69,  null],
        [51,  52,  53,  54,  null, 70,  71,  72,  null],
        [55,  56,  57,  58,  null, 73,  74,  75,  76],
        // ↓ 구분 후 역방향 배치
        [108, 107, 106, 105, null, 92,  91,  90,  89],
        [104, 103, 102, 101, null, 88,  87,  86,  null],
        [100, 99,  98,  97,  null, 85,  84,  83,  82],
        [96,  95,  94,  93,  null, 81,  80,  79,  78],
        [null, null, null, null, null, 77, null, null, null],
      ],
      separatorAfterRow: 4, // 상단·하단 구분 공백
    },
  ],

  // ── 원주 ─────────────────────────────────────────────────────────────────
  wonju: [
    {
      label: '5층',
      rows: [
        // 앞쪽 (칠판 방향)
        // col:  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17
        [1,  2,  3,  null, 4,  5,  6,  7,  null, 8,  9,  10, 11, null, 12, 13, 14, 15],
        // 26·27 → 오른쪽 끝(col 16·17)에 맞춤
        [16, 17, 18, null, 19, 20, 21, 22, null, 23, 24, 25, null, null, null, null, 26, 27],
        // ↓ 복도 구분선 (hallwayAfterRow: 1)
        // 뒤쪽
        // 39·40 → 오른쪽 끝(col 16·17) 정렬
        [28, 29, 30, null, 31, 32, 33, 34, null, 35, 36, 37, 38, null, null, null, 39, 40],
        [41, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 56],
        // cluster3(48~51): col 9~12, cluster4(52~55): col 14~17
        [42, 43, 44, null, 45, 46, 47, null, null, 48, 49, 50, 51, null, 52, 53, 54, 55],
      ],
      hallwayAfterRow: 1,
      hallwayLabels: { left: '앞문', center: '복도', right: '뒷문' },
    },
    {
      label: '4층',
      // 메인 구역(57~85) + 오른쪽 2강의실 구역(86~100) + 집중관리반(101~104)
      rows: [
        [57,  58,  59,  null, 60,  61,  62,  63,  64,  null, null, 86,  null, 94],
        [null, null, null, null, null, null, null, 74,  null, null, null, 87, null, 95],
        [65,  66,  67,  null, 69,  71,  null, 73,  null, 76,  null, 88,  null, 96],
        [null, null, null, null, 68,  70,  null, 72,  null, 75,  null, 89,  null, 97],
        [null, null, null, null, null, null, null, null, null, null, null, 90,  null, 98],
        [77,  78,  79,  null, 80,  81,  82,  83,  84,  85,  null, 91,  null, 99],
        [null, null, null, null, null, null, null, null, null, null, null, 92,  null, 100],
        [null, null, null, null, null, null, null, null, null, null, null, 93,  null, null],
        // 집중관리반
        [101, 102, 103, 104, null, null, null, null, null, null, null, null, null, null],
      ],
    },
  ],

  // ── 춘천 ─────────────────────────────────────────────────────────────────
  chuncheon: [
    {
      label: '1 ~ 68',
      // 왼쪽(1~15, 24~48) + 오른쪽(16~23, 49~68) 나란히
      rows: [
        [1,  2,  3,  4,  5,  null, 16, 17, 18, 19],
        [6,  7,  8,  9,  10, null, 20, 21, 22, 23],
        [11, 12, 13, 14, 15, null, null, null, null, null],
        // ↓ 구분 공백
        [24, 25, 26, 27, 28, null, 49, 50, 51, 52],
        [29, 30, 31, 32, 33, null, 53, 54, 55, 56],
        [34, 35, 36, 37, 38, null, 57, 58, 59, 60],
        [39, 40, 41, 42, 43, null, 61, 62, 63, 64],
        [44, 45, 46, 47, 48, null, 65, 66, 67, 68],
      ],
      separatorAfterRow: 2,
    },
    {
      label: '69 ~ 140 (자유석·대기석)',
      rows: [
        // 자유석 — 왼쪽(69~91) + 오른쪽(92~120)
        [69,  70,  71,  72,  null, 92,  93,  94,  95,  96],
        [73,  74,  75,  76,  null, 97,  98,  99,  100, 101],
        [77,  78,  79,  80,  null, 102, 103, 104, 105, 106],
        [81,  82,  83,  84,  null, 107, 108, 109, 110, 111],
        [85,  86,  87,  88,  null, 112, 113, 114, null, null],
        [89,  90,  91,  null, null, 115, 116, null, null, null],
        // 자유석 끝 → 대기석
        [null, null, null, null, null, 117, 118, 119, 120, null],
        // ↓ 구분
        [121, 122, 123, 124, 125, 126, 127, 128, 129, 130],
        [131, 132, 133, 134, 135, 136, 137, 138, 139, 140],
      ],
      separatorAfterRow: 6,
    },
  ],
};
