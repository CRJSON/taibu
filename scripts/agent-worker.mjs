import { existsSync } from "node:fs";
// Match local development without modifying shell configuration or exposing values.
if (process.env.NODE_ENV !== "test") {
  for (const file of [".env.local", ".env"])
    if (existsSync(file)) process.loadEnvFile(file);
}
await import("../.agent/worker.mjs");
