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
