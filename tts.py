
from flask import Flask
import whisper
import subprocess
import os

from cut import generate_karaoke_video
# ถอยกลับไปที่โฟลเดอร์แม่ (n8n) และเพิ่มเข้าไประบบของ Python


# ตอนนี้บรรทัดนี้จะทำงานได้แล้วครับ
app = Flask(__name__)


def seconds_to_srt_time(s):
    ms = int((s % 1) * 1000)
    s = int(s)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02}:{m:02}:{sec:02},{ms:03}"


def generate_srt_from_audio(audio_path, output_path=None, model_size="base", 
                             max_words=8, max_duration=3.0):
    model = whisper.load_model(model_size)
    result = model.transcribe(audio_path, word_timestamps=True)

    def build_srt(chunks):
        lines = []
        for i, (start, end, text) in enumerate(chunks, 1):
            lines.append(str(i))
            lines.append(f"{seconds_to_srt_time(start)} --> {seconds_to_srt_time(end)}")
            lines.append(text)
            lines.append("")
        return "\n".join(lines)

    def split_segment_into_chunks(words, max_words, max_duration):
        """ตัด words ใน segment เดียวกัน ไม่ให้ยาวเกิน max_words หรือ max_duration"""
        chunks = []
        current = []

        for word in words:
            current.append(word)

            duration = current[-1]["end"] - current[0]["start"]
            over_words = len(current) >= max_words
            over_time = duration >= max_duration

            if over_words or over_time:
                chunks.append(current)
                current = []

        if current:
            chunks.append(current)  # เหลือค้างให้ใส่ด้วย

        return chunks

    # --- SRT แบบกลุ่ม (ตาม segment + จำกัดความยาว) ---
    group_chunks = []
    for segment in result["segments"]:
        words = segment.get("words", [])
        if not words:
            continue
        for chunk in split_segment_into_chunks(words, max_words, max_duration):
            start = chunk[0]["start"]
            end = chunk[-1]["end"]
            text = " ".join(w["word"].strip() for w in chunk)
            group_chunks.append((start, end, text))

    # --- SRT แบบคำต่อคำ ---
    word_chunks = []
    for segment in result["segments"]:
        for word in segment.get("words", []):
            word_chunks.append((
                word["start"],
                word["end"],
                word["word"].strip()
            ))

    srt_content = build_srt(group_chunks)
    word_srt_content = build_srt(word_chunks)

    if output_path:
        base, ext = os.path.splitext(output_path)
        word_output_path = base + "_word" + ext

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(srt_content)

        with open(word_output_path, 'w', encoding='utf-8') as f:
            f.write(word_srt_content)

    return srt_content, word_srt_content

def combine_audio():
    voices_dir = "./voices"

    # ✅ แก้: กัน ValueError ถ้าชื่อไฟล์ไม่ใช่ตัวเลข
    output_files = []
    for f in os.listdir(voices_dir):
        if f.endswith(".wav") and f != "0.wav":
            name = os.path.splitext(f)[0]
            if name.isdigit():
                output_files.append(f)

    output_files.sort(key=lambda x: int(os.path.splitext(x)[0]))

    if not output_files:
        print("No valid audio files found.")
        return False

    try:
        with open("filelist.txt", "w") as f:
            for filename in output_files:
                f.write(f"file '{voices_dir}/{filename}'\n")

        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", "filelist.txt",
            "-c", "copy",
            "output.wav"           # ✅ output เป็น .wav แทน
        ], check=True, capture_output=True)

        # ✅ แก้: รับ return value ไว้ (ใช้ต่อได้ถ้าต้องการ)
        srt_content, word_srt_content = generate_srt_from_audio(
            './output.wav', './output.srt'
        )
        print(f"SRT generated: {len(srt_content)} chars")
        return True

    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e.stderr.decode()}")
        return False
    except FileNotFoundError:
        print("FFmpeg not found. Please install FFmpeg.")
        return False
    except Exception as e:
        print(f"Unexpected error: {e}")
        return False
    finally:
        if os.path.exists("filelist.txt"):
            os.remove("filelist.txt")


@app.route("/receive/", methods=["GET"])
def receive_text():
    # ✅ แก้: ครอบ try/except ที่ route และ return status ที่สื่อความหมาย
    try:
        success = combine_audio()
        if success:
            generate_karaoke_video(
                audio_path="./output.wav",
                bg_image_path="./background.png",
                srt_path="./output.srt",
                word_srt_path="./output_word.srt",
                output_path="./video.mp4"
            )
            return {"status": "ok", "message": "Audio combined and SRT generated"}, 200
        else:
            return {"status": "error", "message": "Failed to combine audio"}, 500
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=4000)
