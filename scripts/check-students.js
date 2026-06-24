// 동기식 환경변수 로딩으로 Static Import 시점 맞춤
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
