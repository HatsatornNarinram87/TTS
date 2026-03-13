FROM python:3.13-slim 

WORKDIR /app

RUN pip install --no-cache-dir edge-tts flask

COPY tts.py .

RUN mkdir -p output

EXPOSE 4000

CMD ["python", "tts.py"]