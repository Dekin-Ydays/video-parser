import { Container, getContainer } from "@cloudflare/containers";
import type { ApiEnv } from "./Api.ts";

const PARSER_PORT = 3000;

export class VideoParserContainer extends Container<ApiEnv> {
  defaultPort = PARSER_PORT;
  // Open WebSockets keep the container awake regardless; this only bounds
  // idle time between sessions.
  sleepAfter = "30m";
  enableInternet = true;

  constructor(ctx: DurableObjectState<{}>, env: ApiEnv) {
    super(ctx, env);
    this.envVars = {
      PORT: String(PARSER_PORT),
      DATABASE_URL: env.DATABASE_URL,
      MINIO_ENDPOINT: env.S3_ENDPOINT,
      MINIO_REGION: "auto",
      MINIO_BUCKET: env.S3_BUCKET,
      MINIO_ACCESS_KEY: env.S3_ACCESS_KEY_ID,
      MINIO_SECRET_KEY: env.S3_SECRET_ACCESS_KEY,
      CORS_ORIGINS: env.CORS_ORIGINS,
    };
  }

  override async fetch(request: Request): Promise<Response> {
    // Cold boot runs Prisma migrations and loads MediaPipe, well past the
    // library's 20s default.
    await this.startAndWaitForPorts(PARSER_PORT, {
      portReadyTimeoutMS: 120_000,
    });
    return this.containerFetch(request);
  }
}

const isParserPath = (pathname: string) =>
  pathname === "/" ||
  pathname === "/health-check" ||
  pathname === "/ws" ||
  pathname.startsWith("/ws/") ||
  pathname.startsWith("/pose/");

export default {
  async fetch(request: Request, env: ApiEnv): Promise<Response> {
    if (!isParserPath(new URL(request.url).pathname)) {
      return new Response("Not found", { status: 404 });
    }

    // The parser trusts exactly one proxy hop for client IPs (rate limiting),
    // so overwrite rather than append to anything the client sent.
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? "");

    return getContainer(env.VIDEO_PARSER, "singleton").fetch(
      new Request(request, { headers }),
    );
  },
};
