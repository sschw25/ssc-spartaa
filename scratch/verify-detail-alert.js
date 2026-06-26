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
    defaultViewport: { width: 1440, height: 1000 }
  });

  const tab = await browser.newPage();
  
  // 브라우저 경고창(alert)이 뜨면 로그를 찍고 자동 수락
  tab.on('dialog', async dialog => {
    console.log(`[Alert Intercepted] Unexpected dialog appeared: ${dialog.message()}`);
    await dialog.accept();
  });
  try {
    tab.on('response', async response => {
      if (response.url().includes('/api/admin/attendance/today')) {
        try {
          const text = await response.text();
          console.log(`[API Response] /api/admin/attendance/today :\n${text.substring(0, 1500)}`);
        } catch (e) {
          // ignore
        }
      }
      if (response.url().includes('/api/admin/seat-board')) {
        try {
          const text = await response.text();
          console.log(`[API Response] /api/admin/seat-board :\n${text.substring(0, 1500)}`);
        } catch (e) {
          // ignore
        }
      }
    });

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
    
    console.log('Finding and clicking "미승인" badge/card...');
    const clicked = await tab.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-seat-card="occupied"]'));
      // 미승인 뱃지가 들어있는 카드를 찾거나 미승인 속성이 true인 카드를 찾음
      const unauthCard = cards.find(c => 
        c.getAttribute('data-unauthorized-checkout') === 'true' || 
        c.textContent.includes('미승인')
      );
      if (!unauthCard) return false;
      
      // 카드 전체 영역을 클릭하거나 이름 영역을 클릭하여 시트를 염
      // 여기서는 카드 본체를 클릭
      const clickableArea = unauthCard.querySelector('div') || unauthCard;
      clickableArea.click();
      return true;
    });
    
    if (clicked) {
      console.log('Clicked card. Waiting for Student Detail Sheet to open...');
      // 시트가 렌더링될 때까지 잠시 대기
      await new Promise(r => setTimeout(r, 3000));
      
      console.log('Checking details inside Student Detail Sheet...');
      const bannerResult = await tab.evaluate(() => {
        const sheet = document.querySelector('[role="dialog"]');
        if (!sheet) return { found: false, error: 'Sheet dialog container not found' };
        
        const bannerText = sheet.textContent || '';
        const hasAlertIcon = !!sheet.querySelector('svg');
        const hasUnauthText = bannerText.includes('미승인 조기 하원') && bannerText.includes('기록이 없습니다');
        
        // 닫기 버튼(X)이 배너 내에 잘 배치되었는지 확인
        // svg 아이콘을 포함하는 absolute button 형태
        const buttons = Array.from(sheet.querySelectorAll('button'));
        const closeBtn = buttons.find(b => b.getAttribute('title') === '알림 닫기');
        const hasCloseBtn = !!closeBtn;

        return {
          found: true,
          hasAlertIcon,
          hasUnauthText,
          hasCloseBtn,
          bannerTextContent: bannerText.substring(0, 500)
        };
      });
      
      console.log('E2E evaluation result:', bannerResult);
      
      // 배너 렌더링 캡처
      const screenshotPath = path.join(__dirname, 'detail-alert-rendered.png');
      await tab.screenshot({ path: screenshotPath });
      console.log(`Initial screenshot (with banner) saved to: ${screenshotPath}`);

      if (bannerResult.found && bannerResult.hasUnauthText && bannerResult.hasCloseBtn) {
        console.log('Clicking dismiss (X) button...');
        await tab.evaluate(() => {
          const sheet = document.querySelector('[role="dialog"]');
          const buttons = Array.from(sheet.querySelectorAll('button'));
          const closeBtn = buttons.find(b => b.getAttribute('title') === '알림 닫기');
          if (closeBtn) closeBtn.click();
        });

        // 닫기 후 배너 소멸 대기
        await new Promise(r => setTimeout(r, 1000));

        const dismissedResult = await tab.evaluate(() => {
          const sheet = document.querySelector('[role="dialog"]');
          if (!sheet) return false;
          const bannerText = sheet.textContent || '';
          const hasUnauthTextAfter = bannerText.includes('미승인 조기 하원') && bannerText.includes('기록이 없습니다');
          return !hasUnauthTextAfter; // 텍스트가 사라졌어야 true
        });

        console.log('Banner dismissal verification:', dismissedResult ? 'SUCCESS (Banner removed)' : 'FAILED (Banner still present)');
        
        // 닫기 후 캡처
        const dismissedScreenshotPath = path.join(__dirname, 'detail-alert-dismissed.png');
        await tab.screenshot({ path: dismissedScreenshotPath });
        console.log(`Dismissed screenshot saved to: ${dismissedScreenshotPath}`);

        if (dismissedResult) {
          console.log('\nResult: VERIFICATION PASSED! Detailed sheet alert banner is correct and dismiss button works.');
        } else {
          console.error('\nResult: VERIFICATION FAILED. Alert banner not dismissed.');
          process.exit(1);
        }
      } else {
        console.error('\nResult: VERIFICATION FAILED. Banner not found, incorrect content, or missing close button.');
        process.exit(1);
      }
    } else {
      console.log('\nResult: VERIFICATION BYPASSED. No student card is currently in "미승인" status.');
    }
    
  } catch (error) {
    console.error('Error occurred:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
