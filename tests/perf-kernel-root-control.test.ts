import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  readKernelControl,
  readKernelOriginalJson,
  waitKernelControl,
  writeKernelControl,
  writeKernelAllocation,
} from "../tools/perf/kernel-root/control.ts";
import { fileIdentity } from "../tools/perf-profile-capture.ts";
import { profileInventory } from "../tools/perf/kernel-root/profile-replay.ts";

/** Private fixtures require POSIX ownership and mode semantics. */
const posixFixture = {
  skip:
    process.platform === "linux" || process.platform === "darwin"
      ? false
      : "requires POSIX ownership and private file modes",
};

/** Private IPC fixtures, without H, S, supervisor or native execution. */
async function fixture(
  operation: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-root-control-")),
  );
  chmodSync(directory, 0o700);
  try {
    await operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test(
  "control publication round-trips and refuses replacement",
  posixFixture,
  async () => {
    await fixture(async (directory) => {
      const path = join(directory, "request.json");
      const original = { sequence: 0, phase: "diagnosis", fixture: true };
      writeKernelControl(path, original);
      assert.deepEqual(readKernelControl(path), original);
      assert.deepEqual(
        await waitKernelControl(
          directory,
          "request.json",
          1000,
          new AbortController().signal,
        ),
        original,
      );
      assert.throws(() => writeKernelControl(path, { sequence: 1 }));
      assert.deepEqual(readKernelControl(path), original);
    });
  },
);

test(
  "channel loss cannot produce a successful response",
  posixFixture,
  async () => {
    await fixture(async (directory) => {
      const stopped = new AbortController();
      const pending = waitKernelControl(
        directory,
        "missing.json",
        null,
        stopped.signal,
      );
      stopped.abort(new Error("fixture parent loss"));
      await assert.rejects(pending, /fixture parent loss/);
    });
  },
);

test(
  "raw rejects symlinks and public control permissions",
  posixFixture,
  async () => {
    await fixture(async (directory) => {
      const path = join(directory, "original.json");
      writeKernelControl(path, { fixture: true });
      chmodSync(path, 0o644);
      assert.throws(() => readKernelControl(path));
      chmodSync(path, 0o600);
      symlinkSync(path, join(directory, "alias.json"));
      assert.throws(() => profileInventory(directory));
    });
  },
);

for (const fault of ["none", "missing", "tampered", "reordered", "forged"]) {
  test(
    `bounded transport replays original bytes: ${fault}`,
    posixFixture,
    async () => {
      await fixture(async (directory) => {
        const path = join(directory, "proof.json");
        const allocationDirectory = "/Users/runner/allocations/";
        const original = {
          control: { phase: "finalize", request: { id: "original-request" } },
          proof: {
            raw: Array.from({ length: 300 }, (_, index) => ({
              path: allocationDirectory + `${"long-path/".repeat(15)}${index}`,
              sha256: "a".repeat(64),
            })),
          },
        };
        assert.ok(Buffer.byteLength(JSON.stringify(original)) > 65_536);
        writeKernelControl(path, original);
        const firstPart = readdirSync(directory).find((name) =>
          name.includes(".part-"),
        );
        for (const name of readdirSync(directory))
          assert.ok(fileIdentity(join(directory, name)).bytes <= 65_536);
        const first = join(directory, firstPart!);
        if (fault === "missing") rmSync(first);
        if (fault === "tampered") writeFileSync(first, "tampered");
        if (fault === "reordered" || fault === "forged") {
          const frame = JSON.parse(readFileSync(path, "utf8"));
          if (fault === "reordered") frame.parts.reverse();
          else frame.sha256 = "0".repeat(64);
          writeFileSync(path, JSON.stringify(frame));
        }
        if (fault === "none") {
          assert.deepEqual(readKernelControl(path), original);
          assert.deepEqual(
            await waitKernelControl(
              directory,
              "proof.json",
              1000,
              new AbortController().signal,
            ),
            original,
          );
        } else assert.throws(() => readKernelControl(path));
      });
    },
  );
}

test(
  "an oversized unframed control remains invalid",
  posixFixture,
  async () => {
    await fixture(async (directory) => {
      const path = join(directory, "unframed.json");
      writeFileSync(path, JSON.stringify("a".repeat(65_536)), { mode: 0o600 });
      assert.throws(() => readKernelControl(path));
    });
  },
);

test(
  "large child allocations preserve original JSON",
  posixFixture,
  async () => {
    await fixture(async (directory) => {
      const path = join(directory, "child.json");
      const original = { files: "a".repeat(100_000) };
      writeKernelAllocation(path, original);
      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), original);
      assert.throws(() => readKernelControl(path));
    });
  },
);

/** S's writer: whole JSON, no trailing newline, exclusive create, 0600. */
function writeSOriginal(path: string, json: string): void {
  writeFileSync(path, json, { flag: "wx", mode: 0o600 });
}

test(
  "an unframed S original past one frame is read whole",
  posixFixture,
  async () => {
    await fixture(async (directory) => {
      const path = join(directory, "finish.json");
      const original = {
        finalChildren: Array.from({ length: 2000 }, (_, pid) => ({
          pid,
          reaped: true,
          groupAbsent: true,
        })),
      };
      writeSOriginal(path, JSON.stringify(original));
      assert.ok(fileIdentity(path).bytes > 65_536);
      assert.deepEqual(readKernelOriginalJson(path), original);
      // The private control ceiling still applies to the frame codec.
      assert.throws(() => readKernelControl(path));
    });
  },
);

for (const fault of [
  "parts",
  "mode",
  "symlink",
  "directory",
  "syntax",
] as const)
  test(
    `an S original stays an exact private file: ${fault}`,
    posixFixture,
    async () => {
      await fixture(async (directory) => {
        const path = join(directory, "sample.json");
        const original = { inventory: "a".repeat(100_000) };
        if (fault === "parts") writeKernelControl(path, original);
        if (fault === "mode") {
          writeSOriginal(path, JSON.stringify(original));
          chmodSync(path, 0o644);
        }
        if (fault === "symlink") {
          const target = join(directory, "target.json");
          writeSOriginal(target, JSON.stringify(original));
          symlinkSync(target, path);
        }
        if (fault === "directory") mkdirSync(path, { mode: 0o700 });
        if (fault === "syntax")
          writeFileSync(path, "{", { flag: "wx", mode: 0o600 });
        assert.throws(
          () => readKernelOriginalJson(path),
          fault === "parts"
            ? /parts frame/u
            : fault === "syntax"
              ? SyntaxError
              : assert.AssertionError,
        );
        // A partitioned control still decodes through its own codec.
        if (fault === "parts")
          assert.deepEqual(readKernelControl(path), original);
      });
    },
  );
