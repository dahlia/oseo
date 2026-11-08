/* eslint-disable no-await-in-loop -- Cache state transitions are sequential. */

import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  checkRestoredMise,
  miseCacheKey,
  checksumForAsset,
  curlPolicy,
  curlConfigName,
  downloadText,
  rawAsset,
  verifyChecksums,
  verifyMiseBinary,
} from "../tools/ci/mise-bootstrap.ts";

function isTcpAddress(
  address: AddressInfo | string | null,
): address is AddressInfo {
  return address != null && typeof address !== "string";
}

function signedChecksums(text: string): readonly [string, string] {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const id = Buffer.from("01234567");
  const publicBytes = publicKey.export({ type: "spki", format: "der" });
  const key = Buffer.concat([
    Buffer.from("Ed"),
    id,
    publicBytes.subarray(-32),
  ]).toString("base64");
  const signature = sign(
    null,
    createHash("blake2b512").update(text).digest(),
    privateKey,
  );
  const comment = "fixture";
  const globalSignature = sign(
    null,
    Buffer.concat([signature, Buffer.from(comment)]),
    privateKey,
  );
  return [
    key,
    [
      "untrusted comment: fixture",
      Buffer.concat([Buffer.from("ED"), id, signature]).toString("base64"),
      `trusted comment: ${comment}`,
      globalSignature.toString("base64"),
    ].join("\n"),
  ];
}

test("mise retries HTTP 504 and incomplete responses", async () => {
  let requests = 0;
  const delays: number[] = [];
  const server = createServer((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(504);
      response.end("Gateway Timeout");
    } else if (requests === 2) {
      response.writeHead(200, { "Content-Length": "100" });
      response.end("short");
    } else {
      response.end("2026.11.4");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(isTcpAddress(address));
  try {
    const value = await downloadText(
      `http://127.0.0.1:${address.port}/VERSION`,
      (text) => {
        rawAsset(text, "linux", "x64");
      },
      fetch,
      async (milliseconds) => {
        delays.push(milliseconds);
      },
    );
    assert.equal(value, "2026.11.4");
    assert.equal(requests, 3);
    assert.deepEqual(delays, [2_000, 4_000]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error == null ? resolve() : reject(error)));
    });
  }
});

test("mise retries fail after a finite number of attempts", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await assert.rejects(
    downloadText(
      "https://example.invalid/fixture",
      () => {},
      async () => {
        attempts += 1;
        return new Response("Gateway Timeout", { status: 504 });
      },
      async (milliseconds) => {
        delays.push(milliseconds);
      },
    ),
    /HTTP 504/u,
  );
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [2_000, 4_000, 8_000]);
});

test("mise raw assets identify each supported CI OS and architecture", () => {
  for (const [platform, os] of [
    ["linux", "linux"],
    ["darwin", "macos"],
    ["win32", "windows"],
  ]) {
    for (const architecture of ["x64", "arm64"]) {
      const suffix = platform === "win32" ? ".exe" : "";
      assert.equal(
        rawAsset("2026.11.4", platform!, architecture),
        `mise-v2026.11.4-${os}-${architecture}${suffix}`,
      );
    }
  }
  assert.throws(() => rawAsset("2026.11.4", "freebsd", "x64"));
  assert.throws(() => rawAsset("2026.11.4", "linux", "ia32"));
  assert.throws(() => rawAsset("2026.11.4\nforged=true", "linux", "x64"));
});

test("mise checksums reject wrong identities and duplicate names", () => {
  const digest = "a".repeat(64);
  const asset = rawAsset("2026.11.4", "linux", "x64");
  const text = `${digest}  ./${asset}\n`;
  assert.equal(checksumForAsset(text, asset), digest);
  for (const wrong of [
    rawAsset("2026.11.3", "linux", "x64"),
    rawAsset("2026.11.4", "linux", "arm64"),
    rawAsset("2026.11.4", "darwin", "x64"),
  ]) {
    assert.throws(() => checksumForAsset(text, wrong));
  }
  assert.throws(() => checksumForAsset(text + text, asset));
  assert.throws(() => checksumForAsset(`short  ${asset}`, asset));
});

test("mise signed checksums reject wrong hashes, keys and comments", () => {
  const text = `${"a".repeat(64)}  ./mise-v2026.11.4-linux-x64\n`;
  const [key, signature] = signedChecksums(text);
  verifyChecksums(text, signature, key);
  assert.throws(() => verifyChecksums(text.replace("a", "b"), signature, key));
  assert.throws(() => verifyChecksums(text, signature));
  assert.throws(() =>
    verifyChecksums(
      text,
      signature.replace(
        "\ntrusted comment: fixture",
        "\ntrusted comment: changed",
      ),
      key,
    ),
  );
  assert.throws(() =>
    verifyChecksums(
      text,
      signature.replace("\ntrusted comment: fixture", "\nx"),
      key,
    ),
  );
  assert.throws(() => verifyChecksums(text, "short", key));
});

