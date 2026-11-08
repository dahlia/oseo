import assert from "node:assert/strict";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createDenoHost, createNodeHost } from "../src/index.ts";

for (const delegated of [false, true]) {
  test(`process input and bytes, delegated=${delegated}`, async () => {
    const host = createNodeHost({ delegateSpawns: delegated });
    try {
      const input = new Uint8Array([239, 187, 191, 0, 255, 226, 130]);
      const result = await host.run({
        args: [
          "--input-type=module",
          "-e",
          `
          import { readFileSync } from 'node:fs';
          const input = readFileSync(0);
          process.stdout.write(input);
          process.stderr.write(input);
          process.exitCode = 23;
        `,
        ],
        command: "node",
        cwd: process.cwd(),
        input,
        captureBytes: true,
      });
      assert.equal(result.exitStatus, 23);
      assert.deepEqual(result.stdoutBytes, input);
      assert.deepEqual(result.stderrBytes, input);
      assert.equal(
        result.stdout,
        new TextDecoder("utf-8", { ignoreBOM: true }).decode(input),
      );
      const early = await host.run({
        command: "node",
        args: ["-e", "process.exit(9)"],
        cwd: process.cwd(),
        input: new Uint8Array(2 * 1024 * 1024),
      });
      assert.equal(early.exitStatus, 9);
    } finally {
      await host.close();
    }
  });
}

test(
  "Deno process input and bytes",
  {
    skip: Object.getOwnPropertyDescriptor(globalThis, "Deno") == null,
  },
  async () => {
    const host = createDenoHost();
    const input = new Uint8Array([239, 187, 191, 0, 255, 226, 130, 172]);
    const result = await host.run({
      command: "deno",
      args: [
        "eval",
        `
      const bytes = await new Response(Deno.stdin.readable).bytes();
      await Deno.stdout.write(bytes);
      await Deno.stderr.write(bytes);
      Deno.exitCode = 23;
    `,
      ],
      cwd: process.cwd(),
      input,
      captureBytes: true,
    });
    assert.equal(result.exitStatus, 23);
    assert.deepEqual(result.stdoutBytes, input);
    assert.deepEqual(result.stderrBytes, input);
    assert.equal(
      result.stdout,
      new TextDecoder("utf-8", { ignoreBOM: true }).decode(input),
    );
    const early = await host.run({
      command: "deno",
      args: ["eval", "Deno.exit(9)"],
      cwd: process.cwd(),
      input: new Uint8Array(2 * 1024 * 1024),
    });
    assert.equal(early.exitStatus, 9);
  },
);

for (const mode of [
  "direct",
  "delegated",
  "deno",
  "direct-eof",
  "delegated-eof",
  "deno-eof",
]) {
  test(`inherited process streams, ${mode}`, async () => {
    const input = new Uint8Array([239, 187, 191, 0, 255, 226, 130]);
    const fixture = fileURLToPath(
      new URL("./fixtures/process-inherit.ts", import.meta.url),
    );
    const observed = await new Promise<{
      code: number | null;
      stdout: Uint8Array;
      stderr: Uint8Array;
    }>((resolve, reject) => {
      const child = spawn(
        mode.startsWith("deno") ? "deno" : "node",
        mode.startsWith("deno")
          ? ["run", "-A", fixture, mode]
          : [fixture, mode],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      const stdout: Uint8Array[] = [];
      const stderr: Uint8Array[] = [];
      child.stdout.on("data", (bytes: Uint8Array) => stdout.push(bytes));
      child.stderr.on("data", (bytes: Uint8Array) => stderr.push(bytes));
      child.stdin.end(input);
      child.on("error", reject);
      child.on("close", (code) =>
        resolve({
          code,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        }),
      );
    });
    assert.equal(observed.code, 23);
    const expected = mode.endsWith("-eof") ? new Uint8Array() : input;
    assert.deepEqual(new Uint8Array(observed.stdout), expected);
    assert.deepEqual(new Uint8Array(observed.stderr), expected);
  });
}

for (const mode of ["direct", "delegated", "deno"]) {
  test(`reject conflicting process streams, ${mode}`, async () => {
    if (
      mode === "deno" &&
      Object.getOwnPropertyDescriptor(globalThis, "Deno") == null
    )
      return;
    const nodeHost =
      mode === "deno"
        ? undefined
        : createNodeHost({ delegateSpawns: mode === "delegated" });
    const host = nodeHost ?? createDenoHost();
    try {
      await Promise.all(
        [
          { inheritStdin: true, input: "" },
          { inheritOutput: true, captureBytes: true },
        ].map(async (streams) => {
          await assert.rejects(
            host.run({
              command: "must-not-start",
              args: [],
              cwd: process.cwd(),
              ...streams,
            }),
            TypeError,
          );
        }),
      );
    } finally {
      await nodeHost?.close();
    }
  });
}
