import { GradeItem } from '@/lib/types/student';

export type GradeChartRow = {
  key: string;
  date: string;
  testName: string;
  sortDate: string;
  [subject: string]: string | number;
};

export function getGradeSubjects(grades: GradeItem[]) {
  return Array.from(
    new Set(
      grades
        .map((grade) => grade.subject?.trim())
        .filter((subject): subject is string => Boolean(subject))
    )
  );
}

export function getGradeChartData(grades: GradeItem[]): GradeChartRow[] {
  const rowsByBaseKey = new Map<string, GradeChartRow[]>();

  grades
    .filter((grade) => grade.date && grade.subject)
    .forEach((grade) => {
      const date = grade.date;
      const testName = grade.testName?.trim() || '테스트';
      const subject = grade.subject.trim();
      const baseKey = `${date}_${testName}`;
      const rows = rowsByBaseKey.get(baseKey) || [];
      let targetRow = rows.find((row) => row[subject] === undefined);

      if (!targetRow) {
        targetRow = {
          key: `${baseKey}_${rows.length}`,
          date: date.length >= 10 ? date.substring(5, 10) : date,
          testName,
          sortDate: date,
        };
        rows.push(targetRow);
        rowsByBaseKey.set(baseKey, rows);
      }

      targetRow[subject] = Number(grade.score) || 0;
    });

  const sortedRows = Array.from(rowsByBaseKey.values())
    .flat()
    .sort((a, b) => {
      const dateDiff = new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.key.localeCompare(b.key);
    });

  const subjectsSet = new Set(grades.map(g => g.subject.trim()));
  const rowsWithAvg = sortedRows.map((row) => {
    let sum = 0;
    let count = 0;
    for (const key in row) {
      if (subjectsSet.has(key)) {
        const val = row[key];
        if (typeof val === 'number') {
          sum += val;
          count++;
        }
      }
    }
    const average = count > 0 ? sum / count : 0;
    return { ...row, _average: average };
  });

  return rowsWithAvg.map((row, idx, arr) => {
    const windowSize = Math.min(5, idx + 1);
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < windowSize; i++) {
      const targetRow = arr[idx - i];
      const weight = 5 - i;
      weightedSum += targetRow._average * weight;
      weightTotal += weight;
    }
    const movingAvg = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : 0;
    
    // 임시 내부 필드는 제거하고 추세선 할당
    const { _average, ...cleanRow } = row;
    return {
      ...cleanRow,
      '추세선': movingAvg
    } as GradeChartRow;
  });
}
