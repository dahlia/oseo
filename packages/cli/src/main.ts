#!/usr/bin/env node

import process from "node:process";
import { readFile } from "node:fs/promises";

import { message } from "@optique/core/message";
import { runProgram } from "@optique/discover";
import commands from "./commands.generated.ts";
import { executeCliInvocation } from "./index.ts";
import type { CliCommandContext } from "./options.ts";

interface PackageManifest {
  readonly version: string;
}

// SAFETY: This checked-in manifest is validated by the package checks.
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;
await runProgram<CliCommandContext>({
  args: process.argv.slice(2),
  commands,
  metadata: {
    brief: message`Compile JavaScript source to a native executable.`,
    name: "oseo",
    version: manifest.version,
  },
  help: "option",
  completion: false,
  hooks: {
    beforeEach() {
      return {
        resource: {
          async invoke(value) {
            const result = await executeCliInvocation(value, {
              args: [],
              version: manifest.version,
            });
            if (result.stdout !== "") process.stdout.write(result.stdout);
            if (result.stderr !== "") process.stderr.write(result.stderr);
            process.exitCode = result.exitStatus;
          },
        },
      };
    },
  },
});
