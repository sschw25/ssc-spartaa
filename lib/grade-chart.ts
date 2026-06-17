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

  return Array.from(rowsByBaseKey.values())
    .flat()
    .sort((a, b) => {
      const dateDiff = new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.key.localeCompare(b.key);
    });
}
