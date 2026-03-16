from moviepy import ImageClip, AudioFileClip, CompositeVideoClip
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import pysrt
import re

# ฟังก์ชันช่วยเหลือ (Helper Functions) ดึงออกมาไว้ข้างนอกเพื่อให้โค้ดดูสะอาด
def time_to_sec(t):
    return t.hours * 3600 + t.minutes * 60 + t.seconds + t.milliseconds / 1000

def text_width(text, font):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]

def draw_outlined_text(draw, pos, text, font, fill_color):
    x, y = pos
    for dx, dy in [(-2,0),(2,0),(0,-2),(0,2)]:
        draw.text((x+dx, y+dy), text, font=font, fill=(0,0,0,255))
    draw.text((x, y), text, font=font, fill=fill_color)

def find_word_index(full_text, word, search_from=0):
    """หาคำโดย match whole-word เท่านั้น ป้องกัน 'so' ใน 'something'"""
    text_lower = full_text.lower()
    word_lower = word.lower()
    pos = search_from
    while pos < len(text_lower):
        idx = text_lower.find(word_lower, pos)
        if idx == -1:
            return -1
        # เช็คว่าเป็นคำเต็ม (ไม่มีตัวอักษรติดกัน)
        before_ok = (idx == 0 or not text_lower[idx-1].isalpha())
        after_ok  = (idx + len(word) >= len(text_lower) or not text_lower[idx + len(word)].isalpha())
        if before_ok and after_ok:
            return idx
        pos = idx + 1
    return -1

# ฟังก์ชันหลักสำหรับให้ไฟล์อื่นเรียกใช้
def generate_karaoke_video(
    audio_path,
    bg_image_path,
    srt_path,
    word_srt_path,
    output_path="video.mp4",
    font_path="C:/Windows/Fonts/arial.ttf"
):
    # ย้ายการโหลดตัวแปรต่างๆ เข้ามาไว้ในฟังก์ชัน
    audio   = AudioFileClip(audio_path)
    bg_img  = Image.open(bg_image_path).convert("RGB")
    bg_clip = ImageClip(np.array(bg_img), duration=audio.duration).with_audio(audio)
    VIDEO_W, VIDEO_H = bg_clip.size

    subs      = pysrt.open(srt_path)
    word_subs = pysrt.open(word_srt_path)

    word_times = [
        {"word": w.text.strip(), "start": time_to_sec(w.start), "end": time_to_sec(w.end)}
        for w in word_subs
    ]

    font_normal    = ImageFont.truetype(font_path, 50)
    font_highlight = ImageFont.truetype(font_path, 54)

    # นำ make_subtitle_clip มาไว้ข้างใน เพื่อให้เรียกใช้ VIDEO_W, VIDEO_H, font ได้โดยไม่ต้องแก้พารามิเตอร์
    def make_subtitle_clip(full_text, highlight_word, highlight_idx, start, duration):
        img  = Image.new("RGBA", (VIDEO_W, VIDEO_H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        if highlight_idx == -1 or not highlight_word:
            # แสดงปกติไม่ highlight
            total_w = text_width(full_text, font_normal)
            x = (VIDEO_W - total_w) // 2
            draw_outlined_text(draw, (x, 50), full_text, font_normal, (255,255,255,255))
        else:
            before  = full_text[:highlight_idx]
            current = full_text[highlight_idx: highlight_idx + len(highlight_word)]
            after   = full_text[highlight_idx + len(highlight_word):]

            total_w = (
                (text_width(before,  font_normal)    if before  else 0) +
                text_width(current,  font_highlight) +
                (text_width(after,   font_normal)    if after   else 0)
            )
            x = (VIDEO_W - total_w) // 2

            if before:
                draw_outlined_text(draw, (x, 50), before, font_normal, (255,255,255,255))
                x += text_width(before, font_normal)

            draw_outlined_text(draw, (x, 48), current, font_highlight, (255,255,0,255))
            x += text_width(current, font_highlight)

            if after:
                draw_outlined_text(draw, (x, 50), after, font_normal, (255,255,255,255))

        r, g, b, a = img.split()
        rgb_arr  = np.array(Image.merge("RGB", (r, g, b)))
        mask_arr = np.array(a).astype(float) / 255.0

        clip = ImageClip(rgb_arr, duration=duration).with_start(start).with_position((0, 0))
        mask = ImageClip(mask_arr, is_mask=True, duration=duration).with_start(start)
        return clip.with_mask(mask)

    subtitle_clips = []

    for sub in subs:
        sub_start = time_to_sec(sub.start)
        sub_end   = time_to_sec(sub.end)
        full_text = sub.text.strip()

        # filter เฉพาะ word ที่ start อยู่ในช่วง subtitle นี้จริงๆ
        words_in_sub = [
            w for w in word_times
            if sub_start - 0.01 <= w["start"] < sub_end
        ]

        if not words_in_sub:
            subtitle_clips.append(
                make_subtitle_clip(full_text, None, -1, sub_start, sub_end - sub_start)
            )
            continue

        search_from = 0  # ติดตาม position ล่าสุดใน full_text เพื่อหา word ถัดไปถูกต้อง

        for i, word_info in enumerate(words_in_sub):
            w_start    = word_info["start"]
            w_end      = words_in_sub[i+1]["start"] if i < len(words_in_sub)-1 else sub_end
            w_duration = w_end - w_start

            if w_duration <= 0:
                continue

            # หา index ของคำ โดยเริ่มหาจาก position ต่อจากคำก่อนหน้า
            idx = find_word_index(full_text, word_info["word"], search_from)
            if idx != -1:
                search_from = idx + len(word_info["word"])  # เลื่อน pointer ไปข้างหน้า

            subtitle_clips.append(
                make_subtitle_clip(full_text, word_info["word"], idx, w_start, w_duration)
            )

    final = CompositeVideoClip([bg_clip, *subtitle_clips], size=(VIDEO_W, VIDEO_H))
    final.write_videofile(output_path, fps=24, codec="libx264", bitrate="8000k")

# ==========================================
# วิธีทดสอบรันในไฟล์นี้โดยตรง
# ==========================================
# if __name__ == "__main__":
    # BASE_DIR = "C:/Users/Tawan/Desktop/Code/n8n/TTS"
    
    # generate_karaoke_video(
    #     audio_path=f"{BASE_DIR}/output.wav",
    #     bg_image_path="background.png",
    #     srt_path=f"{BASE_DIR}/output.srt",
    #     word_srt_path=f"{BASE_DIR}/output_word.srt",
    #     output_path="video.mp4"
    # )