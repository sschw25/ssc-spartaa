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

  const tab = await browser.newPage();
  
  try {
    console.log('Navigating to Admin Login...');
    await tab.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
    
    console.log('Logging in...');
    await tab.type('#username', 'admin');
    await tab.type('#password', 'sparta123!');
    await Promise.all([
      tab.click('button[type="submit"]'),
      tab.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    
    console.log('Navigating to Seat Board...');
    await tab.goto('http://localhost:3000/admin/seat-board', { waitUntil: 'networkidle2' });
    
    console.log('Waiting for student cards...');
    await tab.waitForSelector('[data-seat-card="occupied"]', { timeout: 15000 });
    
    // 홍길똥 카드 찾아서 클릭 (이름 기준)
    console.log('Clicking Hong Gil-ttong card...');
    const clicked = await tab.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-seat-card="occupied"]'));
      const target = cards.find(c => c.getAttribute('data-student-name') === '홍길똥');
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'center' });
        target.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) {
      throw new Error('홍길똥 카드를 찾지 못했습니다.');
    }
    
    // 상세 정보 시트 로딩 대기 (InfoTab이 마운트될 때까지)
    console.log('Waiting for detail sheet...');
    await tab.waitForSelector('input[value="홍길똥"]', { timeout: 10000 });
    
    // 정기외출 추가
    console.log('Adding away schedule: 14:30...');
    
    // 외출 시간 입력 필드 값을 14:30으로 설정
    await tab.evaluate(() => {
      // InfoTab 내의 외출 시간 input을 찾는다
      const inputs = Array.from(document.querySelectorAll('input[type="time"]'));
      // 첫 번째가 외출시간, 두 번째가 복귀시간
      if (inputs.length >= 1) {
        inputs[0].focus();
        inputs[0].value = '14:30';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // '추가' 버튼 클릭
    console.log('Clicking Add button...');
    await tab.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.textContent.trim() === '추가');
      if (addBtn) addBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // '수정 완료' 버튼 클릭 없이 즉시 저장되는지 검증
    console.log('Skipping "수정 완료" button click to verify real-time autosave...');
    await new Promise(r => setTimeout(r, 4000));
    
    // 화면 캡쳐
    await tab.screenshot({ path: path.join(__dirname, 'after_save_detail.png') });
    console.log('Saved screenshot after saving.');
    
  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await browser.close();
  }
}

run();
