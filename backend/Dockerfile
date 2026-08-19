# syntax=docker/dockerfile:1
# Long-running server image for EC2/Docker Compose.
# (Supersedes the previous Lambda-shaped image — this project targets a
# single EC2 instance, not Lambda.)

FROM python:3.11-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim
WORKDIR /app

# rasterio/shapely PyPI wheels bundle their own GDAL/GEOS statically — no
# system GDAL/GEOS packages needed. curl is only for the HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY app/ ./app/
COPY models/model_metadata.json ./models/model_metadata.json
# Placeholder so the named volume mounted here in docker-compose.yml
# initializes as a file, not a directory (prediction_log.py appends to it).
RUN touch prediction_log.jsonl

RUN groupadd --system app && useradd --system --gid app --no-create-home app \
    && chown -R app:app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
