# Dekin Video Parser

Backend NestJS pour ingestion WebSocket des poses, stockage SQLite/MinIO et comparaison/scoring.

> Nouveau mainteneur : commencer par la passation française canonique dans le repo infrastructure : https://github.com/Dekin-Ydays/infrastructure/blob/main/HANDOVER_FR.md
>
> Déploiement : ce repo construit/pousse l’image GHCR et peut déployer le parser via le Droplet provisionné par Terraform.

Endpoints clés :

- WebSocket ingestion : `/ws`
- Health check : `/pose/health`
- Comparaison : `POST /pose/compare`

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

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
- Raw video files live in object storage such as MinIO/S3; the database stores the `bucket` and `objectKey` used by `GET /pose/video/:id/source` to stream the original bytes.
- Pose JSON exports to object storage are optional derivatives. Comparison must work from the database frames even when an export is missing.
- Comparison scores are persisted as derived records so attempts can be rescored or audited later without changing the existing frontend contract.

## Project setup

### 1) Environment

Create `.env` with a SQLite URL:

```bash
DATABASE_URL="file:./postgres.db"
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
$ pnpm install
```

### 4) Generate Prisma client and apply migrations

```bash
$ pnpm exec prisma generate
$ pnpm exec prisma migrate deploy
```

### 5) Start the API

```bash
$ pnpm run start:dev
```

## Docker development

To run the API in Docker with the same watch-mode loop as `pnpm run start:dev`:

```bash
docker compose up --build
```

The `parser` service now:

- runs `pnpm run start:dev`
- bind-mounts the repo so TS and Python edits are picked up
- keeps `node_modules` inside a Docker volume so host/native module mismatches do not leak in
- runs `prisma generate` and `prisma migrate deploy` on boot
- uses the Python worker inside the container with the MediaPipe model available at `/opt/pose`

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
