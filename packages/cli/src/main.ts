#!/usr/bin/env node

import process from "node:process";
import { readFile } from "node:fs/promises";

import { runNativeCli } from "./index.ts";

interface PackageManifest {
  readonly version: string;
}

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;
const result = await runNativeCli({
  args: process.argv.slice(2),
  version: manifest.version,
});

if (result.stdout !== "") process.stdout.write(result.stdout);
if (result.stderr !== "") process.stderr.write(result.stderr);
process.exitCode = result.exitStatus;
