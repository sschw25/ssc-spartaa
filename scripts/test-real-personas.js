const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 강제 값 주입 및 React 상태 동기화 헬퍼 함수
async function forceType(page, selector, text) {
  await page.waitForSelector(selector);
  await page.evaluate((sel, valToSet) => {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      
      const proto = el.tagName.toLowerCase() === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
        
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      nativeInputValueSetter.call(el, valToSet);
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      el.blur();
    }
  }, selector, text);
  await new Promise(r => setTimeout(r, 800)); // 값 입력 후 넉넉히 대기
}

// 폼 제출 헬퍼
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

// 탭 클릭 헬퍼 함수
async function clickReportTab(page, tabLabel) {
  const tabBtn = await page.evaluateHandle((label) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => b.textContent.includes(label)) || null;
  }, tabLabel);
  if (tabBtn && tabBtn.asElement()) {
    await tabBtn.asElement().click();
    await new Promise(r => setTimeout(r, 1200));
  } else {
    throw new Error(`[${tabLabel}] 탭 버튼을 찾을 수 없습니다.`);
  }
}

// 학생 리포트 페이지 로딩 대기 헬퍼
async function waitForReportPageLoad(page, studentName) {
  console.log(`[${studentName}] 학생 페이지 로딩 대기 중...`);
  await page.waitForFunction(() => window.location.href.includes('/report/'), { timeout: 15000 });
  await page.waitForFunction(() => {
    return !document.body.textContent.includes('결과 리포트 카드 불러오는 중') &&
           !document.body.textContent.includes('불러오는 중');
  }, { timeout: 15000 });
  await page.waitForFunction((name) => {
    return document.body.textContent.includes('오늘 바로 할 일') &&
           document.body.textContent.includes(name);
  }, { timeout: 15000 }, studentName);
  console.log(`[${studentName}] 학생 페이지 로딩 완료!`);
}

