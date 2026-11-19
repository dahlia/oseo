import { deepStrictEqual, equal, match, throws } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { seal, verify } from "../tools/release/artifacts.ts";
import { identify } from "../tools/release/identity.ts";
import { advancesTag } from "../tools/release/publish.ts";
import { stageJsr } from "../tools/release/stage.ts";
import { parsedObject } from "../tools/structured-data.ts";

const sha = "abcdef0123456789abcdef0123456789abcdef01";
const main = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REPOSITORY: "dahlia/oseo",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_NUMBER: "123",
  GITHUB_SHA: sha,
};

test("main canaries are stable across attempts", () => {
  const release = identify("0.1.0", sha, main);
  deepStrictEqual(release, {
    sha,
    channel: "canary",
    npm: "0.1.0-canary.123",
    jsr: "0.1.0-canary.123+abcdef0",
    run: "123",
  });
  deepStrictEqual(
    identify("0.1.0", sha, { ...main, GITHUB_RUN_ATTEMPT: "2" }),
    release,
  );
});

test("only canonical main and exact stable tag pushes can publish", () => {
  for (const input of [
    { GITHUB_REPOSITORY: "other/oseo" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "workflow_dispatch" },
    { GITHUB_REF: "refs/heads/next" },
    { GITHUB_REF: "refs/heads/release-rehearsal" },
    { GITHUB_REF: "refs/tags/v0.1.0" },
    { GITHUB_REF: "refs/tags/0.1.0-rc.1" },
  ]) {
    equal(identify("0.1.0", sha, { ...main, ...input }).channel, "build");
  }
  const tag = { ...main, GITHUB_REF: "refs/tags/0.1.0" };
  equal(identify("0.1.0", sha, tag).channel, "stable");
  throws(() => identify("0.2.0", sha, tag), /does not match/u);
  throws(() => identify("0.2.0", sha, { ...main, GITHUB_SHA: "wrong" }));
});

test("older runs and maintenance releases do not roll back dist-tags", () => {
  equal(advancesTag("0.2.0-canary.4", "0.1.0-canary.5"), false);
  equal(advancesTag("0.1.0-canary.10", "0.1.0-canary.9"), true);
  equal(advancesTag("0.1.0-canary.10", "0.1.0-canary.10"), true);
  equal(advancesTag("0.9.3", "0.10.0"), false);
  equal(advancesTag("0.10.1", "0.10.0"), true);
  equal(advancesTag("0.1.0", "0.1.0-canary.0"), true);
  throws(() => advancesTag("0.1.0-canary.1", "unknown"));
});

