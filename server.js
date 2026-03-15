const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const { spawn } = require("child_process");
// 🌟 1. นำเข้า ffmpeg-static จะได้ Path ของ ffmpeg.exe แบบเป๊ะๆ
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    console.log('กำลังเชื่อมต่อไปยัง Chrome ที่เปิดไว้ (Port 9222)...');
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // ดึงหน้าเว็บนี้ขึ้นมาให้ Active (สำคัญมาก ไม่งั้นคีย์ลัดจะไม่ทำงาน)
    await page.bringToFront();

    console.log('1. กำลังไปที่หน้าเว็บ ElevenLabs...');
    await page.goto('https://elevenlabs.io/', { waitUntil: 'networkidle2' });
    // await delay(2000);

    // ==========================================
    // 2. เลือกเสียงคนที่ 3 (ใช้พิกัด)
    // ==========================================
    console.log('2. กำลังเลือก Voice Actor...');
    const voiceSelector = '.tw-w-full.tw-relative.tw-snap-start';
    await page.waitForSelector(voiceSelector);
    const voiceItems = await page.$$(voiceSelector);
    if (voiceItems.length >= 3) {
      const label = await voiceItems[2].$('label');
      if (label) {
        const box = await label.boundingBox();
        if (box) {
          const targetX = box.x + (box.width / 2);
          const targetY = box.y + (box.height / 2);
          await page.mouse.move(targetX, targetY, { steps: 20 });
          // await delay(500);
          await page.mouse.click(targetX, targetY);
        }
      }
    }
    // await delay(1500);

    // ==========================================
    // 3. พิมพ์ข้อความ
    // ==========================================
    console.log('3. กำลังพิมพ์ข้อความ...');
    const textAreaSelector = 'textarea[aria-label*="Enter your text"]';
    await page.waitForSelector(textAreaSelector);

    const textArea = await page.$(textAreaSelector);
    const taBox = await textArea.boundingBox();
    if (taBox) await page.mouse.click(taBox.x + 10, taBox.y + 10);

    await page.click(textAreaSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    // await delay(500);

    const myText = "i want to test";
    console.log(`-> พิมพ์ข้อความ: "${myText}"`);
    await page.type(textAreaSelector, myText/*, { delay: 50 }*/);
    // await delay(1000);


    // ==========================================
    // ▶️ กดปุ่ม Play ให้เว็บพูด
    // ==========================================
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
      // await delay(500);
      await page.mouse.click(targetX, targetY);

      await page.waitForSelector(pauseBtnSelector);

      console.log('⏳ กำลังอัดเสียง...');


      const recorder = spawn("outDebug.exe", [], {
        windowsHide: false,
        stdio: ['pipe', 'inherit', 'inherit']  // เปิด stdin
      });

      console.log('⏳ รอให้เว็บพูดจบ...');

      await page.waitForSelector(pauseBtnSelector, { hidden: true });

      console.log('✅ เว็บพูดจบแล้ว');

      // await new Promise(r => setTimeout(r, 500));

      // ส่ง Enter แทน kill
      recorder.stdin.write('\n');

      // รอให้ C++ บันทึกไฟล์เสร็จ
      await new Promise(r => setTimeout(r, 0));

      console.log('⏹️ สั่งหยุดอัดเสียง...');
    }


  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
})();