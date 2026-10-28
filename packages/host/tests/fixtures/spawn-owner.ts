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
