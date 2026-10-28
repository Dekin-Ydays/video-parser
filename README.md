# Dekin Video Parser

Backend NestJS pour ingestion WebSocket des poses, stockage Postgres/S3 (SeaweedFS en local, R2 en prod) et comparaison/scoring.

> Déploiement : Cloudflare Container derrière un Worker, décrit dans `deploy/alchemy.run.ts` (Alchemy) et déployé par `.github/workflows/deploy.yml`. Voir `infrastructure/README.md`.

Endpoints clés :

- WebSocket ingestion : `/ws`
- Health check : `/pose/health`
- Comparaison : `POST /pose/compare`

## WebSocket (MediaPipe points ingestion)

- Endpoint: `ws://localhost:3000/ws`
- Server sends on connect: `{"type":"welcome","clientId":"...","serverTime":...}`
- Client should send pose frames as protobuf binary.
- Protobuf schema is in [src/pose/proto/pose-frame.proto](src/pose/proto/pose-frame.proto).
- JSON is still accepted as a fallback (keys accepted: `landmarks`, `poseLandmarks`, `points`, `data`).

Protobuf contract:

```proto
syntax = "proto3";
package pose;

message Landmark {
  float x = 1;
  float y = 2;
  float z = 3;
  float visibility = 4;
  float presence = 5;
}

message PoseFrame {
  int64 timestamp = 1;
  string type = 2;
  repeated Landmark landmarks = 3;
}
```

Debug HTTP endpoints:

- `GET /pose/clients`
- `GET /pose/latest/:clientId`

## Storage model

- Pose frames are persisted in the database and remain the source of truth for scoring.
- Raw video files live in S3-compatible object storage (R2 in prod, SeaweedFS locally); the database stores the `bucket` and `objectKey` used by `GET /pose/video/:id/source` to stream the original bytes.
- Pose JSON exports to object storage are optional derivatives. Comparison must work from the database frames even when an export is missing.
- Comparison scores are persisted as derived records so attempts can be rescored or audited later without changing the existing frontend contract.

## Project setup

### 1) Environment

Start Postgres (`docker compose up -d postgres`) and create `.env`:

```bash
DATABASE_URL="postgresql://parser:parser@localhost:5432/parser"
```

### 2) Enter dev shell (recommended on NixOS)

```bash
# one-time
direnv allow

# each new shell (automatic with direnv, or manual):
nix develop
```

The flake shell exports Prisma engine paths so `prisma generate` works on NixOS.

### 3) Install dependencies

```bash
$ bun install
```

### 4) Generate Prisma client and apply migrations

```bash
$ bunx prisma generate
$ bunx prisma migrate deploy
```

### 5) Start the API

```bash
$ bun run start:dev
```

## Docker development

To run the API in Docker with the same watch-mode loop as `bun run start:dev`:

```bash
docker compose up --build
```

The `parser` service now:

- runs `bun run start:dev`
- bind-mounts the repo so TS and Python edits are picked up
- keeps `node_modules` inside a Docker volume so host/native module mismatches do not leak in
- runs `prisma generate` and `prisma migrate deploy` on boot
- uses the Python worker inside the container with the MediaPipe model available at `/opt/pose`

## Compile and run the project

```bash
# development
$ bun run start

# watch mode
$ bun run start:dev

# production mode
$ bun run start:prod
```

## Run tests

```bash
# unit tests
$ bun run test

# e2e tests
$ bun run test:e2e

# test coverage
$ bun run test:cov
```
