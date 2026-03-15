const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { spawn } = require('child_process'); // 🌟 นำเข้าตัวสั่งรันโปรแกรมใน OS
// 🌟 1. นำเข้า ffmpeg-static จะได้ Path ของ ffmpeg.exe แบบเป๊ะๆ
const ffmpegPath = require('ffmpeg-static');
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
    await delay(2000);

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
          await delay(500);
          await page.mouse.click(targetX, targetY);
        }
      }
    }
    await delay(1500);

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
    await delay(500);

    const myText = "สวัสดีครับ ทดสอบการสั่งงานส่วนขยายอัดเสียงด้วยคีย์ลัดครับ";
    console.log(`-> พิมพ์ข้อความ: "${myText}"`);
    await page.type(textAreaSelector, myText, { delay: 50 });
    await delay(1000);

    // ==========================================
    // 🔴 ท่าไม้ตาย System Audio: สั่ง FFmpeg เริ่มอัดเสียงจากคอม
    // ==========================================
    console.log('🔴 กำลังเปิดระบบอัดเสียงจาก OS (Stereo Mix)...');

    // สั่งรัน ffmpeg.exe ดึงเสียงจาก Stereo Mix เซฟเป็น final_audio.mp3
    // สมมติว่าคอมคุณชื่อ "สเตอริโอมิกซ์ (Realtek(R) Audio)" 
    // ให้แก้โค้ดเป็นแบบนี้ครับ (ระวังอย่าลืมคำว่า audio= นำหน้านะครับ)
    const ffmpegProcess = spawn(ffmpegPath, [
      '-f', 'dshow',
      '-i', 'audio=Microphone (4- USB Audio Device)', // 👈 เปลี่ยนตรงนี้ให้ตรงกับคอมคุณ
      '-y',
      'final_audio.mp3'
    ]);

    ffmpegProcess.stderr.on('data', (data) => {
      // ffmpeg จะพ่น log ออกมาทาง stderr (เป็นเรื่องปกติของมัน)
      console.log(`FFmpeg: ${data}`); // เปิดคอมเมนต์นี้ถ้าอยากดู log การอัด
    });

    // ให้เวลาโปรแกรมอัดเสียงเตรียมตัว 1.5 วินาที
    await delay(1500);

    // ==========================================
    // ▶️ กดปุ่ม Play ให้เว็บพูด
    // ==========================================
    console.log('▶️ กำลังกดปุ่ม Play บนหน้าเว็บ...');
    const playBtnSelector = 'button[aria-label="Play"]';
    await page.waitForSelector(playBtnSelector);
    const playBtn = await page.$(playBtnSelector);
    const pbBox = await playBtn.boundingBox();

    if (pbBox) {
      const targetX = pbBox.x + (pbBox.width / 2);
      const targetY = pbBox.y + (pbBox.height / 2);
      await page.mouse.move(targetX, targetY, { steps: 20 });
      await delay(500);
      await page.mouse.click(targetX, targetY);

      console.log('⏳ กำลังอัดเสียงจากลำโพง กรุณารอเงียบๆ อย่าเปิดเพลงแทรกนะครับ...');

      // 🌟 รอให้เสียงพูดจบ (กะเวลาเผื่อไว้ตามความยาวข้อความ สมมติว่า 10 วินาที)
      await delay(10000);

      // ==========================================
      // ⏹️ สั่งหยุดอัดเสียง
      // ==========================================
      console.log('⏹️ สั่งหยุดอัดเสียง...');

      // ส่งตัวอักษร 'q' (Quit) ไปให้ ffmpeg เพื่อสั่งให้มันเซฟไฟล์และปิดตัวลงอย่างถูกต้อง
      ffmpegProcess.stdin.write('q\n');

      console.log('🎉 เซฟไฟล์เสียง "final_audio.mp3" สำเร็จเรียบร้อย 100%!');
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
})();