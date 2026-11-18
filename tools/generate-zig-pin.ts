import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const mise = await readFile(new URL("mise.toml", root), "utf8");
const tools = /^\[tools\]\s*\n([^[]+)/mu.exec(mise)?.[1];
const version = /^zig\s*=\s*"(\d+\.\d+\.\d+)"$/mu.exec(tools ?? "")?.[1];
if (version == null)
  throw new Error("Expected a Zig release pin in mise.toml.");
await writeFile(
  new URL("packages/toolchain-zig/src/pin.generated.ts", root),
  "// Generated from mise.toml by tools/generate-zig-pin.ts.\n" +
    `export const zigVersion = "${version}";\n`,
);
