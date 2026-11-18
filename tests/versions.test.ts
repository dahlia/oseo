/* eslint-disable no-await-in-loop -- Fixture files are created in order. */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
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
import { promisify } from "node:util";

import {
  bumpWorkspaceVersion,
  checkWorkspaceVersions,
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
  ["unicode", "@oseo/unicode"],
] as const;

const execFileAsync = promisify(execFile);

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oseo-versions-"));
  await copyFile(
    new URL("../sacho.toml", import.meta.url),
    join(root, "sacho.toml"),
  );
  await mkdir(join(root, "changes.d"));
  await writeFile(join(root, "changes.d", "next"), "0.0.0\n");
  await writeFile(
    join(root, "CHANGES.md"),
    "Oseo changelog\n==============\n\nVersion 0.0.0\n-------------\n\n" +
      "To be released.\n",
  );
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
    join(root, "changes.d", "next"),
    join(root, "CHANGES.md"),
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
    await bumpWorkspaceVersion(root, "1.2.3");
    assert.deepEqual(await checkWorkspaceVersions(root), {
      packageCount: 9,
      state: "development",
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
      packageCount: 10,
      state: "development",
      version: "0.0.0",
    });
    await bumpWorkspaceVersion(root, "1.2.3");
    for (const filename of ["package.json", "deno.json"]) {
      // SAFETY: The fixture generator writes manifests with a version field.
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
      bumpWorkspaceVersion(
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
      bumpWorkspaceVersion(root, "1.2.3", fileOperations({ failRenameAt: 2 })),
    );
    assert.deepEqual(await workspaceSnapshot(root), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("restores manifests when Sacho cannot complete the bump", async () => {
  const root = await fixtureWorkspace();
  try {
    const before = await workspaceSnapshot(root);
    const operations = fileOperations();
    await assert.rejects(
      bumpWorkspaceVersion(root, "1.2.3", {
        ...operations,
        async rename(from, to) {
          // Simulate a configuration failure after the preflight check.
          await writeFile(join(root, "sacho.toml"), "invalid toml\n");
          await operations.rename(from, to);
        },
      }),
      /original files were restored/u,
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
    // SAFETY: The fixture writes this package's dependency record.
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

test("rejects malformed dependency fields and ranges", async () => {
  const root = await fixtureWorkspace();
  const cliPath = join(root, "packages", "cli", "package.json");
  try {
    const valid = JSON.parse(await readFile(cliPath, "utf8"));
    await writeFile(
      cliPath,
      `${JSON.stringify({ ...valid, dependencies: "@oseo/compiler" })}\n`,
    );
    await assert.rejects(checkWorkspaceVersions(root), /must be objects/u);

    await writeFile(
      cliPath,
      `${JSON.stringify({
        ...valid,
        dependencies: { "@oseo/compiler": 1 },
      })}\n`,
    );
    await assert.rejects(checkWorkspaceVersions(root), /must be strings/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires an unadorned x.y.z for the development version", async () => {
  const root = await fixtureWorkspace();
  try {
    for (const version of [
      "1.0.0-rc.1",
      "1.0.0+meta",
      "01.0.0",
      "v1.0.0",
      "1.0.0\n",
    ]) {
      await assert.rejects(bumpWorkspaceVersion(root, version), /SemVer/u);
    }
    await writeFile(join(root, "changes.d", "next"), "0.0.0\n0.0.1\n");
    await assert.rejects(checkWorkspaceVersions(root), /one x\.y\.z SemVer/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires a frozen Sacho section when next is absent", async () => {
  const root = await fixtureWorkspace();
  try {
    await rm(join(root, "changes.d", "next"));
    await assert.rejects(checkWorkspaceVersions(root), /sacho check failed/u);
    await writeFile(
      join(root, "CHANGES.md"),
      "Oseo changelog\n==============\n\nVersion 0.0.1\n-------------\n\n" +
        "Released on November 19, 2026.\n",
    );
    await assert.rejects(
      checkWorkspaceVersions(root),
      /sacho show 0\.0\.0 failed/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects a manifest that disagrees with next", async () => {
  const root = await fixtureWorkspace();
  try {
    await writeFile(join(root, "changes.d", "next"), "0.0.1\n");
    await assert.rejects(checkWorkspaceVersions(root), /does not match/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validates a release-only tree and opens its next cycle", async () => {
  const root = await fixtureWorkspace();
  const next = join(root, "changes.d", "next");
  const changelog = join(root, "CHANGES.md");
  try {
    await execFileAsync(
      "sacho",
      ["release", "--allow-empty", "--date", "2026-11-19"],
      { cwd: root },
    );
    // Git does not retain an empty fragment directory in a checkout.
    await rm(join(root, "changes.d"), { recursive: true });
    await assert.rejects(readFile(next), { code: "ENOENT" });
    const released = await readFile(changelog, "utf8");
    assert.deepEqual(await checkWorkspaceVersions(root), {
      packageCount: 9,
      state: "released",
      version: "0.0.0",
    });
    await assert.rejects(
      bumpWorkspaceVersion(root, "0.0.0"),
      /already released/u,
    );
    await bumpWorkspaceVersion(root, "0.0.1");
    assert.equal(await readFile(next, "utf8"), "0.0.1\n");
    assert.match(await readFile(changelog, "utf8"), /Version 0\.0\.1/u);
    assert.ok(
      (await readFile(changelog, "utf8")).endsWith(
        released.slice(released.indexOf("Version 0.0.0")),
      ),
    );
    assert.deepEqual(await checkWorkspaceVersions(root), {
      packageCount: 9,
      state: "development",
      version: "0.0.1",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
