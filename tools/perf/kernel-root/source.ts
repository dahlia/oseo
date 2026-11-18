import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { fileIdentity } from "../../perf-profile-capture.ts";
import type { FileIdentity } from "../../perf-profile-capture.ts";
import type * as S from "../native-host-collector.ts";

/** Direct Root allocation of a normally committed immutable source closure. */
export interface KernelSource {
  readonly root: string;
  readonly commit: string;
  readonly tree: string;
  readonly files: readonly FileIdentity[];
}

/** Verify before starting S, when synchronous Git checks cannot block it. */
export function verifyKernelSource(source: KernelSource): void {
  assert.equal(realpathSync(source.root), source.root);
  const git = (...args: string[]): string =>
    execFileSync("git", args, {
      cwd: source.root,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }).trim();
  assert.equal(git("rev-parse", "--show-toplevel"), source.root);
  assert.equal(git("rev-parse", "HEAD"), source.commit);
  assert.equal(git("rev-parse", "HEAD^{tree}"), source.tree);
  assert.equal(git("status", "--porcelain", "--untracked-files=all"), "");
  assert.ok(
    git("ls-files", "-v")
      .split("\n")
      .every((row) => row.startsWith("H ")),
  );
  const paths = new Set(source.files.map((file) => file.path));
  assert.equal(paths.size, source.files.length);
  assert.ok(paths.size > 0);
  for (const pin of source.files) assert.deepEqual(fileIdentity(pin.path), pin);
  for (const name of git("ls-files", "-z").split("\0")) {
    if (name && /\.(?:[cm]?[jt]s|json|py)$/u.test(name)) {
      assert.ok(
        paths.has(join(source.root, name)),
        `Unpinned closure: ${name}`,
      );
    }
  }
}

/** No locator or staged source can supply an accepted collector dependency. */
export async function loadKernelCollector(
  source: KernelSource,
  acceptance: readonly FileIdentity[],
): Promise<typeof S> {
  assert.ok(acceptance.length > 0, "Missing Root dependency acceptance");
  for (const pin of acceptance) assert.deepEqual(fileIdentity(pin.path), pin);
  verifyKernelSource(source);
  const path = join(source.root, "tools/perf/native-host-collector.ts");
  assert.ok(source.files.some((file) => file.path === path));
  // SAFETY: Root accepted this exact committed API and pinned its full closure.
  return import(pathToFileURL(path).href) as Promise<typeof S>;
}

/** Raw control storage must be canonical, private and owned by this UID. */
export function requireKernelDirectory(path: string): void {
  assert.equal(realpathSync(path), path);
  const meta = lstatSync(path);
  assert.ok(meta.isDirectory());
  assert.equal(meta.mode & 0o777, 0o700);
  assert.equal(meta.uid, process.getuid!());
}
