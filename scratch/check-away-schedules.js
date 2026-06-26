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

const { getStudentById } = require('../lib/store');

async function main() {
  const id = 'std_1782451638170_al3kd';
  try {
    const student = await getStudentById(id);
    console.log(`=== ${student.name} 상세 데이터 ===`);
    console.log(JSON.stringify(student.awaySchedules, null, 2));
  } catch (e) {
    console.error(e);
  }
}

main();
