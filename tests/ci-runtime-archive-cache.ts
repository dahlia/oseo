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

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { runtimeArchiveCache } from "../tools/runtime-archive-cache.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
if (host.executionHost == null)
  throw new Error("Unknown native execution host.");
const target = targetForExecutionHost(host.executionHost);
if (target == null) throw new Error("Unsupported native execution host.");
const entry = await runtimeArchiveCache(
  host,
  nativeToolchain,
  cRuntimeProvider,
  target,
  process.cwd(),
);
console.log(`key=${entry.key}\npath=${entry.path}`);
