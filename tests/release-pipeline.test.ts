import { deepStrictEqual, equal, throws } from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { seal, verify } from "../tools/release/artifacts.ts";
import { identify } from "../tools/release/identity.ts";
import { advancesTag } from "../tools/release/publish.ts";

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
