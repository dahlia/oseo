#!/usr/bin/env node

import process from "node:process";

import { message } from "@optique/core/message";
import { runProgram } from "@optique/discover";
import commands from "./commands.generated.ts";
import { executeCliInvocation } from "./index.ts";
import type { CliCommandContext } from "./options.ts";
import { readCliVersion } from "./cli-assets.ts";

const version = await readCliVersion();
await runProgram<CliCommandContext>({
  args: process.argv.slice(2),
  commands,
  metadata: {
    brief: message`Compile JavaScript source to a native executable.`,
    name: "oseo",
    version,
  },
  help: "both",
  completion: "both",
  hooks: {
    beforeEach() {
      return {
        resource: {
          async invoke(value) {
            const result = await executeCliInvocation(value, {
              args: [],
              execution: { inheritStdin: true, inheritOutput: true },
              version,
            });
            if (result.stdout !== "") {
              process.stdout.write(result.stdoutBytes ?? result.stdout);
            }
            if (result.stderr !== "") {
              process.stderr.write(result.stderrBytes ?? result.stderr);
            }
            process.exitCode = result.exitStatus;
          },
        },
      };
    },
  },
});
