
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


def generate_srt_from_audio(audio_path, output_path=None, model_size="base", words_per_segment=6):
    model = whisper.load_model(model_size)
    result = model.transcribe(audio_path, word_timestamps=True)

    # --- ส่วนที่ 1: SRT แบบกลุ่มละ words_per_segment คำ ---
    all_words = []
    for segment in result["segments"]:
        all_words.extend(segment.get("words", []))

    srt_lines = []
    index = 1

    for i in range(0, len(all_words), words_per_segment):
        chunk = all_words[i: i + words_per_segment]
        start = seconds_to_srt_time(chunk[0]["start"])
        end = seconds_to_srt_time(chunk[-1]["end"])
        text = " ".join([w["word"].strip() for w in chunk])

        srt_lines.append(f"{index}")
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(text)
        srt_lines.append("")
        index += 1

    srt_content = "\n".join(srt_lines)

    # --- ส่วนที่ 2: SRT แบบคำต่อคำ ---
    word_srt_lines = []
    index = 1

    for segment in result["segments"]:
        for word in segment.get("words", []):
            start = seconds_to_srt_time(word["start"])
            end = seconds_to_srt_time(word["end"])
            text = word["word"].strip()

            word_srt_lines.append(f"{index}")
            word_srt_lines.append(f"{start} --> {end}")
            word_srt_lines.append(text)
            word_srt_lines.append("")
            index += 1

    word_srt_content = "\n".join(word_srt_lines)

    if output_path:
        # ✅ แก้: ใช้ os.path.splitext แทน .replace()
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
                audio_path="/output.wav",
                bg_image_path="/background.png",
                srt_path="/output.srt",
                word_srt_path="/output_word.srt",
                output_path="/video.mp4"
            )
            return {"status": "ok", "message": "Audio combined and SRT generated"}, 200
        else:
            return {"status": "error", "message": "Failed to combine audio"}, 500
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=4000)