test("artifact verification rejects the wrong revision or bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "oseo-release-test-"));
  try {
    const file = join(directory, "package.tgz");
    writeFileSync(file, "staged bytes");
    seal(directory, sha);
    verify(directory, sha);
    throws(() => verify(directory, "wrong"), /checked inventory/u);
    symlinkSync(file, join(directory, "alias"));
    throws(() => verify(directory, sha), /Unexpected artifact member/u);
    rmSync(join(directory, "alias"));
    writeFileSync(file, "different bytes");
    throws(() => verify(directory, sha), /checked inventory/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("JSR stages one license ID and preserves the component notices", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "oseo-stage-test-"));
  try {
    const packages = [
      {
        directory: "backend-c",
        license: "GPL-3.0-or-later AND MIT",
        notices: ["MIT-LICENSE.txt", "src/emitted-c.ts"],
      },
      {
        directory: "runtime-c",
        license: "GPL-3.0-or-later AND MIT AND Unicode-3.0",
        notices: [
          "MIT-LICENSE.txt",
          "UNICODE-LICENSE.txt",
          "native/runtime_unicode_tables.h",
        ],
      },
      {
        directory: "unicode",
        license: "GPL-3.0-or-later AND Unicode-3.0",
        notices: ["UNICODE-LICENSE.txt"],
      },
      {
        directory: "compiler",
        license: "GPL-3.0-or-later",
        notices: [],
      },
    ];
    const files = packages.map(({ directory }) =>
      Object.fromEntries(
        ["package.json", "deno.json"].map((name) => [
          name,
          readFileSync(join(root, "packages", directory, name)),
        ]),
      ),
    );
    const destination = join(work, "jsr");
    const version = "0.1.0-canary.123+abcdef0";
    stageJsr(
      root,
      destination,
      packages.map(({ directory }) => ({
        directory,
        name: `@oseo/${directory}`,
      })),
      version,
    );
    for (const [index, { directory, license, notices }] of packages.entries()) {
      const source = join(root, "packages", directory);
      const staged = join(destination, directory);
      for (const name of ["package.json", "deno.json"]) {
        const bytes = readFileSync(join(source, name));
        deepStrictEqual(bytes, files[index]?.[name]);
        const manifest = parsedObject(JSON.parse(bytes.toString("utf8")), name);
        equal(manifest.license, license);
      }
      const config = readFileSync(join(staged, "deno.json"), "utf8");
      deepStrictEqual(JSON.parse(config), {
        ...parsedObject(
          JSON.parse(readFileSync(join(source, "deno.json"), "utf8")),
          directory,
        ),
        license: "GPL-3.0-or-later",
        version,
      });
      for (const name of ["LICENSE", "README.md", ...notices]) {
        deepStrictEqual(
          readFileSync(join(staged, name)),
          readFileSync(join(source, name)),
          `${directory}/${name}`,
        );
      }
    }
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
});

test("JSR rejects unmapped expressions and accepts an SPDX alias", () => {
  const root = mkdtempSync(join(tmpdir(), "oseo-stage-test-"));
  try {
    const controls = [
      { directory: "compiler", license: "GPL-3.0-or-later AND MIT" },
      {
        directory: "backend-c",
        license: "GPL-3.0-or-later AND MIT AND Unicode-3.0",
      },
      { directory: "host", license: "GPL-3.0+" },
    ];
    for (const { directory, license } of controls) {
      const source = join(root, "packages", directory);
      const name = `@oseo/${directory}`;
      mkdirSync(source, { recursive: true });
      writeFileSync(
        join(source, "deno.json"),
        JSON.stringify({ name, license }),
      );
      const destination = join(root, `jsr-${directory}`);
      const stage = (): void =>
        stageJsr(root, destination, [{ directory, name }], "0.1.0");
      if (directory === "host") {
        stage();
        const config = readFileSync(
          join(destination, directory, "deno.json"),
          "utf8",
        );
        equal(parsedObject(JSON.parse(config), directory).license, license);
      } else {
        throws(stage, /needs a single JSR license identifier/u);
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

const rekorConflict = [
  "npm error code TLOG_CREATE_ENTRY_ERROR",
  "npm error error creating tlog entry - (409) an equivalent entry " +
    `already exists in the transparency log with UUID ${"a".repeat(80)}`,
].join("\n");
const registry = "https://registry.npmjs.org";
const packument = `${registry}/%40oseo%2Fcompiler`;
const tagEndpoint = `${registry}/-/package/%40oseo%2Fcompiler/dist-tags`;
const version = "0.1.0-canary.123";
const older = { canary: "0.1.0-canary.122" };
const newer = { canary: "0.1.0-canary.124" };
const tarball = `oseo-compiler-${version}.tgz`;
const tarballBytes = "staged bytes";
const hash = createHash("sha512").update(tarballBytes).digest("base64");
const integrity = `sha512-${hash}`;
const absent = { versions: {} };
const matching = { versions: { [version]: { dist: { integrity } } } };
const mismatched = {
  versions: { [version]: { dist: { integrity: "sha512-different" } } },
};

// Each publish attempt starts a fresh Node process in place of the npm CLI.
// The publisher child has no executables on PATH and uses a local fetch stub.
const npmFixture = `
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const { sha, responses, failures } = JSON.parse(
  readFileSync(new URL("scenario.json", import.meta.url), "utf8"),
);
const { spawn } = childProcess;
childProcess.spawn = (command, args, options) => {
  assert.equal(command, "npm");
  const failure = failures.shift();
  return spawn(process.execPath, [
    "--eval",
    "console.log(process.argv[1]); if (process.argv[2]) {" +
      "console.error(process.argv[2]); process.exitCode = 1; }",
    JSON.stringify(args),
    failure ?? "",
  ], options);
};
childProcess.execFileSync = (command, args) => {
  if (command === "git") {
    assert.deepEqual(args, ["rev-parse", "HEAD"]);
    return sha;
  }
  assert.equal(command, "npm");
  assert.equal(args[0], "dist-tag");
  console.log(JSON.stringify(args));
};
syncBuiltinESMExports();
globalThis.fetch = async (url) => {
  console.log(JSON.stringify(url));
  assert.ok(responses.length, "Unexpected registry request");
  const response = responses.shift();
  return typeof response === "number"
    ? new Response(null, { status: response })
    : Response.json(response);
};
`;

interface NpmScenario {
  readonly responses: readonly (object | number)[];
  readonly failures: readonly string[];
  readonly calls: readonly ("check" | "tags" | "publish" | "tag" | "older")[];
  readonly error?: RegExp;
}

function checkNpmScenario({
  responses,
  failures,
  calls,
  error,
}: NpmScenario): void {
  const root = mkdtempSync(join(tmpdir(), "oseo-publish-test-"));
  try {
    const directory = join(root, "packages");
    mkdirSync(join(directory, "npm"), { recursive: true });
    const file = join(directory, "npm", tarball);
    writeFileSync(file, tarballBytes);
    writeFileSync(
      join(directory, "packages.json"),
      JSON.stringify({
        packages: [{ directory: "compiler", name: "@oseo/compiler", tarball }],
      }),
    );
    writeFileSync(
      join(directory, "identity.json"),
      JSON.stringify(identify("0.1.0", sha, main)),
    );
    seal(directory, sha);
    const preload = join(root, "fixture.mjs");
    writeFileSync(preload, npmFixture);
    writeFileSync(
      join(root, "scenario.json"),
      JSON.stringify({ sha, responses, failures }),
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./fixture.mjs",
        fileURLToPath(new URL("../tools/release/publish.ts", import.meta.url)),
        "npm",
        directory,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...main, OSEO_ENABLE_PUBLICATION: "true", PATH: root },
      },
    );
    if (result.error != null) throw result.error;
    equal(result.status, error == null ? 0 : 1, result.stderr);
    if (error != null) match(result.stderr, error);
    for (const failure of failures) {
      equal(result.stderr.includes(failure), true, result.stderr);
    }
    const publish = (tag: string): string[] => [
      "publish",
      file,
      "--access",
      "public",
      "--tag",
      tag,
      "--registry",
      registry,
      "--ignore-scripts",
    ];
    const expected = {
      check: packument,
      tags: tagEndpoint,
      publish: publish("canary"),
      older: publish("canary-older"),
      tag: [
        "dist-tag",
        "add",
        `@oseo/compiler@${version}`,
        "canary",
        "--registry",
        registry,
      ],
    };
    deepStrictEqual(
      result.stdout
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line)),
      calls.map((call) => expected[call]),
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test("npm retries with the same args and verifies bytes", () => {
  for (const failure of [
    rekorConflict,
    rekorConflict
      .replace("a".repeat(80), "a".repeat(64))
      .replaceAll("\n", "\r\n"),
  ]) {
    checkNpmScenario({
      responses: [absent, older, absent, older, matching],
      failures: [failure],
      calls: ["check", "tags", "publish", "check", "tags", "publish", "check"],
    });
  }
});

test("npm uses the current tag when an exact artifact appears", () => {
  checkNpmScenario({
    responses: [absent, older, matching, older],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check", "tags", "tag"],
  });
  checkNpmScenario({
    responses: [absent, older, matching, newer],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check", "tags"],
  });
});

test("npm keeps the destination and protects newer tags", () => {
  checkNpmScenario({
    responses: [absent, newer, absent, newer, matching],
    failures: [rekorConflict],
    calls: ["check", "tags", "older", "check", "tags", "older", "check"],
  });
  checkNpmScenario({
    responses: [absent, older, absent, newer],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check", "tags"],
    error: /npm publish failed/u,
  });
});

test("npm aborts on registry errors or mismatches after a conflict", () => {
  checkNpmScenario({
    responses: [absent, older, { versions: { [version]: null } }],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check"],
    error: /Release metadata must be/u,
  });
  checkNpmScenario({
    responses: [absent, older, 503],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check"],
    error: /HTTP 503/u,
  });
  checkNpmScenario({
    responses: [absent, older, mismatched],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check"],
    error: /differs from the staged tarball/u,
  });
});

test("npm rejects mismatched bytes after a successful retry", () => {
  checkNpmScenario({
    responses: [absent, older, absent, older, mismatched],
    failures: [rekorConflict],
    calls: ["check", "tags", "publish", "check", "tags", "publish", "check"],
    error: /differs from the staged tarball/u,
  });
});

test("npm leaves unrelated failures and a second Rekor conflict fatal", () => {
  for (const failure of [
    rekorConflict.replace("TLOG_CREATE_ENTRY_ERROR", "E409"),
    rekorConflict.replace("(409)", "(503)"),
    rekorConflict.replace("an equivalent entry", "a different entry"),
  ]) {
    checkNpmScenario({
      responses: [absent, older],
      failures: [failure],
      calls: ["check", "tags", "publish"],
      error: /npm publish failed/u,
    });
  }
  checkNpmScenario({
    responses: [absent, older, absent, older],
    failures: [rekorConflict, rekorConflict],
    calls: ["check", "tags", "publish", "check", "tags", "publish"],
    error: /npm publish failed/u,
  });
});
