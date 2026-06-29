// 1. 동기식 환경변수 강제 로드
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
}

// 2. 동적 require
const bcrypt = require('bcryptjs');
const { getStudents, saveStudent, setStudentPasswordHash } = require('../lib/store');

const TODAY = '2026-06-24';

function createTodayPlan(idSuffix, isBook = true) {
  return {
    id: `plan_today_${idSuffix}`,
    weekNumber: 1,
    startDate: TODAY,
    endDate: TODAY,
    targetAmount: 6,
    dailyAmount: 1,
    rangeText: isBook ? '1p~6p' : '1강~6강',
    isCompleted: false,
  };
}

function createBaseSubject(name, studyTime, isBook, title) {
  const subjectId = `subj_${name.toLowerCase()}_${Date.now()}`;
  const materialId = `mat_${isBook ? 'book' : 'lecture'}_${Date.now()}`;
  const plan = createTodayPlan(name, isBook);

  const subject = {
    id: subjectId,
    name,
    studyDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    studyTime,
    books: [],
    lectures: [],
  };

  if (isBook) {
    subject.books = [{
      id: materialId,
      title,
      totalPages: 100,
      currentPage: 0,
      goalType: 'dailyAmount',
      goalValue: 1,
      unit: 'p',
      detailedPlans: [plan]
    }];
  } else {
    subject.lectures = [{
      id: materialId,
      name: title,
      totalEpisodes: 30,
      currentEpisode: 0,
      goalType: 'dailyAmount',
      goalValue: 1,
      speedMultiplier: 1.0,
      detailedPlans: [plan]
    }];
  }

  return subject;
}

async function main() {
  try {
    console.log('=== [Supabase 강제 연동] 테스트 데이터 셋업 시작 ===');
    const students = await getStudents();
    console.log(`현재 등록된 학생 수: ${students.length}명`);

    const targets = [
      { name: '김철수', manager: '김동하 코멘터', campus: 'wonju', subject: '국어', isBook: true, title: '수능 국어 기출' },
      { name: '이영희', manager: '김동하 코멘터', campus: 'chuncheon', subject: '영어', isBook: true, title: '수능 영어 독해' },
      { name: '박지성', manager: '이승현 코멘터', campus: 'chungju', subject: '수학', isBook: false, title: '수학 기하 인강' },
      { name: '손흥민', manager: '이승현 코멘터', campus: 'wonju', subject: '과학', isBook: false, title: '물리학I 개념 인강' },
    ];

    const passwordHash = bcrypt.hashSync('1234', 10);

    for (const target of targets) {
      const existing = students.find(s => s.name === target.name);
      const id = existing ? existing.id : `std_${target.name.toLowerCase()}_${Date.now()}`;
      
      console.log(`[신규 초기화 셋업] 학생 "${target.name}" 의 데이터를 완전 리셋하여 새로 등록합니다.`);
      const subject = createBaseSubject(target.subject, 'morning', target.isBook, target.title);

      const student = {
        id,
        name: target.name,
        campus: target.campus,
        manager: target.manager,
        contact: '010-0000-0000',
        lifeComment: '',
        studentLifeComment: '',
        specialNote: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        books: subject.books || [],
        lectures: subject.lectures || [],
        consultationLogs: [],
        grades: [],
        subjects: [subject],
        passwordHash,
      };

      await saveStudent(student);
      // Supabase 보안 스키마 규격에 맞춰 비밀번호 컬럼 강제 갱신
      await setStudentPasswordHash(student.id, passwordHash);
      console.log(` -> "${student.name}" (담당: ${student.manager}) 저장 및 비밀번호 설정 완료.`);
    }

    console.log('=== 테스트 데이터 셋업 완료 ===');
  } catch (error) {
    console.error('테스트 데이터 셋업 중 에러 발생:', error);
  }
}

main();
