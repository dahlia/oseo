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

import { createNodeHost } from "../../src/index.ts";

const host = createNodeHost({ delegateSpawns: true });
const mode = process.argv[2];
if (mode === "idle") {
  await host.run({
    command: process.execPath,
    args: ["-e", ""],
    cwd: process.cwd(),
  });
} else {
  await host.run({
    command: process.execPath,
    args: [
      "-e",
      `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, [
        '-e', 'setInterval(() => {}, 100)'
      ]);
      require('node:fs').writeFileSync(process.argv[1],
        JSON.stringify([process.ppid, process.pid, child.pid]));
      setInterval(() => {}, 100);
    `,
      process.argv[3]!,
    ],
    cwd: process.cwd(),
  });
}
