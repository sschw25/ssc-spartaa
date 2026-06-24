const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 강인한 타이핑 헬퍼 함수
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

  await page.type(selector, text, { delay: 40 });
  await new Promise(r => setTimeout(r, 200));

  // 검증 로직
  const actualVal = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.value : '';
  }, selector);

  if (actualVal !== text) {
    console.log(`[Warning] Value mismatch on ${selector}. Expected "${text}" but got "${actualVal}". Fallback injection...`);
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
        el.blur();
      }
    }, selector, text);
    await new Promise(r => setTimeout(r, 800));
  }
}

// 폼 직접 제출
async function submitForm(page) {
  const submitted = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      return true;
    }
    return false;
  });
  if (!submitted) {
    await page.click('button[type="submit"]');
  }
  await new Promise(r => setTimeout(r, 1000));
}

// 학생 리포트 페이지 로딩 대기
async function waitForReportPageLoad(page, studentName) {
  console.log(`[${studentName}] 결과지 페이지 로딩 대기 중... 현재 URL: ${page.url()}`);
  
  const bodyText = await page.evaluate(() => document.body.textContent);
  if (bodyText.includes('올바르지 않습니다') || bodyText.includes('실패')) {
    console.error(`[Error] 로그인 에러 감지됨! 화면 텍스트: ${bodyText.substring(0, 100)}`);
  }

  try {
    await page.waitForFunction(() => window.location.href.includes('/report/'), { timeout: 10000 });
  } catch (err) {
    const currentUrl = page.url();
    const htmlSnippet = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
    console.error(`[Timeout Error] /report/ 리다이렉트 실패. 현재 URL: ${currentUrl}`);
    console.error(`화면 HTML 요약: ${htmlSnippet}`);
    throw err;
  }

  await page.waitForFunction(() => {
    return !document.body.textContent.includes('결과 리포트 카드 불러오는 중') &&
           !document.body.textContent.includes('불러오는 중');
  }, { timeout: 15000 });
  
  await page.waitForFunction((name) => {
    return document.body.textContent.includes('반차 신청') &&
           document.body.textContent.includes(name);
  }, { timeout: 15000 }, studentName);
  console.log(`[${studentName}] 결과지 페이지 로딩 완료! 현재 URL: ${page.url()}`);
}

