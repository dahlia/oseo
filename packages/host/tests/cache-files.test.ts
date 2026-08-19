import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  overwriteExistingDenoTextFile,
  overwriteExistingNodeTextFile,
  renameClaimedCacheLockDirectory,
} from "../src/cache-files.ts";

interface DenoTextFileRuntime {
  writeTextFile(
    path: string,
    contents: string,
    options: { readonly create: false },
  ): Promise<void>;
}

function isDenoTextFileRuntime<T>(value: T): value is T & DenoTextFileRuntime {
  return value instanceof Object && "writeTextFile" in value;
}

test("retries transient claimed-directory rename failures", async () => {
  let attempts = 0;
  await renameClaimedCacheLockDirectory(
    () => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.reject(
          Object.assign(new Error("directory is observed"), {
            code: "EPERM",
          }),
        );
      }
      return Promise.resolve();
    },
    "/cache/runtime.a.lock",
    "/cache/runtime.a.dispose",
    {
      deadlineMilliseconds: Date.now() + 1_000,
      retryPermissionErrors: true,
    },
  );
  assert.equal(attempts, 3);
});

test("does not retry a missing claimed directory", async () => {
  let attempts = 0;
  const error = Object.assign(new Error("directory is missing"), {
    code: "ENOENT",
  });
  await assert.rejects(
    renameClaimedCacheLockDirectory(
      () => {
        attempts += 1;
        return Promise.reject(error);
      },
      "/cache/runtime.a.lock",
      "/cache/runtime.a.dispose",
      {
        deadlineMilliseconds: Date.now() + 1_000,
        retryPermissionErrors: true,
      },
    ),
    (observed) => observed === error,
  );
  assert.equal(attempts, 1);
});

test("stops retrying at the claimed-directory deadline", async () => {
  let attempts = 0;
  const error = Object.assign(new Error("directory remains observed"), {
    code: "EPERM",
  });
  await assert.rejects(
    renameClaimedCacheLockDirectory(
      () => {
        attempts += 1;
        return Promise.reject(error);
      },
      "/cache/runtime.a.lock",
      "/cache/runtime.a.dispose",
      {
        deadlineMilliseconds: Date.now(),
        retryPermissionErrors: true,
      },
    ),
    (observed) => observed === error,
  );
  assert.equal(attempts, 1);
});

test("does not retry permission errors for POSIX hosts", async () => {
  let attempts = 0;
  const error = Object.assign(new Error("directory is not writable"), {
    code: "EACCES",
  });
  await assert.rejects(
    renameClaimedCacheLockDirectory(
      () => {
        attempts += 1;
        return Promise.reject(error);
      },
      "/cache/runtime.a.lock",
      "/cache/runtime.a.dispose",
      {
        deadlineMilliseconds: Date.now() + 1_000,
        retryPermissionErrors: false,
      },
    ),
    (observed) => observed === error,
  );
  assert.equal(attempts, 1);
});

test("does not join a replacement Node cache-lock directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-node-claim-"));
  const lockPath = join(directory, "artifact.lock");
  const displacedPath = join(directory, "displaced.lock");
  const claimName = "renew-owner";
  const claimPath = join(lockPath, claimName);
  const replacementOwnerPath = join(lockPath, "owner-replacement");
  try {
    await mkdir(lockPath);
    await writeFile(claimPath, "long owner state");
    await rename(lockPath, displacedPath);
    await mkdir(lockPath);
    await writeFile(replacementOwnerPath, "replacement");

    await assert.rejects(
      overwriteExistingNodeTextFile(claimPath, "stale owner"),
    );
    await assert.rejects(stat(claimPath));
    assert.equal(await readFile(replacementOwnerPath, "utf8"), "replacement");

    const displacedClaimPath = join(displacedPath, claimName);
    await overwriteExistingNodeTextFile(displacedClaimPath, "new");
    assert.equal(await readFile(displacedClaimPath, "utf8"), "new");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("does not join a replacement Deno cache-lock directory", async () => {
  const runtime = Object.getOwnPropertyDescriptor(globalThis, "Deno")?.value;
  if (!isDenoTextFileRuntime(runtime)) return;

  const directory = await mkdtemp(join(tmpdir(), "oseo-deno-claim-"));
  const lockPath = join(directory, "artifact.lock");
  const displacedPath = join(directory, "displaced.lock");
  const claimName = "renew-owner";
  const claimPath = join(lockPath, claimName);
  const replacementOwnerPath = join(lockPath, "owner-replacement");
  try {
    await mkdir(lockPath);
    await writeFile(claimPath, "long owner state");
    await rename(lockPath, displacedPath);
    await mkdir(lockPath);
    await writeFile(replacementOwnerPath, "replacement");

    await assert.rejects(
      overwriteExistingDenoTextFile(runtime, claimPath, "stale owner"),
    );
    await assert.rejects(stat(claimPath));
    assert.equal(await readFile(replacementOwnerPath, "utf8"), "replacement");

    const displacedClaimPath = join(displacedPath, claimName);
    await overwriteExistingDenoTextFile(runtime, displacedClaimPath, "new");
    assert.equal(await readFile(displacedClaimPath, "utf8"), "new");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
