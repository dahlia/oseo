/* eslint-disable no-await-in-loop -- Lifecycle checks retain process order. */
import assert from "node:assert/strict";
import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test, { describe } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { ProcessRequest } from "@oseo/compiler";
import { createNodeHost } from "../src/index.ts";
import {
  createSpawnDelegate,
  startSpawnHelper,
} from "../src/spawn-delegate.ts";
import type { ChildProcess } from "node:child_process";

function nodeRequest(source: string): ProcessRequest {
  return {
    command: process.execPath,
    args: ["-e", source],
    cwd: process.cwd(),
  };
}

/**
 * Turn a lifecycle hang into a test failure. The bound is generous because
 * each awaited step completes within one helper exit.
 */
async function settlesWithin<T>(
  promise: Promise<T>,
  description: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${description} did not settle.`));
        }, 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe(
  "Node spawn delegation",
  {
    skip: "Deno" in globalThis ? "requires Node.js IPC" : false,
  },
  () => {
    test("delegation matches output, status, cwd, and stdin EOF", async () => {
      const direct = createNodeHost();
      const delegated = createNodeHost({ delegateSpawns: true });
      try {
        const request = nodeRequest(`
      process.stdout.write(Buffer.from([0, 255, 226]));
      process.stdout.write(Buffer.from([130, 172]));
      process.stderr.write(Buffer.from([240, 159, 146, 169, 255]));
      process.stdout.write(process.cwd());
      process.stdin.on('end', () => { process.exitCode = 23; });
      process.stdin.resume();
    `);
        assert.deepEqual(
          await delegated.run(request),
          await direct.run(request),
        );
        const signaled = nodeRequest("process.kill(process.pid, 'SIGTERM')");
        assert.deepEqual(
          await delegated.run(signaled),
          await direct.run(signaled),
        );
      } finally {
        await delegated.close();
      }
    });

    test(
      "a relative cwd resolves .. after symlinks, like direct spawning",
      { skip: process.platform === "win32" },
      async () => {
        const root = await mkdtemp(join(tmpdir(), "oseo-spawn-cwd-"));
        const direct = createNodeHost();
        const delegated = createNodeHost({ delegateSpawns: true });
        try {
          await mkdir(join(root, "real", "nested"), { recursive: true });
          await symlink(join(root, "real", "nested"), join(root, "link"));
          const request = {
            ...nodeRequest("process.stdout.write(process.cwd())"),
            // join() would normalize `link/..` away, so append it by hand.
            cwd: `${relative(process.cwd(), join(root, "link"))}${sep}..`,
          };
          const expected = await direct.run(request);
          assert.equal(expected.stdout, await realpath(join(root, "real")));
          assert.deepEqual(await delegated.run(request), expected);
        } finally {
          await delegated.close();
          await rm(root, { recursive: true, force: true });
        }
      },
    );

    test("routes complete large concurrent responses", async () => {
      const host = createNodeHost({ delegateSpawns: true });
      try {
        const results = await Promise.all(
          Array.from({ length: 8 }, async (_, i) => {
            return await host.run(
              nodeRequest(`
        setTimeout(() => {
          process.stdout.write('${i}'.repeat(256 * 1024));
          process.stderr.write('e'.repeat(256 * 1024));
        }, ${8 - i});
      `),
            );
          }),
        );
        for (const [i, result] of results.entries()) {
          assert.equal(result.exitStatus, 0);
          assert.equal(result.stdout, String(i).repeat(256 * 1024));
          assert.equal(result.stderr, "e".repeat(256 * 1024));
        }
      } finally {
        await host.close();
      }
    });

    test("snapshots inherited and explicit environments", async () => {
      const host = createNodeHost({ delegateSpawns: true });
      const name = "OSEO_SPAWN_DELEGATE_TEST";
      const previous = process.env[name];
      const request = nodeRequest(
        `console.log(process.env.${name} ?? 'absent')`,
      );
      try {
        process.env[name] = "first";
        assert.equal((await host.run(request)).stdout, "first\n");
        process.env[name] = "second";
        assert.equal((await host.run(request)).stdout, "second\n");
        assert.equal(
          (
            await host.run({
              ...request,
              environment: { variables: {} },
            })
          ).stdout,
          "absent\n",
        );
      } finally {
        if (previous == null) delete process.env[name];
        else process.env[name] = previous;
        await host.close();
      }
    });

    test("spawn failures retain metadata and permit later work", async () => {
      const direct = createNodeHost();
      const host = createNodeHost({ delegateSpawns: true });
      try {
        for (const request of [
          { ...nodeRequest(""), command: "/no-such-oseo-offload-command" },
          { ...nodeRequest(""), cwd: "/no-such-oseo-offload-cwd" },
          { ...nodeRequest(""), command: "bad\0command" },
        ]) {
          const capture = async (run: typeof host.run): Promise<Error> => {
            try {
              await run(request);
            } catch (error) {
              assert.ok(error instanceof Error);
              return error;
            }
            throw new Error("Expected spawn rejection.");
          };
          const expected = await capture(direct.run);
          const actual = await capture(host.run);
          assert.equal(actual.name, expected.name);
          assert.equal(actual.message, expected.message);
          for (const key of ["code", "errno", "path", "syscall", "spawnargs"]) {
            assert.deepEqual(
              Object.getOwnPropertyDescriptor(actual, key)?.value,
              Object.getOwnPropertyDescriptor(expected, key)?.value,
            );
          }
        }
        assert.equal(
          (await host.run(nodeRequest("console.log('ok')"))).stdout,
          "ok\n",
        );
      } finally {
        await host.close();
      }
    });

    test("close drains work and rejects new requests", async () => {
      const host = createNodeHost({ delegateSpawns: true });
      const running = host.run(
        nodeRequest("setTimeout(() => console.log('ok'), 50)"),
      );
      // Let the lazy module import accept the request before closing the host.
      await delay(100);
      const closing = host.close();
      assert.equal((await running).stdout, "ok\n");
      await closing;
      await host.close();
      await assert.rejects(host.run(nodeRequest("")), /closed/u);
      await createNodeHost({ delegateSpawns: true }).close();
    });

    test("close waits for the helper after disconnecting it", async () => {
      // Node emits no `close` for a child whose IPC channel the parent
      // disconnected, so close() must settle on `exit` instead.
      const helpers: ChildProcess[] = [];
      const host = createSpawnDelegate(() => {
        const helper = startSpawnHelper();
        helpers.push(helper);
        return helper;
      });
      assert.equal(
        (await host.run(nodeRequest("console.log('ok')"))).stdout,
        "ok\n",
      );
      await settlesWithin(host.close(), "close()");
      assert.equal(helpers.length, 1);
      assert.equal(helpers[0]!.connected, false);
      assert.equal(helpers[0]!.exitCode, 0);
      await settlesWithin(host.close(), "a repeated close()");
    });

    test("close settles after a helper fails to start", async () => {
      const host = createSpawnDelegate(() =>
        fork(new URL("fixtures/spawn-service.ts", import.meta.url), [], {
          execArgv: [],
          execPath: "/no-such-oseo-offload-node",
          serialization: "advanced",
          silent: true,
        }),
      );
      await assert.rejects(settlesWithin(host.run(nodeRequest("")), "run()"), {
        code: "ENOENT",
      });
      await settlesWithin(host.close(), "close()");
      await assert.rejects(host.run(nodeRequest("")), { code: "ENOENT" });
    });

    test("helper crash rejects pending requests without replay", async () => {
      const host = createSpawnDelegate(() =>
        fork(new URL("fixtures/spawn-service.ts", import.meta.url), ["crash"], {
          execArgv: [],
          serialization: "advanced",
          silent: true,
        }),
      );
      const requests = [host.run(nodeRequest("")), host.run(nodeRequest(""))];
      await Promise.all(
        requests.map(async (request) => {
          await assert.rejects(
            request,
            /Spawn helper (?:closed|disconnected)/u,
          );
        }),
      );
      await assert.rejects(
        host.run(nodeRequest("")),
        /Spawn helper (?:closed|disconnected)/u,
      );
      await host.close();
    });

    test("fake helper and IPC failures reject requests", async () => {
      for (const mode of ["unknown", "disconnect", "malformed"]) {
        const host = createSpawnDelegate(() =>
          fork(new URL("fixtures/spawn-service.ts", import.meta.url), [mode], {
            execArgv: [],
            serialization: "advanced",
            silent: true,
          }),
        );
        await assert.rejects(host.run(nodeRequest("")));
        await host.close();
      }
      const host = createSpawnDelegate(() =>
        fork(
          new URL("fixtures/missing-spawn-service.ts", import.meta.url),
          [],
          {
            execArgv: [],
            silent: true,
          },
        ),
      );
      await assert.rejects(
        host.run(nodeRequest("")),
        /Spawn helper (?:closed|disconnected)/u,
      );
      await host.close();
    });

    test("an idle helper does not keep its parent alive", async () => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("fixtures/spawn-owner.ts", import.meta.url)),
          "idle",
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 5_000 },
      );
      const [code, signal] = await once(child, "close");
      assert.equal(signal, null);
      assert.equal(code, 0);
    });

    test(
      "process-group timeout kills delegated commands and descendants",
      {
        skip: process.platform === "win32",
      },
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "oseo-spawn-group-"));
        const path = join(directory, "pids.json");
        const child = spawn(
          process.execPath,
          [
            fileURLToPath(new URL("fixtures/spawn-owner.ts", import.meta.url)),
            "descendants",
            path,
          ],
          { detached: true, stdio: "ignore" },
        );
        try {
          let pids: readonly number[] | undefined;
          for (let attempt = 0; attempt < 200; attempt++) {
            try {
              // SAFETY: This fixture writes an array of its process IDs.
              pids = JSON.parse(await readFile(path, "utf8")) as number[];
              break;
            } catch {
              await delay(10);
            }
          }
          assert.ok(pids != null, "fixture did not report its descendants");
          const closed = once(child, "close");
          assert.ok(child.pid != null);
          process.kill(-child.pid, "SIGKILL");
          await closed;
          for (const pid of pids) {
            let terminated = false;
            for (let attempt = 0; attempt < 200; attempt++) {
              try {
                if (process.platform === "linux") {
                  // An adopted zombie is dead but may await init's reap.
                  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
                  terminated = stat[stat.lastIndexOf(")") + 2] === "Z";
                } else {
                  process.kill(pid, 0);
                }
              } catch (error) {
                if (
                  error instanceof Error &&
                  "code" in error &&
                  (error.code === "ENOENT" || error.code === "ESRCH")
                ) {
                  terminated = true;
                } else throw error;
              }
              if (terminated) break;
              await delay(10);
            }
            assert.ok(terminated, `process ${pid} survived the group signal`);
          }
        } finally {
          if (child.pid != null) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              /* Already gone. */
            }
          }
          await rm(directory, { force: true, recursive: true });
        }
      },
    );
  },
);
