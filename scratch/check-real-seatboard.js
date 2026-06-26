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
    
    console.log('Waiting for student cards to render...');
    await tab.waitForSelector('[data-seat-card="occupied"]', { timeout: 15000 });
    
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('Taking screenshot...');
    await tab.screenshot({ path: path.join(__dirname, 'real_seat_board.png') });
    
    console.log('Parsing Hong Gil-ttong card...');
    const cardData = await tab.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-seat-card="occupied"]'));
      const target = cards.find(c => c.getAttribute('data-student-name') === '홍길똥');
      if (!target) return null;
      
      const studentId = target.getAttribute('data-student-id');
      const studentName = target.getAttribute('data-student-name');
      const unauthorizedCheckout = target.getAttribute('data-unauthorized-checkout');
      
      const cells = Array.from(target.querySelectorAll('[data-period-label]'));
      const periods = cells.map(cell => {
        const label = cell.getAttribute('data-period-label');
        const isExpectedAbsent = cell.getAttribute('data-expected-absent') === 'true';
        const text = cell.textContent.trim();
        const awayTime = cell.getAttribute('data-away-time');
        return { label, isExpectedAbsent, text, awayTime };
      });
      
      const phoneBoxes = Array.from(target.querySelectorAll('div[title*="미제출"]'));
      const phones = phoneBoxes.map(box => box.textContent.trim());
      
      return { studentId, studentName, unauthorizedCheckout, periods, phones };
    });
    
    console.log('\n--- REAL CHOI DA-EUN CARD DATA ---');
    if (cardData) {
      console.log(JSON.stringify(cardData, null, 2));
    } else {
      console.log('최다은 학생 카드를 화면에서 찾을 수 없습니다!');
    }
    
  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await browser.close();
  }
}

run();
