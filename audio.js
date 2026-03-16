const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const { spawn } = require("child_process");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function speakAndRecord(text, voiceIndex) {
  try {
    console.log('กำลังเชื่อมต่อไปยัง Chrome ที่เปิดไว้ (Port 9222)...');
    const browser = await puppeteer.connect({
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
  }
}

// ── เรียกใช้ ──
// speakAndRecord("i want to test", 2);

module.exports = { speakAndRecord };

