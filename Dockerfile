# syntax=docker/dockerfile:1.6

# ---------- Node deps stage ----------
FROM node:20-slim AS node-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- Node build stage ----------
FROM node-deps AS node-builder
COPY . .
RUN pnpm run build

# ---------- Python build stage ----------
# Build the venv and fetch the MediaPipe model here. Isolated so we
# don't ship pip, build tools, or download tooling in the final image.
FROM python:3.11-slim AS python-builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/pose
COPY python/requirements.txt ./requirements.txt
RUN python -m venv /opt/pose/venv \
 && /opt/pose/venv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/pose/venv/bin/pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /opt/pose/models \
 && curl -L --fail -o /opt/pose/models/pose_landmarker_heavy.task \
      https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task
COPY python/process_video.py /opt/pose/process_video.py

# ---------- Dev stage ----------
FROM node:20-slim AS dev
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3.11 \
      procps \
      libgl1 \
      libglib2.0-0 \
      ca-certificates \
 && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
 && ln -sf /usr/bin/python3.11 /usr/local/bin/python3 \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=node-deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml nest-cli.json prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
COPY test ./test
COPY python ./python
COPY --from=python-builder /opt/pose /opt/pose

ENV PYTHON_BIN=/opt/pose/venv/bin/python \
    PYTHONUNBUFFERED=1 \
    POSE_WORKER_SCRIPT=/app/python/process_video.py \
    MEDIAPIPE_POSE_MODEL=/opt/pose/models/pose_landmarker_heavy.task

EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]

# ---------- Runtime stage ----------
FROM node:20-slim AS runtime
# MediaPipe needs Python 3.11 + libGL/libglib for opencv headless.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3.11 \
      procps \
      libgl1 \
      libglib2.0-0 \
      ca-certificates \
 && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
 && ln -sf /usr/bin/python3.11 /usr/local/bin/python3 \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
WORKDIR /app

# Node app
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package.json ./
COPY --from=node-builder /app/pnpm-lock.yaml ./
COPY --from=node-builder /app/prisma ./prisma
COPY --from=node-builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=node-builder /app/tsconfig.json ./tsconfig.json

# Python worker + venv + model
COPY --from=python-builder /opt/pose /opt/pose

ENV PYTHON_BIN=/opt/pose/venv/bin/python \
    PYTHONUNBUFFERED=1 \
    POSE_WORKER_SCRIPT=/opt/pose/process_video.py \
    MEDIAPIPE_POSE_MODEL=/opt/pose/models/pose_landmarker_heavy.task

RUN mkdir -p /app/data && chown -R appuser:appgroup /app /opt/pose
USER appuser
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/src/main"]
