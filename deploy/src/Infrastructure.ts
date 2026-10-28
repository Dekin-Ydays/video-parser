import * as Alchemy from "alchemy";
import type * as Redacted from "effect/Redacted";

// Mirrors the outputs of the `dekin-infrastructure` stack in the
// Dekin-Ydays/infrastructure repo; keep both in sync.
export class Infrastructure extends Alchemy.Stack<
  Infrastructure,
  {
    bucketName: string;
    s3Endpoint: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: Redacted.Redacted<string>;
    databaseUrl: Redacted.Redacted<string>;
    frontendWorkerName: string;
    frontendOrigin: string;
  }
>()("dekin-infrastructure") {}
