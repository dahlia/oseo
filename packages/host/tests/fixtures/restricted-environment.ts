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

import { createDenoHost } from "../../src/index.ts";

interface RestrictedDenoRuntime {
  cwd(): string;
  execPath(): string;
}

// SAFETY: The fixture runs only with this restricted Deno API.
const runtime = (
  globalThis as typeof globalThis & {
    readonly Deno?: RestrictedDenoRuntime;
  }
).Deno;
if (runtime == null) throw new Error("Deno is unavailable.");

const host = createDenoHost();
const snapshot = await host.captureEnvironment?.({ inherit: ["PATH"] });
if (snapshot !== undefined) {
  throw new Error("The restricted host unexpectedly captured an environment.");
}
const result = await host.run({
  args: ["eval", "console.log('restricted-ok')"],
  command: runtime.execPath(),
  cwd: runtime.cwd(),
});
if (result.exitStatus !== 0) throw new Error(result.stderr);
console.log(result.stdout.trim());
