const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// นำเข้า ghost-cursor
const { createCursor } = require('ghost-cursor');

// ฟังก์ชันหน่วงเวลา
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    console.log('กำลังเชื่อมต่อไปยัง Chrome ที่เปิดไว้ (Port 9222)...');

    // เชื่อมต่อไปยัง Chrome ที่เราเปิดประตูหลังไว้
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });

    // ดึงหน้าต่างที่เปิดอยู่มาใช้งาน
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // 🌟 สร้าง เมาส์ผี (Ghost Cursor) ประจำหน้าเว็บนี้ (นี่คือบรรทัดที่หายไปครับ!)
    const cursor = createCursor(page);

    console.log('1. กำลังไปที่หน้าเว็บ ElevenLabs...');
    await page.goto('https://elevenlabs.io/', { waitUntil: 'networkidle2' });

    // ==========================================
    // 2. ค้นหาและเลือกเสียงคนที่ 3 (ใช้พิกัดเมาส์)
    // ==========================================
    console.log('2. กำลังรอให้รายการเสียงโหลด...');
    const voiceSelector = '.tw-w-full.tw-relative.tw-snap-start';
    await page.waitForSelector(voiceSelector);

    const voiceItems = await page.$$(voiceSelector);

    if (voiceItems.length >= 3) {
      console.log('-> เจอกล่องเสียงแล้ว กำลังคำนวณพิกัด...');
      const label = await voiceItems[2].$('label');

      if (label) {
        // 🌟 ดึงพิกัด (X, Y) ของป้ายชื่อนักพากย์คนที่ 3
        const box = await label.boundingBox();
        if (box) {
          const targetX = box.x + (box.width / 2);
          const targetY = box.y + (box.height / 2);

          // 🌟 สั่งเมาส์เลื่อนไปช้าๆ (steps: 20 คือความเนียนในการขยับ)
          await page.mouse.move(targetX, targetY, { steps: 20 });

          // แกล้งหยุดเมาส์ชั่วคราวให้เหมือนคนกำลังเล็ง
          await delay(500);

          // 🌟 สั่งคลิกเมาส์ซ้าย
          await page.mouse.click(targetX, targetY);
          console.log('-> เลื่อนเมาส์ไปคลิกเลือกเสียงสำเร็จ!');
        }
      }
    } else {
      console.log('-> ❌ ไม่พบรายการเสียงถึง 3 รายการ');
    }
    await delay(1000);

    // 3. จัดการช่องกรอกข้อความ
    console.log('3. กำลังค้นหาช่องพิมพ์ข้อความ...');
    const textAreaSelector = 'textarea[aria-label*="Enter your text"]';
    await page.waitForSelector(textAreaSelector);

    console.log('-> ลบข้อความเดิม...');
    await page.click(textAreaSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    const myText = "สวัสดีครับ บอทสามารถเลื่อนเมาส์และสร้างเสียงได้สำเร็จแล้วครับ";
    console.log(`-> กำลังพิมพ์ข้อความใหม่: "${myText}"`);
    await page.type(textAreaSelector, myText, { delay: 50 });

    await delay(1000);

    // ==========================================
    // 4. เลื่อนเมาส์ไปกดปุ่ม Play ด้วยพิกัด (X, Y)
    // ==========================================
    console.log('4. กำลังหาพิกัดปุ่ม Play...');
    const playBtnSelector = 'button[aria-label="Play"]';
    await page.waitForSelector(playBtnSelector);

    // ดึง Element ของปุ่มมา
    const playBtn = await page.$(playBtnSelector);
    const box = await playBtn.boundingBox();

    if (box) {
      // หาจุดกึ่งกลางของปุ่ม
      const targetX = box.x + (box.width / 2);
      const targetY = box.y + (box.height / 2);

      console.log(`-> เจอพิกัดปุ่มแล้วที่ (X: ${targetX}, Y: ${targetY})`);

      // 🌟 สั่งเมาส์จำลอง ค่อยๆ เลื่อนไปที่ปุ่ม 
      // steps: 25 คือให้มันซอยย่อยการขยับเมาส์ 25 ครั้งให้ดูเหมือนคนลากเมาส์
      await page.mouse.move(targetX, targetY, { steps: 25 });

      // แกล้งหยุดเมาส์ทิ้งไว้ที่ปุ่ม 1 วินาที (Hover) ให้เว็บคิดว่าคนกำลังเล็ง
      await delay(1000);

      console.log('-> คลิกลงไปแล้ว!');
      // 🌟 สั่งคลิกเมาส์ซ้ายที่พิกัดนั้น
      await page.mouse.click(targetX, targetY);

      console.log('🎉 เลื่อนเมาส์ไปกดปุ่มสำเร็จ! รอดูผลลัพธ์ครับ');
    } else {
      console.log('❌ คำนวณพิกัดปุ่มไม่ได้ (ปุ่มอาจจะโดนซ่อนอยู่)');
    }

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
})();