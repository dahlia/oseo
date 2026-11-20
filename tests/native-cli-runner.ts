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

import {
  executeCliInvocation,
  parseCliRequest,
} from "../packages/cli/src/index.ts";
import type { runNativeCli } from "../packages/cli/src/index.ts";
import type {
  NativeBuildConfiguration,
  NativeToolchain,
} from "../packages/compiler/src/index.ts";
import type { ExecutablePublisher } from "../packages/host/src/index.ts";

/** Apply a test lane's configuration through the shared typed CLI grammar. */
export function createNativeCliRunner(
  toolchain: NativeToolchain,
  buildConfiguration: NativeBuildConfiguration,
  publisher?: ExecutablePublisher,
): typeof runNativeCli {
  return async (request, host) => {
    const parsed = parseCliRequest(request);
    if (parsed.kind === "result") return parsed.value;
    const value = parsed.value;
    const invocation =
      value.mode === "execute" && value.buildConfiguration == null
        ? { ...value, buildConfiguration }
        : value;
    return await executeCliInvocation(
      invocation,
      request,
      host,
      toolchain,
      publisher,
    );
  };
}
