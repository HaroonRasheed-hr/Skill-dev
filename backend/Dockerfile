FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

COPY . .

FROM base AS training-runtime
COPY requirements-training.txt /tmp/requirements-training.txt
RUN python -m pip install -r /tmp/requirements-training.txt \
    && mim install "mmcv==2.1.0"

FROM training-runtime AS web
RUN python -m pip install "gunicorn>=22,<24"

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120"]

FROM training-runtime AS worker
CMD ["python", "manage.py", "training_worker"]
