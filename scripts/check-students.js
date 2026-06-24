const { getStudents } = require('../lib/store');
const dotenv = require('dotenv');
const path = require('path');

// .env.local 로드
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function main() {
  try {
    const students = await getStudents();
    console.log('--- 원생 목록 ---');
    students.forEach(s => {
      console.log(`ID: ${s.id}, 이름: ${s.name}, 로그인ID: ${s.loginId}, 소속캠퍼스: ${s.campus}`);
    });
  } catch (e) {
    console.error('Error fetching students:', e);
  }
}

main();