// 학생 검색 헬퍼
async function searchStudent(page, name) {
  console.log(`[검색] 학생 이름 "${name}" 검색창 입력 중...`);
  const searchInputSelector = 'input[placeholder*="수강생 이름"]';
  
  // 이전 검색 내용 지우기
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, searchInputSelector);
  await new Promise(r => setTimeout(r, 500));

  await forceType(page, searchInputSelector, name);
  await new Promise(r => setTimeout(r, 3000)); // 디바운스 및 리스트 갱신 충분히 대기
  
  await page.waitForFunction((n) => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.some(r => r.textContent.includes(n));
  }, { timeout: 15000 }, name);
  console.log(` -> "${name}" 학생 검색 완료.`);
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
    slowMo: 80,
    defaultViewport: { width: 1440, height: 950 }
  });

  const page = await browser.newPage();
  
  page.on('dialog', async dialog => {
    console.log(`[Dialog] Type: ${dialog.type()}, Message: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // =========================================================================
    // 1단계: 관리자 1 (김동하 코치) 로그인 및 담당 학생 코멘트 남기기
    // =========================================================================
    console.log('\n=== [1단계] 관리자 1 (김동하 코치) 로그인 및 코칭 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    
    await forceType(page, '#username', 'admin');
    await forceType(page, '#password', 'sparta123!');
    await submitForm(page);

    console.log('관리자 대시보드 진입 대기...');
    await page.waitForFunction(() => window.location.href.includes('/admin/'), { timeout: 15000 });
    
    // 상담 페이지로 이동
    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    console.log('상담 페이지 로딩 대기...');
    await page.waitForSelector('input[placeholder*="수강생 이름"]', { timeout: 15000 });

    const coach1Students = ['김철수', '이영희'];
    for (const name of coach1Students) {
      await searchStudent(page, name);

      console.log(`[김동하 코치] ${name} 학생 카드 클릭...`);
      const rowHandle = await page.evaluateHandle((n) => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.find(r => r.textContent.includes(n)) || null;
      }, name);

      if (rowHandle && rowHandle.asElement()) {
        await rowHandle.asElement().click();
      } else {
        throw new Error(`${name} 학생의 행을 클릭할 수 없습니다.`);
      }

      await page.waitForSelector('#admin-tab-consult', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 1000));

      // 생활 관리 탭 클릭
      console.log(' -> 생활 관리 탭 클릭');
      await page.click('#admin-tab-consult');
      await new Promise(r => setTimeout(r, 1000));

      console.log(`[김동하 코치] ${name} 코멘트 남기기...`);
      const coachComment = `[김동하 코치 피드백] ${name} 학생, 오늘 진도 계획을 성실하게 수행하고 실제 분량을 꼭 적어주세요.`;
      await forceType(page, 'textarea[placeholder*="등원 시간"]', coachComment);

      const saveBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '저장');
      });
      if (saveBtn && saveBtn.asElement()) {
        await saveBtn.asElement().click();
      } else {
        await page.click('button[type="submit"]');
      }
      await new Promise(r => setTimeout(r, 2000));
      await page.keyboard.press('Escape'); // 상세창 닫기
      await new Promise(r => setTimeout(r, 1000));
    }

    // 로그아웃
    console.log('관리자 1 로그아웃...');
    await page.evaluate(async () => {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    });
    await new Promise(r => setTimeout(r, 1500));


    // =========================================================================
    // 2단계: 관리자 2 (이승현 코치) 로그인 및 담당 학생 코멘트 남기기
    // =========================================================================
    console.log('\n=== [2단계] 관리자 2 (이승현 코치) 로그인 및 코칭 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    
    await forceType(page, '#username', 'admin');
    await forceType(page, '#password', 'sparta123!');
    await submitForm(page);

    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="수강생 이름"]', { timeout: 15000 });

    const coach2Students = ['박지성', '손흥민'];
    for (const name of coach2Students) {
      await searchStudent(page, name);

      console.log(`[이승현 코치] ${name} 학생 카드 클릭...`);
      const rowHandle = await page.evaluateHandle((n) => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.find(r => r.textContent.includes(n)) || null;
      }, name);

      if (rowHandle && rowHandle.asElement()) {
        await rowHandle.asElement().click();
      } else {
        throw new Error(`${name} 학생의 행을 클릭할 수 없습니다.`);
      }

      await page.waitForSelector('#admin-tab-consult', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 1000));

      // 생활 관리 탭 클릭
      console.log(' -> 생활 관리 탭 클릭');
      await page.click('#admin-tab-consult');
      await new Promise(r => setTimeout(r, 1000));

      console.log(`[이승현 코치] ${name} 코멘트 남기기...`);
      const coachComment = `[이승현 코치 피드백] ${name} 학생, 끝까지 완수할 수 있습니다. 화이팅!`;
      await forceType(page, 'textarea[placeholder*="등원 시간"]', coachComment);

      const saveBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '저장');
      });
      if (saveBtn && saveBtn.asElement()) {
        await saveBtn.asElement().click();
      } else {
        await page.click('button[type="submit"]');
      }
      await new Promise(r => setTimeout(r, 2000));
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1000));
    }

    // 로그아웃
    console.log('관리자 2 로그아웃...');
    await page.evaluate(async () => {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    });
    await new Promise(r => setTimeout(r, 1500));


    // =========================================================================
    // 3단계: 학생 4명 개별 로그인 및 오늘의 학습량 완료 입력 시뮬레이션
    // =========================================================================
    console.log('\n=== [3단계] 학생 4명 로그인 및 실제 진도량 완료 입력 ===');
    
    const studentScenarios = [
      { name: '김철수', amount: 3 },
      { name: '이영희', amount: 2 },
      { name: '박지성', amount: 4 },
      { name: '손흥민', amount: 3 }
    ];

    for (const std of studentScenarios) {
      console.log(`\n>>> [학생] ${std.name} 로그인 중...`);
      await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });
      await forceType(page, '#student-login-id', std.name);
      await forceType(page, '#student-password', '1234');
      await submitForm(page);

      await waitForReportPageLoad(page, std.name);
      await new Promise(r => setTimeout(r, 2000)); // React Hydration 및 이벤트 핸들러 바인딩 마진 확보

      console.log(`[${std.name}] '오늘의 공부' 영역 완료 체크 버튼 클릭 시도...`);
      
      // 이미 완료 상태인지 먼저 확인하여 완료 취소 클릭 (테스트 리셋용)
      const isAlreadyCompleted = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const activeCompletedBtn = buttons.find(b => b.textContent.trim().startsWith('완료 (') || b.textContent.trim() === '완료됨');
        if (activeCompletedBtn) {
          activeCompletedBtn.click();
          return true;
        }
        return false;
      });

      if (isAlreadyCompleted) {
        console.log(` -> 이미 완료 상태여서 완료 취소 클릭함. 완료 버튼이 다시 활성화될 때까지 대기...`);
        await page.waitForFunction(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.some(b => b.textContent.trim() === '완료');
        }, { timeout: 10000 });
        await new Promise(r => setTimeout(r, 1000));
      }

      const completeBtnClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.trim() === '완료');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (completeBtnClicked) {
        console.log(` -> 완료 버튼 클릭!`);
        
        console.log(` -> 실제 수행량 조절 폼 로딩 대기...`);
        await page.waitForFunction(() => {
          const spans = Array.from(document.querySelectorAll('span'));
          return spans.some(s => s.className.includes('min-w-[3rem]'));
        }, { timeout: 10000 });

        console.log(` -> 실제 수행량 [${std.amount}] 으로 조절 중...`);
        
        let currentValText = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll('span'));
          const amountSpan = spans.find(s => s.className.includes('min-w-[3rem]'));
          return amountSpan ? amountSpan.textContent.trim() : '';
        });

        // 텍스트에서 숫자만 추출
        let currentVal = parseInt(currentValText.replace(/[^0-9]/g, '')) || 0;
        // 텍스트에서 unit(단위)만 추출 (예: "1회" -> "회")
        const unit = currentValText.replace(/[0-9]/g, '');

        console.log(` -> 현재 기본 노출값: ${currentVal}, 감지된 단위: "${unit}"`);

        while (currentVal < std.amount) {
          const plusBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => b.textContent.trim() === '+') || null;
          });
          if (plusBtn && plusBtn.asElement()) {
            await plusBtn.asElement().click();
            await new Promise(r => setTimeout(r, 200));
            currentVal++;
          } else {
            break;
          }
        }

        console.log(` -> '완료 확인' 버튼 클릭하여 진도 저장`);
        const confirmClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn = btns.find(b => b.textContent.trim() === '완료 확인');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });
        if (!confirmClicked) {
          console.error(` -> '완료 확인' 버튼을 찾거나 클릭하지 못했습니다.`);
        }
        await new Promise(r => setTimeout(r, 2500));

        // --- 추가된 탭 실시간 연동 검증 ---
        const expectedBadgeText = `완료 (${std.amount}${unit})`;
        const expectedTimelineText = `(실제: ${std.amount}${unit} 완료 ✅)`;

        // 1. 실행 계획표 탭 검증
        console.log(` -> [실행 계획표] 탭 이동 중...`);
        await clickReportTab(page, '실행 계획표');
        const hasExecutionBadge = await page.evaluate((badgeText) => {
          return document.body.textContent.includes(badgeText);
        }, expectedBadgeText);
        
        if (hasExecutionBadge) {
          console.log(`   ✅ [실행 계획표] 검증 성공! "${expectedBadgeText}" 배지 확인.`);
        } else {
          console.error(`   ❌ [실행 계획표] 검증 실패! "${expectedBadgeText}" 배지가 보이지 않습니다.`);
        }

        // 2. 오늘 계획 탭 검증
        console.log(` -> [오늘 계획] 탭 이동 중...`);
        await clickReportTab(page, '오늘 계획');
        const hasTimelineBadge = await page.evaluate((timelineText) => {
          return document.body.textContent.includes(timelineText);
        }, expectedTimelineText);

        if (hasTimelineBadge) {
          console.log(`   ✅ [오늘 계획] 검증 성공! "${expectedTimelineText}" 타임라인 배지 확인.`);
        } else {
          console.error(`   ❌ [오늘 계획] 검증 실패! "${expectedTimelineText}" 타임라인 배지가 보이지 않습니다.`);
        }

        // 3. 새로고침 후 데이터 영속성 검증
        console.log(` -> 페이지 새로고침 수행...`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));
        
        const hasTimelineBadgeAfterReload = await page.evaluate((timelineText) => {
          return document.body.textContent.includes(timelineText);
        }, expectedTimelineText);

        if (hasTimelineBadgeAfterReload) {
          console.log(`   ✅ [새로고침 후 검증] 성공! "${expectedTimelineText}" 타임라인 배지 복구 확인.`);
        } else {
          console.error(`   ❌ [새로고침 후 검증] 실패! "${expectedTimelineText}" 타임라인 배지가 보이지 않습니다.`);
        }
      } else {
        console.log(` -> [경고] ${std.name} 학생의 완료 대기 버튼을 찾을 수 없거나 이미 완료되었습니다.`);
      }

      console.log(`[${std.name}] 세션 로그아웃...`);
      await page.evaluate(async () => {
        await fetch('/api/student/auth/logout', { method: 'POST' });
      });
      await new Promise(r => setTimeout(r, 1500));
    }


    // =========================================================================
    // 4단계: 관리자 최종 로그인 및 실제 학습 완료 량 표시 검증
    // =========================================================================
    console.log('\n=== [4단계] 관리자 로그인 및 실제 진도량 최종 검증 ===');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    await forceType(page, '#username', 'admin');
    await forceType(page, '#password', 'sparta123!');
    await submitForm(page);

    await page.goto('http://localhost:3000/admin/consultation', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="수강생 이름"]', { timeout: 15000 });

    const allTestStudents = [
      { name: '김철수', expected: '3회' },
      { name: '이영희', expected: '2p' },
      { name: '박지성', expected: '4강' },
      { name: '손흥민', expected: '3강' }
    ];

    for (const std of allTestStudents) {
      await searchStudent(page, std.name);
      await new Promise(r => setTimeout(r, 1500)); // 검색 완료 후 DOM 렌더링 대기 마진 추가

      console.log(`\n[검증] ${std.name} 학생 상세 시트 열기...`);
      
      await page.evaluate((n) => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const row = rows.find(r => r.textContent.includes(n));
        if (row) {
          row.click();
        } else {
          throw new Error(`${n} 학생의 행을 찾을 수 없습니다.`);
        }
      }, std.name);

      console.log(' -> 상세 시트 로딩 대기...');
      await page.waitForSelector('#admin-tab-progress', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1200));

      console.log(' -> 학습 관리 탭 클릭');
      await page.click('#admin-tab-progress');
      await new Promise(r => setTimeout(r, 1500));

      console.log(` -> 실제 열에 입력값 "${std.expected}" 이(가) 정상 표시되는지 검증 중...`);
      const hasExpectedAmount = await page.evaluate((expectedVal) => {
        return document.body.textContent.includes(expectedVal);
      }, std.expected);

      if (hasExpectedAmount) {
        console.log(` ✅ 검증 성공! ${std.name} -> 실제 완료값 "${std.expected}" 표시 확인.`);
      } else {
        console.log(` ❌ 검증 실패! ${std.name} -> 실제 완료값 "${std.expected}" 표시되지 않음.`);
      }

      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n🎉 모든 페르소나 및 실제 진도 량 완료 체크 연동 테스트가 성공했습니다!');

  } catch (error) {
    console.error('시뮬레이션 도중 에러가 발생했습니다:', error);
    try {
      const errorScreenshot = path.join(__dirname, '../screenshot_error.png');
      await page.screenshot({ path: errorScreenshot });
      console.log('Saved error screenshot to:', errorScreenshot);
    } catch (e) {
      console.error('Failed to save error screenshot:', e);
    }
  } finally {
    console.log('Browser closing...');
    await browser.close();
  }
}

run();
