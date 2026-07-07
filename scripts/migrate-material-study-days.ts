/**
 * 요일 설정을 자료(교재/강의) 단위로 단일화하는 1회성 마이그레이션.
 *
 * 배경: studyDays 가 과목(SubjectProgress.studyDays)과 자료(Book/LectureProgress.studyDays)
 * 두 곳에 있었고 자료→과목 폴백이 있었다. 폴백을 제거하기 전에, 과목 요일만 있고 자료 요일이
 * 비어 있는 기존 학생이 월~토 기본값으로 리셋되지 않도록 과목 요일을 자료로 내려쓴다.
 *
 * 동작: 각 subject 의 각 book/lecture 에 대해
 *   - 자료 studyDays 가 비어 있으면(undefined/빈 배열) subject.studyDays 를 복사해 채운다.
 *   - 그다음 subject.studyDays 를 [] 로 비운다(개념 완전 제거).
 * 변경된 학생만 저장한다.
 *
 * 실행:  npx tsx scripts/migrate-material-study-days.ts           (실제 저장)
 *        npx tsx scripts/migrate-material-study-days.ts --dry-run (미리보기, 저장 안 함)
 *
 * 롤아웃: 이 스크립트를 먼저 실행한 뒤 폴백 제거 코드를 배포한다(또는 동시).
 */

// 동기식 환경변수 강제 로드 (scripts/check-progress.ts 패턴 재사용)
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line: string) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
}

const { getStudents, saveStudent } = require('../lib/store');

type Material = { id?: string; title?: string; name?: string; studyDays?: string[] };
type Subject = { name?: string; studyDays?: string[]; books?: Material[]; lectures?: Material[] };
type Student = { id: string; name?: string; subjects?: Subject[] };

const DRY_RUN = process.argv.includes('--dry-run');

function hasDays(days?: string[]): boolean {
  return Array.isArray(days) && days.length > 0;
}

async function main() {
  console.log(`=== 자료 단위 요일 마이그레이션 ${DRY_RUN ? '(DRY RUN — 저장 안 함)' : '(실제 저장)'} ===\n`);

  const students: Student[] = await getStudents();
  console.log(`대상 학생 ${students.length}명\n`);

  let changedStudents = 0;
  let downCopied = 0;   // 과목→자료로 요일을 채운 자료 수
  let clearedSubjects = 0; // 요일을 비운 과목 수

  for (const student of students) {
    const subjects = student.subjects || [];
    let studentChanged = false;
    const notes: string[] = [];

    for (const subject of subjects) {
      const subjectDays = subject.studyDays || [];
      const materials: Array<{ mat: Material; kind: string }> = [
        ...(subject.books || []).map((mat) => ({ mat, kind: '교재' })),
        ...(subject.lectures || []).map((mat) => ({ mat, kind: '강의' })),
      ];

      // 1) 자료 요일이 비어 있고 과목 요일이 있으면 내려쓴다.
      if (hasDays(subjectDays)) {
        for (const { mat, kind } of materials) {
          if (!hasDays(mat.studyDays)) {
            mat.studyDays = [...subjectDays];
            downCopied++;
            studentChanged = true;
            notes.push(`  ↓ [${kind}] ${mat.title || mat.name || mat.id} ← ${subjectDays.join(',')}`);
          }
        }
      }

      // 2) 과목 요일을 비운다(있었던 경우만).
      if (hasDays(subject.studyDays)) {
        subject.studyDays = [];
        clearedSubjects++;
        studentChanged = true;
        notes.push(`  × 과목 "${subject.name}" 요일 비움`);
      }
    }

    if (studentChanged) {
      changedStudents++;
      console.log(`[${student.name || student.id}]`);
      notes.forEach((n) => console.log(n));
      if (!DRY_RUN) {
        await saveStudent(student);
        console.log('  ✓ 저장됨');
      }
      console.log('');
    }
  }

  console.log('=== 요약 ===');
  console.log(`변경 학생: ${changedStudents}명`);
  console.log(`요일 내려쓴 자료: ${downCopied}개`);
  console.log(`요일 비운 과목: ${clearedSubjects}개`);
  if (DRY_RUN) console.log('\n(DRY RUN 이었습니다. 실제 저장하려면 --dry-run 없이 다시 실행하세요.)');
}

main().catch((err) => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
