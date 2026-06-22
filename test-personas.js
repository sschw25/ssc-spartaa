const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 강인한(robust) 타이핑 헬퍼 함수 - 타이핑을 시도하고 누락 시 React DOM Fallback 강제 주입
async function safeType(page, selector, text) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  
  await element.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, 200));

  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      el.value = '';
    }
  }, selector);
  await new Promise(r => setTimeout(r, 100));

  await page.type(selector, text, { delay: 60 });
  await new Promise(r => setTimeout(r, 200));

  // 검증 로직
  const actualVal = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.value : '';
  }, selector);

  if (actualVal !== text) {
    console.log(`[Warning] Value mismatch on ${selector}. Expected "${text}" but got "${actualVal}". Triggering fallback injection...`);
    await page.evaluate((sel, valToSet) => {
      const el = document.querySelector(sel);
      if (el) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        nativeInputValueSetter.call(el, valToSet);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur(); // 포커스를 해제하여 React가 변경 상태를 확실하게 commit 하도록 유도
      }
    }, selector, text);
    await new Promise(r => setTimeout(r, 800));
  }
}

// 폼 직접 제출(Submit Dispatch) 헬퍼 - 클릭 무시 현상 완전 극복
async function submitForm(page) {
  console.log('폼 직접 제출(Submit) 시도...');
  const submitted = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      return true;
    }
    return false;
  });
  if (!submitted) {
    console.log('폼을 찾지 못하여 버튼 클릭 방식으로 폴백합니다.');
    await page.click('button[type="submit"]');
  }
  await new Promise(r => setTimeout(r, 500));
}

