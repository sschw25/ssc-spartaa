import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testApi() {
  const correctPassword = process.env.ADMIN_PASSWORD || 'sparta123!';
  console.log(`[API Test] Starting admin login check... (PW: ${correctPassword})`);

  try {
    // 1. 관리자 로그인
    const loginRes = await fetch('http://localhost:3000/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: correctPassword }),
    });

    const cookie = loginRes.headers.get('set-cookie');
    console.log('[API Test] Login response status:', loginRes.status);
    console.log('[API Test] Cookies returned:', cookie ? 'Yes' : 'No');

    if (!cookie) {
      console.error('[API Test] Failed to get session cookie.');
      return;
    }

    // 2. 학생 목록 조회
    const studentsRes = await fetch('http://localhost:3000/api/admin/students', {
      headers: {
        Cookie: cookie,
      },
    });

    console.log('[API Test] Fetch students status:', studentsRes.status);
    const json = await studentsRes.json();

    if (json.success) {
      const list = json.data || [];
      console.log(`[API Test] API Returned Students Count: ${list.length}명`);
      
      const son = list.find((s: any) => s.name === '손흥민');
      if (son) {
        console.log(' ✅ [성공] API 응답에 손흥민 학생이 포함되어 있습니다!');
        console.log(JSON.stringify(son, null, 2));
      } else {
        console.log(' ❌ [실패] API 응답에 손흥민 학생이 존재하지 않습니다!');
        console.log('전체 학생 명단:', list.map((s: any) => s.name).join(', '));
      }
    } else {
      console.error('[API Test] API error:', json.message);
    }
  } catch (error) {
    console.error('[API Test] Network/runtime error:', error);
  }
}

testApi();
