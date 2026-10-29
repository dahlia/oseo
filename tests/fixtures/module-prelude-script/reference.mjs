// Node.js and Deno reference: run the prelude as a global Script, then
// evaluate the module graph in the same realm.
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";

runInThisContext(
  readFileSync(new URL("./prelude.js", import.meta.url), "utf8"),
);
await import("./entry.mjs");