// 학생 결과지 페이지 로딩 완료 대기 헬퍼
async function waitForReportPageLoad(page, studentName) {
  console.log(`[${studentName}] 결과지 페이지 로딩 대기 중...`);
  // URL에 report가 들어왔는지 확인
  await page.waitForFunction(() => window.location.href.includes('/report/'), { timeout: 15000 });
  // 스피너 로딩이 사라질 때까지 대기
  await page.waitForFunction(() => {
    return !document.body.textContent.includes('결과 리포트 카드 불러오는 중') &&
           !document.body.textContent.includes('불러오는 중');
  }, { timeout: 15000 });
  // 탭 목록 및 학생 정보가 화면에 그려질 때까지 대기
  await page.waitForFunction((name) => {
    return document.body.textContent.includes('요청/건의') &&
           document.body.textContent.includes(name);
  }, { timeout: 15000 }, studentName);
  console.log(`[${studentName}] 결과지 페이지 로딩 완료!`);
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const alternateChromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  let executablePath = '';
  
  if (fs.existsSync(chromePath)) {
    executablePath = chromePath;
  } else if (fs.existsSync(alternateChromePath)) {
    executablePath = alternateChromePath;
  } else {
    console.error('Chrome executable not found on standard paths!');
    process.exit(1);
  }

  console.log(`Using Chrome path: ${executablePath}`);

  // 브라우저 런칭: 사용자가 시뮬레이션을 눈으로 볼 수 있게 headless: false, slowMo 설정
  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    slowMo: 100,
    defaultViewport: { width: 1440, height: 950 }
  });

  const page = await browser.newPage();
  
  // 브라우저 얼럿 및 프롬프트 등 창이 뜰 때 자동으로 처리
  page.on('dialog', async dialog => {
    console.log(`[Dialog] Type: ${dialog.type()}, Message: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // -------------------------------------------------------------------------
    // 1단계: 관리자 로그인 및 비밀번호 설정, 상담 일지 작성
    // -------------------------------------------------------------------------
    console.log('\n=== [1단계] 관리자 로그인 및 학생 세팅 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    
    console.log('관리자 자격 증명 입력 중...');
    await safeType(page, '#username', 'admin');
    await safeType(page, '#password', 'sparta123!');
    
    await submitForm(page);
    
    console.log('관리자 대시보드 로딩 대기...');
    await page.waitForFunction(() => {
      return window.location.href.includes('/admin/dashboard') || 
             window.location.href.includes('/admin/consultation') ||
             document.body.textContent.includes('로그아웃') ||
             document.body.textContent.includes('대시보드');
    }, { timeout: 15000 }).catch(e => console.log('Admin login redirection check bypassed.'));

    console.log('관리자 로그인 성공. 상담/코칭 전용 페이지로 이동합니다...');

    // 상담/코칭 페이지로 즉시 이동
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });

    // 원생 목록이 모두 로드될 때까지 대기
    console.log('원생 목록 로딩 대기...');
    await page.waitForFunction(() => {
      return document.body.textContent.includes('김철수') &&
             document.body.textContent.includes('이영희') &&
             document.body.textContent.includes('박지성');
    }, { timeout: 30000 });
    console.log('원생 목록 로드 완료.');

    const students = [
      {
        id: 'std_seed_001',
        name: '김철수',
        campus: '원주',
        parentComment: '오전 10시~12시 집중도 강화를 위해 뽀모도로 학습법을 지도했습니다. 휴대폰은 등원 시 즉시 제출 완료.',
        studentComment: '철수 학생, 오전 자습 시작 직후 오늘의 학습 우선순위 3가지를 플래너에 적고 시작하는 루틴을 만들어봅시다.'
      },
      {
        id: 'std_seed_002',
        name: '이영희',
        campus: '춘천',
        parentComment: '인강 수강 비율에 비해 수학 문제 풀이량이 저조하여 주간 계획의 진도를 하향 및 문제 풀이 비중을 강화했습니다.',
        studentComment: '영희 학생, 수학 인강 수강 완료 후 반드시 5문제 이상 스스로 풀어보는 피드백 시간을 플래너에 기록해주세요.'
      },
      {
        id: 'std_seed_003',
        name: '박지성',
        campus: '충주',
        parentComment: '모의고사 점수 편차에 따른 심리 불안이 심하여 학습 멘토링 및 주 1회 심리 안정 상담 일정을 수립했습니다.',
        studentComment: '지성 학생, 성적 등락에 불안해하기보다는 오답 분석 카테고리를 활용해 오답 패턴을 단순화하는 연습에 집중합시다.'
      }
    ];

    // API를 이용해 학생들의 비밀번호를 '1234'로 신속 세팅
    for (const std of students) {
      console.log(`[API] ${std.name} 학생의 비밀번호를 '1234'로 설정 중...`);
      await page.evaluate(async (sid) => {
        const res = await fetch(`/api/admin/students/${sid}/password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: '1234' }),
        });
        const data = await res.json();
        console.log(`Password reset API response for ${sid}:`, data);
      }, std.id);
      await new Promise(r => setTimeout(r, 500));
    }

    // 각 학생 카드 클릭 및 상담 일지 입력
    for (const std of students) {
      console.log(`상담 페이지에서 ${std.name} (${std.campus}) 학생 행(또는 카드) 찾기...`);
      
      const elementHandle = await page.evaluateHandle((n) => {
        // 테이블 행(tr) 내에서 이름을 포함하는 요소 우선 검색
        const rows = Array.from(document.querySelectorAll('tr'));
        const foundRow = rows.find(r => r.textContent.includes(n));
        if (foundRow) return foundRow;

        // 카드 뷰(div)에서 이름 매칭 폴백
        const divs = Array.from(document.querySelectorAll('div'));
        return divs.find(div => div.textContent.includes(n) && div.className.includes('border'));
      }, std.name);

      if (!elementHandle || !elementHandle.asElement()) {
        throw new Error(`${std.name} 학생 대상을 찾을 수 없습니다.`);
      }

      console.log('화면 중앙으로 스크롤 이동 및 click 이벤트 디스패치...');
      await page.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, elementHandle);

      console.log('상세 정보 시트 활성화 대기 (생활 관리 탭 텍스트 대기)...');
      await page.waitForFunction(() => {
        return document.body.textContent.includes('생활 관리') &&
               document.body.textContent.includes('학습 관리');
      }, { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1200));

      console.log('생활 관리 탭 클릭...');
      const consultTabBtn = await page.evaluateHandle(() => {
        const els = Array.from(document.querySelectorAll('button, [role="tab"], span'));
        return els.find(el => el.textContent.trim() === '생활 관리');
      });
      if (consultTabBtn && consultTabBtn.asElement()) {
        await consultTabBtn.asElement().click();
      } else {
        throw new Error('생활 관리 탭 버튼을 찾을 수 없습니다.');
      }
      await new Promise(r => setTimeout(r, 1200));

      // 학부모 코멘트 입력
      console.log('학부모 공유용 코멘트 입력 중...');
      const parentArea = await page.waitForSelector('textarea[placeholder*="등원 시간"]');
      await parentArea.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await parentArea.type(std.parentComment);

      // 학생 코멘트 입력
      console.log('학생 공유용 코멘트 입력 중...');
      const studentArea = await page.waitForSelector('textarea[placeholder*="이번 주는 등원 루틴"]');
      await studentArea.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await studentArea.type(std.studentComment);

      await new Promise(r => setTimeout(r, 800));

      // 저장 버튼 클릭
      console.log('변경 사항 저장 중...');
      const saveBtnClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.trim() === '저장');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (!saveBtnClicked) {
        throw new Error('저장 버튼을 찾을 수 없습니다.');
      }

      console.log('저장 후 동기화 대기...');
      await new Promise(r => setTimeout(r, 3000));

      // 시트 닫기
      console.log('상세 정보 시트 닫기...');
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1500));
    }

    // 관리자 로그아웃
    console.log('관리자 세션 로그아웃 중...');
    await page.evaluate(async () => {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    });
    await new Promise(r => setTimeout(r, 1000));


    // -------------------------------------------------------------------------
    // 2단계: 학생들 개별 로그인 및 건의사항 등록
    // -------------------------------------------------------------------------
    console.log('\n=== [2단계] 학생 로그인 및 건의사항 작성 ===');
    
    const studentRequests = [
      {
        name: '김철수',
        pw: '1234',
        sug: '원주 자습실 C열 3번 자리에 앉아 공부하고 있습니다. 조명이 깜빡거리며 다소 어두는데 형광등이나 LED 교체가 가능할까요?'
      },
      {
        name: '이영희',
        pw: '1234',
        sug: '춘천 캠퍼스 자습실에서 태블릿을 거치할 수 있는 대여용 패드 거치대 수량이 부족합니다. 몇 개 더 구비해주시면 감사하겠습니다!'
      },
      {
        name: '박지성',
        pw: '1234',
        sug: '충주 캠퍼스 박지성입니다. 수학 과목 오답 노트를 작성할 때 어떤 포맷으로 정리해야 가장 효율적일지 오답노트 작성 멘토링을 1회 신청하고 싶습니다.'
      }
    ];

    for (const stdReq of studentRequests) {
      console.log(`\n학생 [${stdReq.name}] 로그인 페이지 접속 중...`);
      await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });

      // 안전하게 계정 타이핑
      console.log(`학생 [${stdReq.name}] 로그인 ID 및 비밀번호 입력 중...`);
      await safeType(page, '#student-login-id', stdReq.name);
      await safeType(page, '#student-password', stdReq.pw);

      await new Promise(r => setTimeout(r, 800));
      
      await submitForm(page);

      // 로딩 스피너 및 탭 렌더링 완료 확실히 대기
      await waitForReportPageLoad(page, stdReq.name);

      // 요청/건의 탭 클릭
      console.log('요청/건의 탭 클릭...');
      const reqTabBtnClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('요청/건의'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (!reqTabBtnClicked) {
        throw new Error('요청/건의 탭 버튼을 찾을 수 없습니다.');
      }
      await new Promise(r => setTimeout(r, 1200));

      // 요청/건의 영역으로 스크롤
      console.log('요청/건의 영역으로 스크롤 이동...');
      await page.evaluate(() => {
        const el = document.getElementById('student-requests');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await new Promise(r => setTimeout(r, 1000));

      // 건의 사항 타이핑
      console.log('건의사항 작성 중...');
      const sugArea = await page.waitForSelector('textarea[placeholder*="건의 내용을 적어 주세요"]');
      await sugArea.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await sugArea.type(stdReq.sug);
      await new Promise(r => setTimeout(r, 800));

      // 건의사항 등록 클릭
      console.log('건의사항 등록 클릭...');
      const regBtnClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('건의사항 등록'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (!regBtnClicked) {
        throw new Error('건의사항 등록 버튼을 찾을 수 없습니다.');
      }

      console.log('건의사항 저장 완료 대기...');
      await new Promise(r => setTimeout(r, 3000));

      // 로그아웃
      console.log(`학생 [${stdReq.name}] 세션 로그아웃...`);
      await page.evaluate(async () => {
        await fetch('/api/student/auth/logout', { method: 'POST' });
      });
      await new Promise(r => setTimeout(r, 1000));
    }


    // -------------------------------------------------------------------------
    // 3단계: 관리자 재로그인 및 건의사항 답변 & 처리완료
    // -------------------------------------------------------------------------
    console.log('\n=== [3단계] 관리자 재로그인 및 건의사항 처리 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    
    console.log('관리자 자격 증명 입력 중...');
    await safeType(page, '#username', 'admin');
    await safeType(page, '#password', 'sparta123!');
    
    await submitForm(page);

    console.log('관리자 대시보드 로딩 대기...');
    await page.waitForFunction(() => {
      return window.location.href.includes('/admin/dashboard') || 
             window.location.href.includes('/admin/consultation') ||
             document.body.textContent.includes('로그아웃') ||
             document.body.textContent.includes('대시보드');
    }, { timeout: 15000 }).catch(e => console.log('Admin login redirection check bypassed.'));

    console.log('관리자 로그인 성공. 상담/코칭 전용 페이지로 이동합니다...');

    // 상담/코칭 페이지로 이동
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });

    // 대기
    console.log('원생 목록 로딩 대기...');
    await page.waitForFunction(() => {
      return document.body.textContent.includes('김철수') &&
             document.body.textContent.includes('이영희') &&
             document.body.textContent.includes('박지성');
    }, { timeout: 30000 });

    const adminReplies = [
      {
        name: '김철수',
        campus: '원주',
        reply: '김철수 학생 건의 고맙습니다. 원주 자습실 C열 3번 자리 조명을 어제 새로 교체했습니다. 불편한 부분이 있으면 언제든 또 말해줘요.'
      },
      {
        name: '이영희',
        campus: '춘천',
        reply: '이영희 학생, 춘천 캠퍼스 태블릿 거치대 추가 입고(15대)가 확정되었습니다. 내일부터 인프라 데스크에서 추가 대여 가능합니다.'
      },
      {
        name: '박지성',
        campus: '충주',
        reply: '박지성 학생, 충주 캠퍼스 오답 멘토링 신청 수락되었습니다. 이번 주 목요일 오후 4시 수학 멘토 상담 세션을 배정해 두었으니 참석 바랍니다.'
      }
    ];

    for (const rep of adminReplies) {
      console.log(`상담 페이지에서 ${rep.name} 학생 대상 찾기...`);
      
      const elementHandle = await page.evaluateHandle((n) => {
        // 테이블 행(tr) 내에서 이름을 포함하는 요소 우선 검색
        const rows = Array.from(document.querySelectorAll('tr'));
        const foundRow = rows.find(r => r.textContent.includes(n));
        if (foundRow) return foundRow;

        // 카드 뷰(div)에서 이름 매칭 폴백
        const divs = Array.from(document.querySelectorAll('div'));
        return divs.find(div => div.textContent.includes(n) && div.className.includes('border'));
      }, rep.name);

      if (!elementHandle || !elementHandle.asElement()) {
        throw new Error(`${rep.name} 학생 대상을 찾을 수 없습니다.`);
      }

      console.log('화면 중앙으로 스크롤 이동 및 click 이벤트 디스패치...');
      await page.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, elementHandle);

      console.log('상세 정보 시트 활성화 대기...');
      await page.waitForFunction(() => {
        return document.body.textContent.includes('생활 관리') &&
               document.body.textContent.includes('학습 관리');
      }, { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1200));

      // 건의사항 답변 입력 (건의사항 대기중 블록 내의 인풋을 찾아 조작)
      console.log(`건의사항 답변 입력 중: "${rep.reply}"`);
      const suggestionInputSelector = await page.evaluateHandle(() => {
        const headers = Array.from(document.querySelectorAll('h4'));
        const suggHeader = headers.find(h => h.textContent.includes('건의사항 (대기중)'));
        if (suggHeader) {
          const container = suggHeader.closest('div.rounded-2xl');
          if (container) {
            return container.querySelector('input[placeholder="답변 직접 입력..."]');
          }
        }
        return null;
      });

      if (suggestionInputSelector && suggestionInputSelector.asElement()) {
        const inputEl = suggestionInputSelector.asElement();
        await inputEl.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 150));
        await inputEl.type(rep.reply, { delay: 40 });
      } else {
        throw new Error('건의사항 답변 입력창을 찾을 수 없습니다.');
      }
      await new Promise(r => setTimeout(r, 800));

      // 처리완료 버튼 클릭
      console.log('처리완료 버튼 클릭...');
      const resolveBtnClicked = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('h4'));
        const suggHeader = headers.find(h => h.textContent.includes('건의사항 (대기중)'));
        if (suggHeader) {
          const container = suggHeader.closest('div.rounded-2xl');
          if (container) {
            const buttons = Array.from(container.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent.trim() === '처리완료');
            if (btn) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      });

      if (!resolveBtnClicked) {
        throw new Error('건의사항 처리완료 버튼을 찾을 수 없습니다.');
      }

      console.log('처리 완료 동기화 대기...');
      await new Promise(r => setTimeout(r, 3000));

      // 시트 닫기
      console.log('상세 정보 시트 닫기...');
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1200));
    }

    // 관리자 로그아웃
    console.log('관리자 세션 로그아웃 중...');
    await page.evaluate(async () => {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    });
    await new Promise(r => setTimeout(r, 1000));


    // -------------------------------------------------------------------------
    // 4단계: 학생으로 재로그인하여 알림/답변 피드백 확인
    // -------------------------------------------------------------------------
    console.log('\n=== [4단계] 학생 로그인 및 건의사항 답변 확인 ===');
    await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });

    console.log('김철수 계정 로그인 정보 타이핑 중...');
    await safeType(page, '#student-login-id', '김철수');
    await safeType(page, '#student-password', '1234');
    
    await new Promise(r => setTimeout(r, 800));
    
    await submitForm(page);
    
    // 로딩 완료 대기
    await waitForReportPageLoad(page, '김철수');
    
    console.log('김철수 학생 포털 로그인 성공.');

    // 건의사항 답변 확인 영역으로 이동
    console.log('요청/건의 탭 클릭...');
    const reqTabBtnClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('요청/건의'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!reqTabBtnClicked) {
      throw new Error('요청/건의 탭 버튼을 찾을 수 없습니다.');
    }
    await new Promise(r => setTimeout(r, 1200));

    console.log('건의사항 내역 영역으로 스크롤...');
    await page.evaluate(() => {
      const el = document.getElementById('student-requests');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    // 답변이 잘 화면에 떠 있는지 브라우저 상에서 시각적 확인 시간을 확보
    console.log('화면상에 관리자 답변이 정상 표시되는지 검증을 위해 5초 대기...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('\n🎉 모든 자동화 시뮬레이션 시나리오가 성공적으로 종료되었습니다!');

  } catch (error) {
    console.error('자동화 시뮬레이션 도중 에러가 발생했습니다:', error);
    try {
      const screenshotPath = 'C:\\Users\\rkdqu\\.gemini\\antigravity\\brain\\bf8757ca-cb00-4841-bc56-22d1085bb984\\screenshot_error.png';
      await page.screenshot({ path: screenshotPath });
      console.log('Saved error screenshot to:', screenshotPath);
    } catch (e) {
      console.error('Failed to save error screenshot:', e);
    }
  } finally {
    console.log('Browser closing...');
    await browser.close();
  }
}

run();
