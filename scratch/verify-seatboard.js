const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

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
    headless: true,
    defaultViewport: { width: 1440, height: 950 }
  });

  const page = browser;
  const tab = await browser.newPage();
  
  try {
    console.log('Navigating to Seat Board Page (Demo Mode)...');
    await tab.goto('http://localhost:3000/admin/seat-board?demo=1', { waitUntil: 'networkidle2' });
    
    console.log('Waiting for student cards to render...');
    await tab.waitForSelector('[data-seat-card="occupied"]', { timeout: 10000 });
    
    // 2초 정도 대기
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Analyzing student cards...');
    const cardsData = await tab.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-seat-card="occupied"]'));
      return cards.map(card => {
        const studentId = card.getAttribute('data-student-id');
        const studentName = card.getAttribute('data-student-name');
        
        // 1~8교시 상태 분석
        const cells = Array.from(card.querySelectorAll('[data-period-label]'));
        const periods = cells.map(cell => {
          const label = cell.getAttribute('data-period-label');
          const isExpectedAbsent = cell.getAttribute('data-expected-absent') === 'true';
          const text = cell.textContent.trim();
          return { label, isExpectedAbsent, text };
        });
        
        // D/E/N 상태 분석
        // D, E, N 휴대폰 박스는 텍스트가 'x' 이거나 'D', 'E', 'N' 임
        const phoneBoxes = Array.from(card.querySelectorAll('div[title*="미제출"]'));
        const phones = phoneBoxes.map(box => {
          const text = box.textContent.trim();
          return text;
        });

        return { studentId, studentName, periods, phones };
      });
    });

    console.log('\n--- VERIFICATION RESULTS ---');
    let hasFailed = false;

    // 1. 금요일외출 (demo-away-return) 검증
    const awayReturn = cardsData.find(c => c.studentId === 'demo-away-return');
    if (awayReturn) {
      console.log(`\n[검증 1] ${awayReturn.studentName} (정기외출 금요일 14:30)`);
      console.log('교시 표시:', awayReturn.periods.map(p => `${p.label}교시: ${p.text} (Absent: ${p.isExpectedAbsent})`).join(', '));
      console.log('휴대폰 상태:', awayReturn.phones.join(', '));

      // 14:30부터 외출이므로, 3~7교시는 X 여야 함. 1~2교시는 출석 또는 일반 상태.
      // 3교시 idx=2, 4교시 idx=3, 5교시 idx=4, 6교시 idx=5, 7교시 idx=6
      const expectedXIdxs = [2, 3, 4, 5, 6];
      const correctPeriods = expectedXIdxs.every(idx => awayReturn.periods[idx].text === 'X' && awayReturn.periods[idx].isExpectedAbsent);
      if (!correctPeriods) {
        console.error('FAIL: 3~7교시 중 X 표시가 누락된 곳이 있습니다.');
        hasFailed = true;
      } else {
        console.log('PASS: 3~7교시가 정상적으로 X로 표시됩니다.');
      }

      // 휴대폰 D/E/N 검증
      // E(3,4,5교시), N(6,7교시)은 외출이 겹치므로 x여야 함.
      // D(1,2교시)는 정상(출석)이므로 D여야 함.
      const correctPhones = awayReturn.phones[0] === 'D' && awayReturn.phones[1] === 'x' && awayReturn.phones[2] === 'x';
      if (!correctPhones) {
        console.error(`FAIL: 휴대폰 상태가 예상(D, x, x)과 다릅니다. 실제: ${awayReturn.phones.join(', ')}`);
        hasFailed = true;
      } else {
        console.log('PASS: 휴대폰 상태가 D, x, x 로 정상 표시됩니다.');
      }
    } else {
      console.error('FAIL: demo-away-return 학생 카드를 찾을 수 없습니다.');
      hasFailed = true;
    }

    // 2. 휴가하루 (demo-fullday) 검증
    const fullday = cardsData.find(c => c.studentId === 'demo-fullday');
    if (fullday) {
      console.log(`\n[검증 2] ${fullday.studentName} (승인된 하루 휴가)`);
      console.log('교시 표시:', fullday.periods.map(p => `${p.label}교시: ${p.text}`).join(', '));
      console.log('휴대폰 상태:', fullday.phones.join(', '));

      // 1~7교시는 전부 X, 8교시는 A여야 함
      const correct1to7 = fullday.periods.slice(0, 7).every(p => p.text === 'X');
      const correct8 = fullday.periods[7].text === 'A';
      if (correct1to7 && correct8) {
        console.log('PASS: 1~7교시는 X, 8교시는 A로 정상 표시됩니다.');
      } else {
        console.error('FAIL: 휴가 학생의 교시 표시 규칙이 맞지 않습니다.');
        hasFailed = true;
      }

      // 휴대폰 상태 검증: D, E, N 모두 x여야 함
      const correctPhones = fullday.phones.every(p => p === 'x');
      if (correctPhones) {
        console.log('PASS: 휴대폰 보관 상태 D, E, N이 전부 x로 정상 표시됩니다.');
      } else {
        console.error(`FAIL: 휴대폰 상태가 예상(x, x, x)과 다릅니다. 실제: ${fullday.phones.join(', ')}`);
        hasFailed = true;
      }
    } else {
      console.error('FAIL: demo-fullday 학생 카드를 찾을 수 없습니다.');
      hasFailed = true;
    }

    // 3. 승인오후하원 (demo-approved-half) 검증
    const approvedHalf = cardsData.find(c => c.studentId === 'demo-approved-half');
    if (approvedHalf) {
      console.log(`\n[검증 3] ${approvedHalf.studentName} (오후 반차 및 13:10 하원)`);
      console.log('교시 표시:', approvedHalf.periods.map(p => `${p.label}교시: ${p.text}`).join(', '));
      console.log('휴대폰 상태:', approvedHalf.phones.join(', '));

      // 1, 2교시: 출석(/ 또는 0900), 3,4,5교시: 오후 반차(X), 6,7교시: 조기하원(X), 8교시: A
      const correctPeriods = 
        (approvedHalf.periods[0].text === '/' || approvedHalf.periods[0].text === '0900') && 
        approvedHalf.periods[1].text === '/' &&
        approvedHalf.periods[2].text === 'X' &&
        approvedHalf.periods[3].text === 'X' &&
        approvedHalf.periods[4].text === 'X' &&
        approvedHalf.periods[5].text === 'X' &&
        approvedHalf.periods[6].text === 'X' &&
        approvedHalf.periods[7].text === 'A';

      if (correctPeriods) {
        console.log('PASS: 1~2교시 출석(또는 등원), 3~7교시 X, 8교시 A로 정상 표시됩니다.');
      } else {
        console.error('FAIL: 오후 반차/조기하원 학생의 교시 표시 규칙이 맞지 않습니다.');
        hasFailed = true;
      }

      // 휴대폰 검증: D, x, x
      const correctPhones = approvedHalf.phones[0] === 'D' && approvedHalf.phones[1] === 'x' && approvedHalf.phones[2] === 'x';
      if (correctPhones) {
        console.log('PASS: 휴대폰 보관 상태가 D, x, x 로 정상 표시됩니다.');
      } else {
        console.error(`FAIL: 휴대폰 상태가 예상(D, x, x)과 다릅니다. 실제: ${approvedHalf.phones.join(', ')}`);
        hasFailed = true;
      }
    } else {
      console.error('FAIL: demo-approved-half 학생 카드를 찾을 수 없습니다.');
      hasFailed = true;
    }

    // 4. 미승인조기하원 (demo-unauthorized) 검증
    const unauthorized = cardsData.find(c => c.studentId === 'demo-unauthorized');
    if (unauthorized) {
      console.log(`\n[검증 4] ${unauthorized.studentName} (17:30 미승인 조기 하원)`);
      console.log('교시 표시:', unauthorized.periods.map(p => `${p.label}교시: ${p.text}`).join(', '));
      console.log('휴대폰 상태:', unauthorized.phones.join(', '));

      // 1~5교시 출석(/ 또는 등하원시각), 6,7교시 조기하원(X), 8교시 A
      const correctPeriods = 
        (unauthorized.periods[0].text === '/' || unauthorized.periods[0].text === '0900') &&
        unauthorized.periods[1].text === '/' &&
        unauthorized.periods[2].text === '/' &&
        unauthorized.periods[3].text === '/' &&
        (unauthorized.periods[4].text === '/' || unauthorized.periods[4].text === '1730') &&
        unauthorized.periods[5].text === 'X' &&
        unauthorized.periods[6].text === 'X' &&
        unauthorized.periods[7].text === 'A';
      
      if (correctPeriods) {
        console.log('PASS: 1~5교시 출석(또는 등하원시각), 6~7교시 X, 8교시 A로 정상 표시됩니다.');
      } else {
        console.error('FAIL: 미승인 조기하원 학생의 교시 표시 규칙이 맞지 않습니다.');
        hasFailed = true;
      }

      // 휴대폰: D, E, x (6, 7교시가 비어있으므로 N이 x여야 함)
      const correctPhones = unauthorized.phones[0] === 'D' && unauthorized.phones[1] === 'E' && unauthorized.phones[2] === 'x';
      if (correctPhones) {
        console.log('PASS: 휴대폰 보관 상태가 D, E, x 로 정상 표시됩니다.');
      } else {
        console.error(`FAIL: 휴대폰 상태가 예상(D, E, x)과 다릅니다. 실제: ${unauthorized.phones.join(', ')}`);
        hasFailed = true;
      }
    } else {
      console.error('FAIL: demo-unauthorized 학생 카드를 찾을 수 없습니다.');
      hasFailed = true;
    }

    if (hasFailed) {
      console.log('\nResult: VERIFICATION FAILED.');
      process.exit(1);
    } else {
      console.log('\nResult: ALL VERIFICATION PASSED SUCCESSFULLY!');
    }

  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
