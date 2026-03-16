const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const { spawn } = require("child_process");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
require('dotenv').config({ path: 'bot.env' });

let browser = null;
let browserProcess = null;

// ฟังก์ชัน retry เชื่อมต่อจนกว่าจะสำเร็จ
async function waitForBrowser(url, maxRetries = 10, delay = 1000) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await fetch(`${url}/json/version`);
      if (res.ok) {
        console.log(`✅ Browser พร้อมแล้ว (ลองครั้งที่ ${i})`);
        return true;
      }
    } catch {
      console.log(`⏳ รอ Browser... (${i}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('❌ Browser ไม่ตอบสนองภายในเวลาที่กำหนด');
}
async function speakAndRecord(text, voiceIndex) {
  try {

    // สร้าง random profile name แทน %RANDOM%
    const randomId = Math.floor(Math.random() * 32767);
    const profilePath = `C:\\Users\\Tawan\\Desktop\\Code\\n8n\\TTS\\temp\\profile-${randomId}`;

    // ใช้ spawn แทน execSync เพื่อไม่ให้ block
    const browserPath = `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`;

    const browserProcess = spawn(browserPath, [
      '--remote-debugging-port=9222',
      `--user-data-dir=${profilePath}`,
      '--no-first-run',           // ✅ ข้าม welcome screen
      '--no-default-browser-check',
      '--disable-extensions',    // ✅ ลด interference
      '--force-device-scale-factor=0.8',  // ✅ ซูม 80%
    ], {
      detached: true,   // ให้ browser ทำงานอิสระจาก Node process
      stdio: 'ignore'   // ไม่รับ output จาก browser
    });

    browserProcess.unref(); // ปล่อยให้ Node.js จบได้โดยไม่ต้องรอ browser

    console.log(`เปิด Brave Browser สำเร็จ (PID: ${browserProcess.pid})`);
    console.log(`Profile: ${profilePath}`);
    console.log(`Remote Debugging: http://localhost:9222`);

    // ✅ รอจนกว่า browser จะพร้อมจริงๆ (ไม่ใช่แค่ setTimeout)
    await waitForBrowser('http://127.0.0.1:9222');

    console.log('กำลังเชื่อมต่อไปยัง Chrome ที่เปิดไว้ (Port 9222)...');
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });
    const pages = await browser.pages();

    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.deleteCookie(...await page.cookies());

    await page.bringToFront();

    console.log('1. กำลังไปที่หน้าเว็บ ElevenLabs...');
    await page.goto('https://elevenlabs.io/', { waitUntil: 'networkidle2' });

    console.log('2. กำลังเลือก Voice Actor...', voiceIndex);
    const voiceSelector = '.tw-w-full.tw-relative.tw-snap-start';

    await page.waitForSelector(voiceSelector);
    const voiceItems = await page.$$(voiceSelector);
    console.log('พบ voiceItems ทั้งหมด:', voiceItems.length); // ← ดูว่าเจอกี่อัน

    if (voiceItems.length >= voiceIndex + 1) {
      const label = await voiceItems[voiceIndex].$('label');
      console.log('label:', label ? 'เจอ' : 'ไม่เจอ'); // ← ดูว่าเจอ label ไหม

      if (label) {
        const box = await label.boundingBox();
        console.log('boundingBox:', box); // ← ดูว่า box เป็น null ไหม

        if (box) {
          const targetX = box.x + (box.width / 2);
          const targetY = box.y + (box.height / 2);
          console.log('คลิกที่:', targetX, targetY); // ← ดูพิกัด
          await page.mouse.move(targetX, targetY, { steps: 20 });
          await page.mouse.click(targetX, targetY);
          console.log('คลิกแล้ว ✅');
        }
      }
    } else {
      console.log(`voiceIndex ${voiceIndex} เกินจำนวน items (${voiceItems.length})`); // ← index เกินหรือเปล่า
    }

    console.log('3. กำลังพิมพ์ข้อความ...');
    const textAreaSelector = 'textarea[aria-label*="Enter your text"]';
    await page.waitForSelector(textAreaSelector);

    const textArea = await page.$(textAreaSelector);
    const taBox = await textArea.boundingBox();
    if (taBox) await page.mouse.click(taBox.x + 10, taBox.y + 10);

    await page.click(textAreaSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    console.log(`-> พิมพ์ข้อความ: "${text}"`);
    await page.type(textAreaSelector, text);

    console.log('▶️ กำลังกดปุ่ม Play บนหน้าเว็บ...');
    const playBtnSelector = 'button[aria-label="Play"]';
    const pauseBtnSelector = 'button[aria-label="Pause"]';
    await page.waitForSelector(playBtnSelector);
    const playBtn = await page.$(playBtnSelector);
    const pbBox = await playBtn.boundingBox();

    if (pbBox) {
      const targetX = pbBox.x + (pbBox.width / 2);
      const targetY = pbBox.y + (pbBox.height / 2);
      await page.mouse.move(targetX, targetY, { steps: 20 });
      await page.mouse.click(targetX, targetY);

      await page.waitForSelector(pauseBtnSelector);

      console.log('⏳ กำลังอัดเสียง...');

      const recorder = spawn("outDebug.exe", [], {
        windowsHide: false,
        stdio: ['pipe', 'inherit', 'inherit']
      });

      console.log('⏳ รอให้เว็บพูดจบ...');

      await page.waitForSelector(pauseBtnSelector, { hidden: true });

      console.log('✅ เว็บพูดจบแล้ว');

      recorder.stdin.write('\n');
      await new Promise(r => setTimeout(r, 0));

      console.log('⏹️ สั่งหยุดอัดเสียง...');

    }

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    // 1. ปิด Puppeteer ก่อน
    if (browser) await browser.close();

    // 2. รอให้ browserProcess จบสนิท
    if (browserProcess) {
      await new Promise((resolve) => {
        browserProcess.on('close', resolve);  // รอ event 'close'
        browserProcess.kill();
        setTimeout(resolve, 3000);            // timeout กันค้าง 3 วิ
      });
    }

    // 3. รอเพิ่มอีกนิด ให้ Windows ปล่อย file lock
    await new Promise(r => setTimeout(r, 1500));

    // 4. ลบ temp
    const fs = require('fs');
    const tempPath = 'C:\\Users\\Tawan\\Desktop\\Code\\n8n\\TTS\\temp';
    try {
      fs.rmSync(tempPath, { recursive: true, force: true });
      console.log('✅ ลบ temp เรียบร้อย');
    } catch (err) {
      // ถ้ายังลบไม่ได้ → ลองใช้ taskkill ก่อน
      console.warn('⚠️ ลบไม่ได้ตรงๆ กำลัง force kill...');
      const { execSync } = require('child_process');
      try {
        execSync('taskkill /F /IM brave.exe /T', { stdio: 'ignore' });
        await new Promise(r => setTimeout(r, 2000));
        fs.rmSync(tempPath, { recursive: true, force: true });
        console.log('✅ ลบ temp เรียบร้อย (หลัง force kill)');
      } catch (e) {
        console.error('❌ ลบ temp ไม่สำเร็จ:', e.message);
      }
    }
  }

}

// ── เรียกใช้ ──
// speakAndRecord("i want to test", 2);

module.exports = { speakAndRecord };

