/* eslint-disable no-await-in-loop -- Cache state transitions are sequential. */

import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  checkRestoredMise,
  miseCacheKey,
  checksumForAsset,
  curlPolicy,
  curlConfigName,
  downloadText,
  discoverMise,
  rawAsset,
  resolveMiseChecksum,
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

test("latest discovery precedes metadata restore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-discovery-"));
  const output = join(directory, "output");
  const metadata = join(directory, "oseo-mise-metadata-v1");
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(String(input));
    return new Response("2026.11.5\n");
  };
  try {
    await mkdir(metadata);
    await writeFile(join(metadata, "stale"), "old local metadata");
    await discoverMise(directory, output, fetcher);
    assert.deepEqual(requests, ["https://mise.jdx.dev/VERSION"]);
    assert.equal(
      await readFile(output, "utf8"),
      `version=2026.11.5\nmetadata-dir=${metadata}\n` +
        "metadata-key=oseo-mise-metadata-v1-" +
        `${rawAsset("2026.11.5", process.platform, process.arch)}\n`,
    );
    await assert.rejects(readFile(join(metadata, "stale")));
    await rm(output);
    let attempts = 0;
    await assert.rejects(
      discoverMise(
        directory,
        output,
        async () => {
          attempts += 1;
          return new Response("Gateway Timeout", { status: 504 });
        },
        async () => {},
      ),
      /HTTP 504/u,
    );
    assert.equal(attempts, 4);
    await assert.rejects(readFile(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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

test("signed metadata hits avoid HTTP and check binary bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-metadata-test-"));
  const metadata = join(directory, "metadata");
  const binary = join(directory, "bin", "mise");
  const bytes = "verified fixture bytes";
  const digest = createHash("sha256").update(bytes).digest("hex");
  const asset = rawAsset("2026.11.4", "linux", "x64");
  const checksums = `${digest}  ${asset}\n`;
  const [key, signature] = signedChecksums(checksums);
  const requests: string[] = [];
  let offline = false;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (offline) return new Response("Gateway Timeout", { status: 504 });
    return new Response(url.endsWith(".minisig") ? signature : checksums);
  };
  const resolve = (hit: boolean) =>
    resolveMiseChecksum(
      metadata,
      hit,
      "2026.11.4",
      "linux",
      "x64",
      fetcher,
      async () => {},
      key,
    );
  try {
    assert.equal(await resolve(false), digest);
    assert.deepEqual(requests, [
      "https://github.com/jdx/mise/releases/download/v2026.11.4/" +
        "SHASUMS256.txt",
      "https://github.com/jdx/mise/releases/download/v2026.11.4/" +
        "SHASUMS256.txt.minisig",
    ]);
    offline = true;
    requests.length = 0;
    const cachedDigest = await resolve(true);
    assert.equal(cachedDigest, digest);
    assert.deepEqual(requests, []);
    await mkdir(join(directory, "bin"));
    await writeFile(binary, bytes);
    await checkRestoredMise(directory, true, cachedDigest, "linux");
    await writeFile(binary, "tampered");
    await assert.rejects(
      checkRestoredMise(directory, true, cachedDigest, "linux"),
      /SHA256 mismatch/u,
    );
    // Non-exact restores must not use even a valid local signed pair.
    await assert.rejects(resolve(false), /HTTP 504/u);
    assert.equal(requests.length, 4);
    await assert.rejects(readFile(join(metadata, "SHASUMS256.txt")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("metadata hits reject invalid pairs and wrong identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-metadata-invalid-"));
  const asset = rawAsset("2026.11.4", "linux", "x64");
  const checksums = `${"a".repeat(64)}  ${asset}\n`;
  const [key, signature] = signedChecksums(checksums);
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests += 1;
    throw new Error("must not fetch on exact hit");
  };
  const resolve = (version = "2026.11.4", os = "linux", arch = "x64") =>
    resolveMiseChecksum(
      directory,
      true,
      version,
      os,
      arch,
      fetcher,
      async () => {},
      key,
    );
  const checksumPath = join(directory, "SHASUMS256.txt");
  const signaturePath = `${checksumPath}.minisig`;
  try {
    await writeFile(checksumPath, checksums);
    await writeFile(signaturePath, signature);
    for (const [version, os, arch] of [
      ["2026.11.3", "linux", "x64"],
      ["2026.11.4", "darwin", "x64"],
      ["2026.11.4", "linux", "arm64"],
    ]) {
      await assert.rejects(resolve(version, os, arch), /checksum for/u);
    }
    await writeFile(checksumPath, checksums.replace("a", "b"));
    await assert.rejects(resolve(), /Invalid mise checksum signature/u);
    await writeFile(checksumPath, checksums);
    await writeFile(
      signaturePath,
      signature.replace("\ntrusted comment: fixture", "\ntrusted comment: x"),
    );
    await assert.rejects(resolve(), /Invalid mise checksum signature/u);
    await writeFile(signaturePath, "incomplete");
    await assert.rejects(resolve(), /signature format/u);
    await rm(signaturePath);
    await assert.rejects(resolve(), /ENOENT/u);
    await writeFile(signaturePath, signature);
    await rm(checksumPath);
    await assert.rejects(resolve(), /ENOENT/u);
    assert.equal(requests, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("metadata misses publish verified official pairs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mise-metadata-miss-"));
  const asset = rawAsset("2026.11.4", "win32", "arm64");
  const checksums = `${"a".repeat(64)}  ${asset}\n`;
  const [key, signature] = signedChecksums(checksums);
  try {
    for (const [body, sig] of [
      [checksums, "bad signature"],
      [checksums.replace("a", "b"), signature],
      [checksums.replace(asset, `${asset}.zip`), signature],
    ]) {
      await assert.rejects(
        resolveMiseChecksum(
          directory,
          false,
          "2026.11.4",
          "win32",
          "arm64",
          async (input) =>
            new Response(String(input).endsWith(".minisig") ? sig : body),
          async () => {},
          key,
        ),
      );
      await assert.rejects(readFile(join(directory, "SHASUMS256.txt")));
      await assert.rejects(readFile(join(directory, "SHASUMS256.txt.minisig")));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

/** Environment overrides belong to individual bootstrap steps. */
interface BootstrapStep {
  readonly id?: string;
  readonly uses: string;
  readonly with?: Readonly<Record<string, string>>;
  readonly env?: Readonly<Record<string, string>>;
}

interface BootstrapAction {
  readonly runs: { readonly steps: readonly BootstrapStep[] };
}

async function bootstrapSteps(): Promise<readonly BootstrapStep[]> {
  // SAFETY: This repository-owned composite action has a steps array;
  // the tests below check its upstream identity and environment values.
  const action = parse(
    await readFile(
      new URL("../.github/actions/setup-mise/action.yaml", import.meta.url),
      "utf8",
    ),
  ) as BootstrapAction;
  return action.runs.steps;
}

test("metadata verification precedes saves and data restores", async () => {
  const steps = await bootstrapSteps();
  assert.equal(steps[0]?.with?.phase, "discover");
  assert.equal(steps[1]?.id, "metadata");
  assert.equal(steps[1]?.uses, "actions/cache/restore@v5");
  assert.deepEqual(steps[1]?.with, {
    path: "${{ steps.release.outputs.metadata-dir }}",
    key: "${{ steps.release.outputs.metadata-key }}",
  });
  assert.equal(steps[2]?.id, "policy");
  assert.equal(steps[2]?.with?.version, "${{ steps.release.outputs.version }}");
  assert.equal(
    steps[2]?.with?.["metadata-directory"],
    "${{ steps.release.outputs.metadata-dir }}",
  );
  assert.equal(
    steps[2]?.with?.["cache-hit"],
    "${{ steps.metadata.outputs.cache-hit }}",
  );
  assert.equal(steps[3]?.uses, "actions/cache/save@v5");
  assert.deepEqual(steps[3]?.with, steps[1]?.with);
  assert.equal(steps[4]?.id, "cache");
  for (const step of steps) {
    assert.equal(step.with?.["restore-keys"], undefined);
  }
});

test("mise temp overrides belong only to upstream setup", async () => {
  const steps = await bootstrapSteps();
  const upstream = steps.filter((step) => step.uses === "jdx/mise-action@v4");
  assert.equal(upstream.length, 1);
  for (const step of steps) {
    for (const name of ["TMPDIR", "TMP", "TEMP"]) {
      assert.equal(
        step.env?.[name],
        step === upstream[0] ? "${{ runner.temp }}" : undefined,
      );
    }
  }
  const policy = await readFile(
    new URL("../tools/ci/mise-bootstrap.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(policy, /(?:TMPDIR|TMP|TEMP)=/u);
});

test("mise extraction and both Windows binaries use runner temp", async () => {
  const steps = await bootstrapSteps();
  const upstream = steps.find((step) => step.uses === "jdx/mise-action@v4");
  assert.ok(upstream?.env);
  // On hosted Windows, the inherited temp is on C: and RUNNER_TEMP on D:.
  // Locally this proves the process contract, not a Windows execution pass.
  const runnerTemp = process.env.RUNNER_TEMP || tmpdir();
  const directory = await mkdtemp(join(runnerTemp, "mise path test-"));
  const inherited = { ...process.env };
  const env = { ...inherited };
  for (const name of ["TMPDIR", "TMP", "TEMP"]) {
    assert.equal(upstream.env[name], "${{ runner.temp }}");
    env[name] = runnerTemp;
  }
  const script = `
    import assert from "node:assert/strict";
    import { mkdtemp, mkdir, realpath, rename, stat, writeFile }
      from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { join, parse } from "node:path";
    const root = process.env.MISE_TEST_ROOT;
    const temporary = await mkdtemp(join(tmpdir(), "mise-action-"));
    const extract = join(temporary, "extract", "mise", "bin");
    const target = join(root, "oseo-mise-data", "bin");
    try {
      await mkdir(extract, { recursive: true });
      await mkdir(target, { recursive: true });
      assert.equal(await realpath(tmpdir()),
        await realpath(process.env.RUNNER_TEMP));
      assert.equal((await stat(extract)).dev, (await stat(target)).dev);
      assert.equal(parse(await realpath(extract)).root.toLowerCase(),
        parse(await realpath(target)).root.toLowerCase());
      for (const name of ["mise.exe", "mise-shim.exe"]) {
        await writeFile(join(extract, name), name);
        await rename(join(extract, name), join(target, name));
      }
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(temporary, { recursive: true, force: true });
    }
  `;
  try {
    const result = spawnSync(
      "node",
      ["--input-type=module", "--eval", script],
      {
        env: { ...env, RUNNER_TEMP: runnerTemp, MISE_TEST_ROOT: directory },
        encoding: "utf8",
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["mise.exe", "mise-shim.exe"]) {
      assert.equal(
        await readFile(join(directory, "oseo-mise-data", "bin", name), "utf8"),
        name,
      );
    }
    for (const name of ["TMPDIR", "TMP", "TEMP"]) {
      assert.equal(process.env[name], inherited[name]);
    }
    const later = spawnSync("node", ["-p", "require('node:os').tmpdir()"], {
      encoding: "utf8",
    });
    assert.equal(later.status, 0, later.stderr);
    assert.equal(later.stdout.trim(), tmpdir());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const denoArchive = "deno-aarch64-apple-darwin.zip";
const denoSource = "https://dl.deno.land/release/v2.9.7/";
const denoRelease =
  "https://github.com/denoland/deno/releases/download/v2.9.7/";

/**
 * Model the reviewed literal rules, not the Rust regex language or HTTP.
 * Inputs are serialized URLs. Rust's strict end anchor needs translation;
 * JavaScript's dollar anchor alone also matches before a final newline.
 * Non-global replace models Rust regex.replace's first match only.
 */
function fixtureUrlReplacement(
  url: string,
  rules: Readonly<Record<string, string>>,
): string {
  for (const [pattern, replacement] of Object.entries(rules)) {
    assert.ok(pattern.startsWith("regex:"));
    const regex = new RegExp(
      pattern.slice("regex:".length).replaceAll("\\z", "(?![\\s\\S])"),
      "u",
    );
    const changed = url.replace(regex, replacement);
    if (changed === url) continue;
    try {
      return new URL(changed).href;
    } catch {
      // mise skips changes that do not parse as a URL.
    }
  }
  return url;
}

test("Deno routing is exact and confined to upstream setup", async () => {
  const steps = await bootstrapSteps();
  const upstream = steps.find((step) => step.uses === "jdx/mise-action@v4");
  assert.ok(upstream?.env?.MISE_URL_REPLACEMENTS);
  // SAFETY: This repository-owned JSON object is compared in full below.
  const rules = JSON.parse(upstream.env.MISE_URL_REPLACEMENTS) as Readonly<
    Record<string, string>
  >;
  const pattern =
    "regex:^https://dl\\.deno\\.land/release/v2\\.9\\.7/" +
    "deno-aarch64-apple-darwin\\.zip";
  assert.deepEqual(rules, {
    [`${pattern}\\z`]: `${denoRelease}${denoArchive}`,
    [`${pattern}\\.sha256sum\\z`]: `${denoRelease}${denoArchive}.sha256sum`,
  });
  for (const suffix of ["", ".sha256sum"]) {
    const url = `${denoSource}${denoArchive}${suffix}`;
    assert.equal(
      fixtureUrlReplacement(url, rules),
      `${denoRelease}${denoArchive}${suffix}`,
    );
    const others = [
      url.replace("2.9.7", "2.9.6"),
      url.replace("2.9.7", "2.9.70"),
      url.replace("aarch64", "x86_64"),
      url.replace("apple-darwin", "unknown-linux-gnu"),
      url.replace("apple-darwin", "pc-windows-msvc"),
      url.replace("dl.deno.land", "dl.deno.land.example.org"),
      url.replace("dl.deno.land", "dlXdenoXland"),
      url.replace("2.9.7", "2X9X7"),
      url.replace(".zip", "Xzip"),
      url.replace("https:", "http:"),
      url.replace("/release/", "/other/release/"),
      `https://example.invalid/?next=${url}`,
      `${denoRelease}${denoArchive}${suffix}`,
      ...[".bak", ".sha256sum.extra", "/", "?x=1", "#x", "%0A"].map(
        (extra) => `${url}${extra}`,
      ),
    ];
    for (const other of others) {
      assert.equal(fixtureUrlReplacement(other, rules), other, other);
    }
  }
  for (const step of steps) {
    if (step !== upstream) {
      assert.equal(step.env?.MISE_URL_REPLACEMENTS, undefined);
    }
  }
  const policy = await readFile(
    new URL("../tools/ci/mise-bootstrap.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(policy, /MISE_URL_REPLACEMENTS/u);
  assert.deepEqual(upstream.with, {
    version: "${{ steps.policy.outputs.version }}",
    mise_dir: "${{ steps.policy.outputs.data-dir }}",
    cache: "false",
    install: "${{ inputs.install }}",
    install_args: "${{ inputs.install_args }}",
  });
});

test("routing fixture uses the first match and first valid change", () => {
  const url = "https://example.invalid/a/a";
  assert.equal(
    fixtureUrlReplacement(url, {
      "regex:/a": "/b",
      "regex:/b": "/c",
    }),
    "https://example.invalid/b/a",
  );
  assert.equal(
    fixtureUrlReplacement(url, {
      "regex:^https:": "https:",
      "regex:^.*\\z": "http://[",
      "regex:/a": "/b",
    }),
    "https://example.invalid/b/a",
  );
  assert.equal(
    fixtureUrlReplacement(`${url}\n`, { "regex:/a/a\\z": "/b" }),
    `${url}\n`,
  );
});
