import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Effect from "effect/Effect";
import { Api } from "./src/Api.ts";

export default Alchemy.Stack(
  "dekin-video-parser",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const api = yield* Api;
    const url = api.url.pipe(
      Output.map((url) => {
        if (!url) throw new Error("Api Worker has no public URL");
        return url;
      }),
    );

    return {
      url,
      wsUrl: url.pipe(Output.map((url) => `${url.replace(/^http/, "ws")}/ws`)),
    };
  }),
);
