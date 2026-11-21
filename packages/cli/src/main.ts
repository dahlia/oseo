#!/usr/bin/env node
/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import process from "node:process";

import { runProgram } from "@optique/discover";
import commands from "./commands.generated.ts";
import { executeCliInvocation } from "./index.ts";
import type { CliCommandContext } from "./options.ts";
import { readCliVersion } from "./cli-assets.ts";
import { cliMetadata, formatCliMessage } from "./program-metadata.ts";

const version = await readCliVersion();
await runProgram<CliCommandContext>({
  args: process.argv.slice(2),
  commands,
  metadata: { ...cliMetadata, version },
  messageFormatter: formatCliMessage,
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