test("mise wrapper preserves setup and archive verification", async () => {
  const action = await readFile(
    new URL("../.github/actions/setup-mise/action.yaml", import.meta.url),
    "utf8",
  );
  assert.match(action, /uses: jdx\/mise-action@v4/u);
  assert.match(action, /version: \$\{\{ steps.policy.outputs.version \}\}/u);
  assert.match(action, /sha256: \$\{\{ steps.policy.outputs.sha256 \}\}/u);
  assert.match(action, /install: \$\{\{ inputs.install \}\}/u);
  assert.match(action, /install_args: \$\{\{ inputs.install_args \}\}/u);
  assert.match(action, /cache: "false"/u);
  assert.match(action, /uses: actions\/cache\/restore@v5/u);
  assert.match(action, /uses: actions\/cache\/save@v5/u);
  assert.match(action, /inputs.install == 'true'/u);
  assert.doesNotMatch(action, /continue-on-error/u);
  const upstream = action.slice(action.indexOf("uses: jdx/mise-action@v4"));
  assert.doesNotMatch(upstream, /sha256:/u);
  assert.ok(action.indexOf("phase: restore") < action.indexOf(upstream));
  assert.match(curlPolicy, /^retry = 2$/mu);
  assert.match(curlPolicy, /^retry-all-errors$/mu);
  assert.match(curlPolicy, /^max-time = 30$/mu);
  assert.match(curlPolicy, /^retry-max-time = 70$/mu);
});

test("mise cache accepts valid bytes and rejects stale restores", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-cache-test-"));
  const path = join(directory, "mise");
  const current = Buffer.from("current release and target fixture");
  const expected = createHash("sha256").update(current).digest("hex");
  try {
    await writeFile(path, current);
    await verifyMiseBinary(path, expected);
    const bin = join(directory, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "mise"), current);
    await checkRestoredMise(directory, true, expected, "linux");
    for (const stale of ["old version", "wrong architecture", "short"]) {
      await writeFile(path, stale);
      await assert.rejects(
        verifyMiseBinary(path, expected),
        /SHA256 mismatch/u,
      );
    }
    await assert.rejects(verifyMiseBinary(path, ""), /Invalid expected/u);
    await rm(path);
    await assert.rejects(verifyMiseBinary(path, expected));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mise cache identity separates release, target, image and config", () => {
  const identity = ["asset", "hash", "image", "config", "args"] as const;
  const original = miseCacheKey(...identity);
  assert.equal(original, miseCacheKey(...identity));
  assert.notEqual(original, miseCacheKey(...identity, "production"));
  for (let index = 0; index < identity.length; index += 1) {
    const changed = identity.map((value, i) => (i === index ? "new" : value));
    assert.notEqual(
      original,
      miseCacheKey(
        changed[0]!,
        changed[1]!,
        changed[2]!,
        changed[3]!,
        changed[4]!,
      ),
    );
  }
});

test("mise misses and prefix hits discard restored binaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-prefix-test-"));
  try {
    await writeFile(join(directory, "stale"), "must never execute");
    await checkRestoredMise(directory, false, "a".repeat(64));
    await assert.rejects(readFile(join(directory, "stale")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function runCurl(url: string, directory: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["-fsSL", url, "--output", "download"], {
      cwd: directory,
      env: {
        ...process.env,
        CURL_HOME: directory,
        NO_PROXY: "127.0.0.1",
        no_proxy: "127.0.0.1",
      },
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", resolve);
  });
}

test("mise curl retries HTTP 504 and short bodies, then fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-curl-test-"));
  let requests = 0;
  let alwaysFail = false;
  const server = createServer((_request, response) => {
    requests += 1;
    if (alwaysFail || requests === 1) {
      response.writeHead(504);
      response.end("Gateway Timeout");
    } else if (requests === 2) {
      response.writeHead(200, { "Content-Length": "100" });
      response.end("short");
      response.socket?.destroySoon();
    } else {
      response.end("complete");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(isTcpAddress(address));
  try {
    // Only the fixture delay changes; the production retry count is exercised.
    await writeFile(
      join(directory, curlConfigName(process.platform)),
      curlPolicy.replace("retry-delay = 5", "retry-delay = 1"),
    );
    const url = `http://127.0.0.1:${address.port}/asset`;
    assert.equal(await runCurl(url, directory), 0);
    assert.equal(requests, 3);
    assert.equal(
      await readFile(join(directory, "download"), "utf8"),
      "complete",
    );
    alwaysFail = true;
    requests = 0;
    assert.equal(await runCurl(url, directory), 22);
    assert.equal(requests, 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("mise curl configuration names work with older Windows curl", () => {
  assert.equal(curlConfigName("win32"), "_curlrc");
  assert.equal(curlConfigName("linux"), ".curlrc");
  assert.equal(curlConfigName("darwin"), ".curlrc");
});
