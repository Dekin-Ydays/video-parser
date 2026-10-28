import * as path from "node:path";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Effect from "effect/Effect";
import { Infrastructure } from "./Infrastructure.ts";
import { VideoParser } from "./VideoParser.ts";

const LOCAL_FRONTEND_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:19006",
];

export const Api = Cloudflare.Worker(
  "Api",
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const infrastructure = yield* Infrastructure;
    const corsOrigins = infrastructure.frontendOrigin.pipe(
      Output.map((origin) =>
        (stage === "prod"
          ? [origin]
          : [origin, ...LOCAL_FRONTEND_ORIGINS]
        ).join(","),
      ),
    );

    return {
      name: `dekin-api-${stage}`,
      main: path.resolve(import.meta.dirname, "worker.ts"),
      compatibility: { date: "2026-10-01" },
      env: {
        VIDEO_PARSER: VideoParser,
        DATABASE_URL: infrastructure.databaseUrl,
        S3_ENDPOINT: infrastructure.s3Endpoint,
        S3_BUCKET: infrastructure.bucketName,
        S3_ACCESS_KEY_ID: infrastructure.s3AccessKeyId,
        S3_SECRET_ACCESS_KEY: infrastructure.s3SecretAccessKey,
        CORS_ORIGINS: corsOrigins,
      },
    };
  }),
);

export type ApiEnv = Cloudflare.InferEnv<typeof Api>;
