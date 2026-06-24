// 동기식 환경변수 강제 로드
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

const { getStudents } = require('../lib/store');
const TODAY = '2026-06-24';

async function main() {
  try {
    console.log('=== Supabase 진도 데이터 저장 상태 점검 ===');
    const students = await getStudents();
    
    const targets = ['김철수', '이영희', '박지성', '손흥민'];
    for (const name of targets) {
      const student = students.find(s => s.name === name);
      if (!student) {
        console.log(`❌ 학생 "${name}" 을 찾을 수 없습니다.`);
        continue;
      }
      
      console.log(`\n[학생] ${name}`);
      const books = student.books || [];
      const lectures = student.lectures || [];
      
      let foundPlan = false;
      
      books.forEach(b => {
        const plans = b.detailedPlans || [];
        plans.forEach(p => {
          if (p.startDate <= TODAY && TODAY <= p.endDate) {
            console.log(` - 교재 "${b.title}": 완료 여부: ${p.isCompleted}, 실제 학습량: ${p.actualAmount}`);
            foundPlan = true;
          }
        });
      });
      
      lectures.forEach(l => {
        const plans = l.detailedPlans || [];
        plans.forEach(p => {
          if (p.startDate <= TODAY && TODAY <= p.endDate) {
            console.log(` - 인강 "${l.name}": 완료 여부: ${p.isCompleted}, 실제 학습량: ${p.actualAmount}`);
            foundPlan = true;
          }
        });
      });
      
      if (!foundPlan) {
        console.log(' - ⚠️ 오늘 날짜에 대한 계획이 존재하지 않습니다.');
      }
    }
  } catch (error) {
    console.error('Error checking progress:', error);
  }
}

main();
