FROM python:3.12.8-slim

WORKDIR /app
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir --requirement requirements.lock
COPY app ./app

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
