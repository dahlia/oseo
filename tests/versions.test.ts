/* eslint-disable no-await-in-loop -- Fixture files are created in order. */

import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkWorkspaceVersions,
  setWorkspaceVersion,
} from "../tools/versions.ts";
import type { VersionFileOperations } from "../tools/versions.ts";

const packages = [
  ["backend-c", "@oseo/backend-c"],
  ["cli", "@oseo/cli"],
  ["compiler", "@oseo/compiler"],
  ["host", "@oseo/host"],
  ["parser-babel", "@oseo/parser-babel"],
  ["runtime-c", "@oseo/runtime-c"],
  ["testkit", "@oseo/testkit"],
  ["toolchain-zig", "@oseo/toolchain-zig"],
] as const;

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oseo-versions-"));
  await writeFile(join(root, "VERSION"), "0.0.0\n");
  for (const [directory, name] of packages) {
    const packageRoot = join(root, "packages", directory);
    await mkdir(packageRoot, { recursive: true });
    const dependencies =
      name === "@oseo/cli" ? { "@oseo/compiler": "workspace:*" } : {};
    await writeFile(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ dependencies, name, version: "0.0.0" }, null, 2)}\n`,
    );
    await writeFile(
      join(packageRoot, "deno.json"),
      `${JSON.stringify({ name, version: "0.0.0" }, null, 2)}\n`,
    );
  }
  return root;
}

async function workspaceSnapshot(root: string): Promise<readonly string[]> {
  const paths = [
    join(root, "VERSION"),
    ...packages.flatMap(([directory]) => [
      join(root, "packages", directory, "package.json"),
      join(root, "packages", directory, "deno.json"),
    ]),
  ];
  return await Promise.all(
    paths.map(async (path) => await readFile(path, "utf8")),
  );
}

function fileOperations(options?: {
  readonly failRenameAt?: number;
  readonly failTemporaryWrite?: boolean;
}): VersionFileOperations {
  let renameCount = 0;
  return {
    async read(path: string): Promise<string> {
      return await readFile(path, "utf8");
    },
    async remove(path: string): Promise<void> {
      await rm(path, { force: true });
    },
    async rename(from: string, to: string): Promise<void> {
      renameCount += 1;
      if (renameCount === options?.failRenameAt) {
        throw new Error("injected rename failure");
      }
      await rename(from, to);
    },
    async write(path: string, contents: string): Promise<void> {
      if (
        options?.failTemporaryWrite === true &&
        path.includes(".oseo-version-")
      ) {
        throw new Error("injected write failure");
      }
      await writeFile(path, contents);
    },
  };
}

test("updates every package version in one operation", async () => {
  const root = await fixtureWorkspace();
  try {
    await setWorkspaceVersion(root, "1.2.3");
    assert.deepEqual(await checkWorkspaceVersions(root), {
      packageCount: 8,
      version: "1.2.3",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("discovers newly added workspace packages", async () => {
  const root = await fixtureWorkspace();
  const packageRoot = join(root, "packages", "frontend-next");
  try {
    await mkdir(packageRoot);
    for (const filename of ["package.json", "deno.json"]) {
      await writeFile(
        join(packageRoot, filename),
        `${JSON.stringify(
          { name: "@oseo/frontend-next", version: "0.0.0" },
          null,
          2,
        )}\n`,
      );
    }
    assert.deepEqual(await checkWorkspaceVersions(root), {
      packageCount: 9,
      version: "0.0.0",
    });
    await setWorkspaceVersion(root, "1.2.3");
    for (const filename of ["package.json", "deno.json"]) {
      const manifest = JSON.parse(
        await readFile(join(packageRoot, filename), "utf8"),
      ) as { readonly version: string };
      assert.equal(manifest.version, "1.2.3");
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("keeps manifests after a temporary write failure", async () => {
  const root = await fixtureWorkspace();
  try {
    const before = await workspaceSnapshot(root);
    await assert.rejects(
      setWorkspaceVersion(
        root,
        "1.2.3",
        fileOperations({ failTemporaryWrite: true }),
      ),
    );
    assert.deepEqual(await workspaceSnapshot(root), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rolls back replaced files after a rename failure", async () => {
  const root = await fixtureWorkspace();
  try {
    const before = await workspaceSnapshot(root);
    await assert.rejects(
      setWorkspaceVersion(root, "1.2.3", fileOperations({ failRenameAt: 2 })),
    );
    assert.deepEqual(await workspaceSnapshot(root), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects missing and inconsistent package metadata", async () => {
  const root = await fixtureWorkspace();
  try {
    await rm(join(root, "packages", "host", "deno.json"));
    await assert.rejects(checkWorkspaceVersions(root), /manifest is missing/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects non-workspace internal dependencies", async () => {
  const root = await fixtureWorkspace();
  try {
    const cliPath = join(root, "packages", "cli", "package.json");
    const manifest = JSON.parse(await readFile(cliPath, "utf8")) as {
      dependencies: Record<string, string>;
    };
    manifest.dependencies["@oseo/compiler"] = "0.0.0";
    await writeFile(cliPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(checkWorkspaceVersions(root), /workspace:\*/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects invalid strict SemVer values", async () => {
  const root = await fixtureWorkspace();
  try {
    await assert.rejects(setWorkspaceVersion(root, "1.0.0-01"), /SemVer/u);
    await assert.rejects(setWorkspaceVersion(root, "01.0.0"), /SemVer/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
