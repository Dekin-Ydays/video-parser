import * as path from "node:path";
import * as Cloudflare from "@alchemy.run/cloudflare";
import type { VideoParserContainer } from "./worker.ts";

export const VideoParser = Cloudflare.Container<VideoParserContainer>(
  "VideoParser",
  {
    className: "VideoParserContainer",
    context: path.resolve(import.meta.dirname, "../.."),
    instanceType: "standard-1",
    maxInstances: 1,
    publish: { repository: "dekin-video-parser" },
  },
);
