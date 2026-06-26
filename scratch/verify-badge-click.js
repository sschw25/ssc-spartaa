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
  
  let dialogMessage = '';
  tab.on('dialog', async dialog => {
    dialogMessage = dialog.message();
    console.log(`[Alert Intercepted] Message:\n${dialogMessage}`);
    await dialog.accept();
  });
  
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
    
    console.log('Waiting for cards...');
    await tab.waitForSelector('[data-seat-card="occupied"]', { timeout: 15000 });
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Finding and clicking "미승인" badge...');
    const badgeClicked = await tab.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-seat-card="occupied"]'));
      // 미승인 속성이 있거나 미승인 텍스트 배지가 있는 카드를 찾는다.
      const unauthCard = cards.find(c => c.getAttribute('data-unauthorized-checkout') === 'true' || c.textContent.includes('미승인'));
      if (!unauthCard) return false;
      
      // 카드 내부의 "미승인" 배지 span을 찾는다
      const spans = Array.from(unauthCard.querySelectorAll('span'));
      const unauthBadge = spans.find(s => s.textContent.trim() === '미승인');
      if (unauthBadge) {
        unauthBadge.click();
        return true;
      }
      return false;
    });
    
    if (badgeClicked) {
      console.log('Clicked "미승인" badge. Waiting for alert verification...');
      await new Promise(r => setTimeout(r, 2000));
      
      if (dialogMessage.includes('미승인 조기 하원') && dialogMessage.includes('퇴실하였으나')) {
        console.log('\nResult: VERIFICATION PASSED! Detailed alert content is correct.');
      } else {
        console.error(`\nResult: VERIFICATION FAILED. Alert message is missing details. Message: ${dialogMessage}`);
        process.exit(1);
      }
    } else {
      console.log('\nResult: VERIFICATION BYPASSED. No student card is currently in "미승인" status.');
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
