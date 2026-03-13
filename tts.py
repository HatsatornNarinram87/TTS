import os
import asyncio
from asyncio import Semaphore
import edge_tts
import io
import random
from flask import Flask, request, send_file
import time
import subprocess
import whisper
import tempfile

app = Flask(__name__)


async def generate_voice(text, voice="en-US-AvaNeural", rate="-20%"):
    # เพิ่มพารามิเตอร์ rate เข้าไปที่ Communicate
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]

    return audio_data       


def seconds_to_srt_time(s):
    ms = int((s % 1) * 1000)
    s = int(s)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02}:{m:02}:{sec:02},{ms:03}"


def generate_srt_from_audio(audio_path, output_path=None, model_size="base"):
    model = whisper.load_model(model_size)
    result = model.transcribe(audio_path, word_timestamps=True)

    srt_lines = []
    index = 1

    for segment in result["segments"]:
        start = seconds_to_srt_time(segment["start"])
        end = seconds_to_srt_time(segment["end"])
        text = segment["text"].strip()
        srt_lines.append(f"{index}")
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(text)
        srt_lines.append("")
        index += 1

    srt_content = "\n".join(srt_lines)
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(srt_content)

    word_srt_lines = []
    index = 1
    for segment in result["segments"]:
        for word in segment["words"]:
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
        # บันทึกเป็นไฟล์ที่ 2 อัตโนมัติ เช่น output_word.srt
        word_output_path = output_path.replace(".srt", "_word.srt")
        with open(word_output_path, 'w', encoding='utf-8') as f:
            f.write(word_srt_content)

    return srt_content, word_srt_content


def combine_audio():
    output_files = sorted([
        f for f in os.listdir("./output")
        if f.endswith(".mp3") and f != "0.mp3"
    ], key=lambda x: int(x.replace(".mp3", "")))

    if output_files:
        # Create file list for ffmpeg
        with open("filelist.txt", "w") as f:
            for filename in output_files:
                f.write(f"file './output/{filename}'\n")

        # Use ffmpeg to merge files
        try:
            subprocess.run([
                "ffmpeg", "-f", "concat", "-safe", "0",
                "-i", "filelist.txt", "-c", "copy", "output.mp3"
            ], check=True, capture_output=True)

            generate_srt_from_audio(
                './output.mp3', './output.srt')
        except subprocess.CalledProcessError as e:
            print(f"FFmpeg error: {e}")
        except FileNotFoundError:
            print("FFmpeg not found. Please install FFmpeg for audio merging.")
        finally:
            # Clean up temporary file
            if os.path.exists("filelist.txt"):
                os.remove("filelist.txt")


@app.route("/receive/", methods=["POST"])
def receive_text():
    data = request.get_json()

    async def process_item(semaphore, i, item, max_retries=5):
        for attempt in range(max_retries):
            try:
                async with semaphore:
                    t = time.perf_counter()
                    audio_data = await generate_voice(item["text"], "en-US-GuyNeural" if i % 2 == 0 else "en-US-AvaNeural")
                    print(f"[{i}] generate: {time.perf_counter() - t:.2f}s")

                with open(f"./output/{i}.mp3", "wb") as f:
                    f.write(audio_data)

                return  # สำเร็จ

            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"[{i}] Failed after {max_retries} attempts: {e}")
                    raise
                wait = (2 ** attempt) + random.uniform(0, 1)
                print(
                    f"[{i}] Attempt {attempt + 1} failed, retry in {wait:.1f}s... ({e})")
                await asyncio.sleep(wait)

    async def process_all_items():
        semaphore = Semaphore(10)  # Edge TTS ไม่ชอบ concurrent สูง
        tasks = [process_item(semaphore, i, item)
                 for i, item in enumerate(data)]
        await asyncio.gather(*tasks, return_exceptions=True)

    asyncio.run(process_all_items())

    print("All items processed successfully!")
    combine_audio()
    return "OK"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000)