// 학습 계획 변경 신청을 전송하는 헬퍼
async function sendChangePlanRequest(page, materialName, goalType, goalValue, proposedWeek, proposedRange, message) {
  console.log("탭에서 '반차 신청' 클릭...");
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('반차 신청'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const el = document.getElementById('student-requests');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));

  console.log("직접 작성하기 클릭...");
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('직접 작성하기') || b.textContent.includes('직접 작성 닫기'));
    if (btn && btn.textContent.includes('직접 작성하기')) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  console.log("학습계획 분류 선택...");
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      const buttons = Array.from(form.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('학습계획'));
      if (btn) btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 800));

  console.log(`대상 학습자료 선택: ${materialName}`);
  await page.waitForSelector('select.request-material-select');
  await page.evaluate((mName) => {
    const select = document.querySelector('select.request-material-select');
    if (select) {
      const option = Array.from(select.options).find(opt => opt.textContent.includes(mName));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, materialName);
  await new Promise(r => setTimeout(r, 1000));

  console.log(`목표 설정 방식 선택: ${goalType}`);
  await page.waitForSelector('select.request-goal-type-select');
  await page.evaluate((gType) => {
    const select = document.querySelector('select.request-goal-type-select');
    if (select) {
      select.value = gType;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, goalType);
  await new Promise(r => setTimeout(r, 800));

  console.log(`목표 수치 입력: ${goalValue}`);
  await page.waitForSelector('input.request-goal-value-input');
  await page.evaluate((val) => {
    const el = document.querySelector('input.request-goal-value-input');
    if (el) {
      el.focus();
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, goalValue);
  await new Promise(r => setTimeout(r, 800));

  if (proposedWeek && proposedRange) {
    console.log(`특정 주차 범위 정정 입력: ${proposedWeek}주차 - ${proposedRange}`);
    await page.waitForSelector('input.request-week-number-input');
    await page.evaluate((week, range) => {
      const wEl = document.querySelector('input.request-week-number-input');
      if (wEl) {
        wEl.focus();
        wEl.value = String(week);
        wEl.dispatchEvent(new Event('input', { bubbles: true }));
        wEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const rEl = document.querySelector('input.request-range-text-input');
      if (rEl) {
        rEl.focus();
        rEl.value = range;
        rEl.dispatchEvent(new Event('input', { bubbles: true }));
        rEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, proposedWeek, proposedRange);
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`코멘트 입력: "${message.substring(0, 20)}..."`);
  await page.waitForSelector('form textarea');
  await page.evaluate((msg) => {
    const el = document.querySelector('form textarea');
    if (el) {
      el.focus();
      el.value = msg;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, message);
  await new Promise(r => setTimeout(r, 800));

  console.log('신청하기 버튼 클릭...');
  await page.evaluate(() => {
    const el = document.getElementById('btn-submit-change-request');
    if (el) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  console.log('신청 대기...');
  await new Promise(r => setTimeout(r, 3000));
}

// 건의사항 작성 공통 헬퍼
async function addSuggestion(page, text) {
  console.log("탭에서 '반차 신청' 클릭...");
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('반차 신청'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const el = document.getElementById('student-requests');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));

  console.log(`건의사항 입력: "${text.substring(0, 20)}..."`);
  await page.waitForSelector('textarea[placeholder*="건의 내용을 적어 주세요"]');
  await page.evaluate((val) => {
    const el = document.querySelector('textarea[placeholder*="건의 내용을 적어 주세요"]');
    if (el) {
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, text);
  await new Promise(r => setTimeout(r, 800));

  await page.evaluate(() => {
    const el = document.getElementById('btn-submit-suggestion');
    if (el) el.click();
  });
  console.log('건의사항 저장 대기...');
  await new Promise(r => setTimeout(r, 3000));
}

// 관리자 건의사항 답변 및 처리완료 헬퍼
async function replyToSuggestion(page, studentName, replyText) {
  console.log(`상담 페이지에서 ${studentName} 학생 찾기 및 클릭...`);
  const elementHandle = await page.evaluateHandle((n) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const foundRow = rows.find(r => r.textContent.includes(n));
    if (foundRow) return foundRow;
    const divs = Array.from(document.querySelectorAll('div'));
    return divs.find(div => div.textContent.includes(n) && div.className.includes('border'));
  }, studentName);

  if (!elementHandle || !elementHandle.asElement()) {
    throw new Error(`${studentName} 학생 대상을 찾을 수 없습니다.`);
  }

  await page.evaluate((el) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, elementHandle);

  console.log('상세 정보 시트 활성화 대기...');
  await page.waitForFunction(() => {
    return document.body.textContent.includes('학생 정보') &&
           document.body.textContent.includes('학습 관리');
  }, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

  console.log('생활 관리 탭 클릭...');
  await page.evaluate(() => {
    const el = document.getElementById('admin-tab-consult');
    if (el) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  console.log(`건의사항 답변 입력: "${replyText.substring(0, 20)}..."`);
  const inputElHandle = await page.evaluateHandle(() => {
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

  if (inputElHandle && inputElHandle.asElement()) {
    const inputEl = inputElHandle.asElement();
    await inputEl.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 150));
    await inputEl.type(replyText, { delay: 40 });
  } else {
    throw new Error('건의사항 답변 입력창을 찾을 수 없습니다.');
  }
  await new Promise(r => setTimeout(r, 800));

  console.log('처리완료 버튼 클릭...');
  await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('h4'));
    const suggHeader = headers.find(h => h.textContent.includes('건의사항 (대기중)'));
    if (suggHeader) {
      const container = suggHeader.closest('div.rounded-2xl');
      if (container) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.trim() === '처리완료');
        if (btn) btn.click();
      }
    }
  });

  console.log('처리 완료 동기화 대기...');
  await new Promise(r => setTimeout(r, 3000));

  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1500));
}

// 관리자 학습계획 변경신청 승인 및 자동 계획 반영 헬퍼
async function approvePlanRequest(page, studentName, replyText) {
  console.log(`상담 페이지에서 ${studentName} 학생 찾기 및 클릭...`);
  const elementHandle = await page.evaluateHandle((n) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const foundRow = rows.find(r => r.textContent.includes(n));
    if (foundRow) return foundRow;
    const divs = Array.from(document.querySelectorAll('div'));
    return divs.find(div => div.textContent.includes(n) && div.className.includes('border'));
  }, studentName);

  if (!elementHandle || !elementHandle.asElement()) {
    throw new Error(`${studentName} 학생 대상을 찾을 수 없습니다.`);
  }

  await page.evaluate((el) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, elementHandle);

  console.log('상세 정보 시트 활성화 대기...');
  await page.waitForFunction(() => {
    return document.body.textContent.includes('학생 정보') &&
           document.body.textContent.includes('학습 관리');
  }, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

  console.log('생활 관리 탭 클릭...');
  await page.evaluate(() => {
    const el = document.getElementById('admin-tab-consult');
    if (el) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  console.log(`건의사항 답변 입력: "${replyText.substring(0, 20)}..."`);
  const inputElHandle = await page.evaluateHandle(() => {
    const headers = Array.from(document.querySelectorAll('h4'));
    const suggHeader = headers.find(h => h.textContent.includes('학생 변경 신청') || h.textContent.includes('건의사항 (대기중)'));
    if (suggHeader) {
      const container = suggHeader.closest('div.rounded-2xl');
      if (container) {
        return container.querySelector('input[placeholder="답변 직접 입력..."]');
      }
    }
    return null;
  });

  if (inputElHandle && inputElHandle.asElement()) {
    const inputEl = inputElHandle.asElement();
    await inputEl.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 150));
    await inputEl.type(replyText, { delay: 40 });
  } else {
    throw new Error('건의사항 답변 입력창을 찾을 수 없습니다.');
  }
  await new Promise(r => setTimeout(r, 800));

  console.log('승인 및 계획 반영 버튼 클릭...');
  await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('h4'));
    const suggHeader = headers.find(h => h.textContent.includes('학생 변경 신청') || h.textContent.includes('건의사항 (대기중)'));
    if (suggHeader) {
      const container = suggHeader.closest('div.rounded-2xl');
      if (container) {
        const buttons = Array.from(container.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.trim() === '승인 및 계획 반영');
        if (btn) btn.click();
      }
    }
  });

  console.log('처리 완료 동기화 대기...');
  await new Promise(r => setTimeout(r, 3000));

  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1500));
}

// 학생 로그아웃
async function studentLogout(page) {
  console.log('학생 세션 로그아웃...');
  await page.evaluate(async () => {
    await fetch('/api/student/auth/logout', { method: 'POST' });
  });
  await new Promise(r => setTimeout(r, 1000));
}

// 관리자 로그아웃
async function adminLogout(page) {
  console.log('관리자 세션 로그아웃...');
  await page.evaluate(async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
  });
  await new Promise(r => setTimeout(r, 1000));
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

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    slowMo: 100,
    defaultViewport: { width: 1440, height: 950 }
  });

  const page = await browser.newPage();
  
  page.on('dialog', async dialog => {
    console.log(`[Dialog] Type: ${dialog.type()}, Message: ${dialog.message()}`);
    await dialog.accept();
  });

  const studentName = '김철수';
  const studentId = 'std_seed_001';
  const screenshotDir = 'C:\\Users\\rkdqu\\.gemini\\antigravity\\brain\\ceb0ecc3-5575-4b78-95cd-fbeb57bc6b33';

  try {
    // ───────────────────────────────────────────
    // 0. 관리자 로그인 및 비밀번호 세팅
    // ───────────────────────────────────────────
    console.log('\n=== [Step 0] 관리자 로그인 및 학생 패스워드 설정 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#username', 'admin');
    await safeType(page, '#password', 'sparta123!');
    await submitForm(page);
    
    await new Promise(r => setTimeout(r, 2000));
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.textContent.includes('김철수'), { timeout: 30000 });
    
    console.log(`[API] ${studentName} 학생 비밀번호를 '1234'로 초기화...`);
    const pwdRes = await page.evaluate(async (sid) => {
      const res = await fetch(`/api/admin/students/${sid}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: '1234' }),
      });
      return await res.json();
    }, studentId);
    console.log('Password reset API result:', pwdRes);

    await new Promise(r => setTimeout(r, 1000));
    await adminLogout(page);

    // ───────────────────────────────────────────
    // 1회차: [학생] 국어 계획 단축 변경 건의 등록
    // ───────────────────────────────────────────
    console.log('\n=== [1회차] 학생: 국어 봉투모의고사 진도 단축 건의 ===');
    await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#student-login-id', studentName);
    await safeType(page, '#student-password', '1234');
    await submitForm(page);
    await waitForReportPageLoad(page, studentName);

    await sendChangePlanRequest(page, '봉투모의고사', 'dailyAmount', 5, 1, '1p ~ 50p', '원장님, 국어 봉투모의고사 분량을 하루 5페이지로 조절하고 1주차 범위를 1p ~ 50p로 축소해 주세요!');
    await studentLogout(page);

    // ───────────────────────────────────────────
    // 2회차: [관리자] 학습계획 변경신청 승인 및 자동 계획 반영
    // ───────────────────────────────────────────
    console.log('\n=== [2회차] 관리자: 변경신청 한 번에 승인 및 계획 자동 재생성 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#username', 'admin');
    await safeType(page, '#password', 'sparta123!');
    await submitForm(page);
    
    await new Promise(r => setTimeout(r, 2000));
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.textContent.includes('김철수'), { timeout: 30000 });

    const replyText = '철수 학생, 요청한 국어 봉투모의고사 일일 5p 목표 변경 및 1주차 1p ~ 50p 조정을 승인하여 계획표를 자동 재생성 완료했습니다. 화이팅!';
    await approvePlanRequest(page, studentName, replyText);
    await adminLogout(page);

    // ───────────────────────────────────────────
    // 3회차: [학생] 변경 계획 확인 및 뽀모도로 건의
    // ───────────────────────────────────────────
    console.log('\n=== [3회차] 학생: 변경된 계획표 시각적 확인 및 뽀모도로 건의 ===');
    await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#student-login-id', studentName);
    await safeType(page, '#student-password', '1234');
    await submitForm(page);
    await waitForReportPageLoad(page, studentName);

    // '과목별 진도' 탭을 클릭하여 변경 사항이 렌더링되었는지 확인
    console.log("과목별 진도 탭 클릭...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('과목별 진도'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // 화면에 '1p ~ 50p' 가 정상적으로 반영되어 있는지 확인
    const isPlanUpdatedOnStudentView = await page.evaluate(() => {
      return document.body.textContent.includes('1p ~ 50p');
    });
    console.log(`학생 뷰 상에서 1주차 수정된 범위('1p ~ 50p') 확인 여부: ${isPlanUpdatedOnStudentView}`);

    // 추가 건의 작성 (반차 신청 탭)
    await addSuggestion(page, '원장님, 변경해주신 1p ~ 50p 계획표 덕분에 이번 주 국어 모의고사를 깔끔하게 완독했습니다! 뽀모도로 자습 타이머도 목표 세션을 가뿐히 다 채웠어요. 추가로, 자습실 뽀모도로 타이머 화면에서 집중 완료 후 휴식 시간을 5분으로 직접 바꿀 수 있는 설정 기능도 꼭 추가가 가능할까요? 자습 템포를 높이고 싶습니다.');
    await studentLogout(page);

    // ───────────────────────────────────────────
    // 4회차: [관리자] 답변 등록
    // ───────────────────────────────────────────
    console.log('\n=== [4회차] 관리자: 2차 답변 등록 및 격려 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#username', 'admin');
    await safeType(page, '#password', 'sparta123!');
    await submitForm(page);
    
    await new Promise(r => setTimeout(r, 2000));
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.textContent.includes('김철수'), { timeout: 30000 });

    await replyToSuggestion(page, studentName, '철수 학생, 수정된 계획을 성실하게 완수한 점 대단히 칭찬합니다. 건의해준 뽀모도로 휴식 시간 5분 단축 설정 기능은 다음 업데이트 버전에 즉시 반영하겠습니다. 그리고 국어 점수 향상 폭도 아주 좋습니다! 계속 응원합니다.');
    await adminLogout(page);

    // ───────────────────────────────────────────
    // 5회차: [학생] 최종 확인 및 부모님 공유 링크 요청
    // ───────────────────────────────────────────
    console.log('\n=== [5회차] 학생: 부모님 공유 요청 등록 ===');
    await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#student-login-id', studentName);
    await safeType(page, '#student-password', '1234');
    await submitForm(page);
    await waitForReportPageLoad(page, studentName);

    await addSuggestion(page, '감사합니다 원장님! 기세를 이어가겠습니다. 이번 주에 공부한 뽀모도로 누적 타이머 기록과 조정한 계획의 완독 결과, 원장님의 피드백을 부모님께 보여드리고 안심시켜 드리고 싶습니다. 학부모 공유용 링크 발급을 신청합니다.');
    await studentLogout(page);

    // ───────────────────────────────────────────
    // 6. [관리자] 학부모 공유 링크 생성 (학생 정보 탭으로 수정 반영)
    // ───────────────────────────────────────────
    console.log('\n=== [Step 6] 관리자: 학부모 공유 링크 생성 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    await safeType(page, '#username', 'admin');
    await safeType(page, '#password', 'sparta123!');
    await submitForm(page);
    
    await new Promise(r => setTimeout(r, 2000));
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.textContent.includes('김철수'), { timeout: 30000 });

    console.log('상담 페이지에서 김철수 학생 클릭...');
    const elementHandleLast = await page.evaluateHandle(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      return rows.find(r => r.textContent.includes('김철수'));
    });
    
    await page.evaluate((el) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, elementHandleLast);

    console.log('시트 활성화 대기...');
    await page.waitForFunction(() => document.body.textContent.includes('학생 정보'), { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1200));

    console.log('학생 정보 탭 클릭...');
    await page.evaluate(() => {
      const el = document.getElementById('admin-tab-info');
      if (el) {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('학부모 공유 링크 확인 또는 생성 버튼 클릭...');
    
    // 이미 링크가 존재하는지 확인
    const alreadyExists = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('span'));
      const found = els.find(el => el.textContent.includes('/report/') && el.textContent.includes('token='));
      return !!found;
    });

    if (!alreadyExists) {
      console.log('기존 공유 링크가 없으므로 링크 생성 버튼 클릭...');
      const shareBtnText = '링크 생성 (7일 유효)';
      const clicked = await page.evaluate((btnTxt) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(btnTxt));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, shareBtnText);

      if (!clicked) {
        throw new Error('링크 생성 버튼을 찾을 수 없습니다.');
      }
      console.log('링크 생성 처리 및 동기화 대기...');
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log('이미 활성 공유 링크가 존재합니다. 생성을 건너뜁니다.');
    }

    const parentShareUrl = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('span'));
      const found = els.find(el => el.textContent.includes('/report/') && el.textContent.includes('token='));
      return found ? found.textContent.trim() : null;
    });

    console.log(`\n🔗 발급된 학부모 공유 링크: ${parentShareUrl}`);
    
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    await adminLogout(page);

    if (!parentShareUrl) {
      throw new Error('학부모 공유 링크를 획득하지 못했습니다.');
    }

    // ───────────────────────────────────────────
    // 7. 학부모 공유 링크 동작 확인 (비로그인)
    // ───────────────────────────────────────────
    console.log('\n=== [Step 7] 학부모: 공유 링크로 리포트 확인 ===');
    
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');

    console.log(`공유 링크로 이동: ${parentShareUrl}`);
    await page.goto(parentShareUrl, { waitUntil: 'domcontentloaded' });
    
    await new Promise(r => setTimeout(r, 5000));

    // 리포트 페이지 로딩 및 1p ~ 50p 수정사항이 노출되는지 확인
    const isReportLoaded = await page.evaluate(() => {
      return document.body.textContent.includes('김철수') &&
             document.body.textContent.includes('1p ~ 50p') &&
             !document.body.textContent.includes('로그인');
    });

    if (isReportLoaded) {
      console.log('✅ 학부모가 로그인 없이 공유 링크로 리포트 열람 성공 및 계획 수정사항 확인!');
      
      if (!fs.existsSync(screenshotDir)){
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const screenshotPath = path.join(screenshotDir, 'parent_report_view.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`Saved screenshot to: ${screenshotPath}`);
    } else {
      console.error('❌ 학부모 리포트 열람 실패 또는 비정상 화면 노출');
      const screenshotPath = path.join(screenshotDir, 'parent_report_fail.png');
      await page.screenshot({ path: screenshotPath });
    }

  } catch (error) {
    console.error('시뮬레이션 중 오류 발생:', error);
    try {
      if (!fs.existsSync(screenshotDir)){
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const errScreenshotPath = path.join(screenshotDir, 'screenshot_error.png');
      await page.screenshot({ path: errScreenshotPath });
      console.log('Saved error screenshot to:', errScreenshotPath);
    } catch (e) {
      console.error('Failed to save error screenshot:', e);
    }
  } finally {
    console.log('Browser closing...');
    await browser.close();
  }
}

run();
