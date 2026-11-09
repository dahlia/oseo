/* eslint-disable no-await-in-loop -- Retry attempts must be sequential. */

import { createHash, createPublicKey, verify } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const releaseRoot = "https://github.com/jdx/mise/releases/download";
const publicKey = "RWTC3g8W3z4RZK3V3qv7fa1QY4JEWyBtqIHW+85QlJpZc5yG+uNYNBSZ";

/** Each curl call still participates in mise-action's five-retry loop. */
export const curlPolicy: string = [
  "retry = 2",
  "retry-delay = 5",
  "retry-all-errors",
  "connect-timeout = 10",
  "max-time = 30",
  "retry-max-time = 70",
  "",
].join("\n");

/** Windows curl also supports the historical underscore config name. */
export function curlConfigName(platform: string): string {
  return platform === "win32" ? "_curlrc" : ".curlrc";
}

/** Resolve metadata with a bounded deadline, including response body reads. */
export async function downloadText(
  url: string,
  validate: (text: string) => void,
  fetcher: typeof fetch = fetch,
  delay: (milliseconds: number) => Promise<void> = setTimeout,
): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const text = await response.text();
      validate(text);
      return text;
    } catch (error) {
      if (attempt === 3) throw error;
      await delay(2_000 * 2 ** attempt);
    }
  }
}

/** Verify both minisign signatures before using any checksum as authority. */
export function verifyChecksums(
  text: string,
  signature: string,
  encodedKey: string = publicKey,
): void {
  const lines = signature.trimEnd().split(/\r?\n/u);
  const key = Buffer.from(encodedKey, "base64");
  const signed = Buffer.from(lines[1] ?? "", "base64");
  const trusted = Buffer.from(lines[3] ?? "", "base64");
  if (
    key.length !== 42 ||
    signed.length !== 74 ||
    trusted.length !== 64 ||
    key.subarray(0, 2).toString() !== "Ed" ||
    signed.subarray(0, 2).toString() !== "ED" ||
    !key.subarray(2, 10).equals(signed.subarray(2, 10)) ||
    !lines[2]?.startsWith("trusted comment: ")
  ) {
    throw new Error("Invalid mise checksum signature format");
  }
  const verificationKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      key.subarray(10),
    ]),
    format: "der",
    type: "spki",
  });
  const dataSignature = signed.subarray(10);
  const comment = lines[2].slice("trusted comment: ".length);
  if (
    !verify(
      null,
      createHash("blake2b512").update(text).digest(),
      verificationKey,
      dataSignature,
    ) ||
    !verify(
      null,
      Buffer.concat([dataSignature, Buffer.from(comment)]),
      verificationKey,
      trusted,
    )
  ) {
    throw new Error("Invalid mise checksum signature");
  }
}

/** Fail before setup if the runner has no reviewed official raw asset. */
export function rawAsset(
  version: string,
  platform: string,
  architecture: string,
): string {
  if (!/^\d{4}\.\d{1,2}\.\d+$/u.test(version)) {
    throw new Error("Invalid mise version");
  }
  if (architecture !== "x64" && architecture !== "arm64") {
    throw new Error(`Unsupported mise architecture: ${architecture}`);
  }
  const os =
    platform === "darwin"
      ? "macos"
      : platform === "win32"
        ? "windows"
        : platform === "linux"
          ? "linux"
          : undefined;
  if (os == null) throw new Error(`Unsupported mise platform: ${platform}`);
  return `mise-v${version}-${os}-${architecture}${
    platform === "win32" ? ".exe" : ""
  }`;
}

/** Exact names prevent a checksum for another release or target being used. */
export function checksumForAsset(text: string, asset: string): string {
  const checksums: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(?:\.\/)?(\S+)$/u);
    if (match?.[2] === asset) checksums.push(match[1]!.toLowerCase());
  }
  if (checksums.length !== 1) {
    throw new Error(`Expected exactly one checksum for ${asset}`);
  }
  return checksums[0]!;
}

/** Resolve latest once so cache identity and the final byte check agree. */
export async function prepareMise(
  temporaryDirectory: string,
  outputFile: string,
  environmentFile: string,
  configHash: string,
  installArgs: string,
): Promise<void> {
  const version = (
    await downloadText("https://mise.jdx.dev/VERSION", (text) => {
      rawAsset(text.trim(), process.platform, process.arch);
    })
  ).trim();
  const asset = rawAsset(version, process.platform, process.arch);
  const url = `${releaseRoot}/v${version}/SHASUMS256.txt`;
  const checksums = await downloadText(url, (text) => {
    checksumForAsset(text, asset);
  });
  const signature = await downloadText(`${url}.minisig`, (text) => {
    verifyChecksums(checksums, text);
  });
  verifyChecksums(checksums, signature);
  const directory = await mkdtemp(join(temporaryDirectory, "mise-curl-"));
  await writeFile(
    join(directory, curlConfigName(process.platform)),
    curlPolicy,
  );
  const dataDirectory = join(temporaryDirectory, "oseo-mise-data");
  await rm(dataDirectory, { recursive: true, force: true });
  const sha256 = checksumForAsset(checksums, asset);
  const cacheKey = miseCacheKey(
    asset,
    sha256,
    process.env.ImageOS || "self-hosted",
    configHash,
    installArgs,
    process.env.MISE_ENV || "",
  );
  await appendFile(environmentFile, `MISE_DATA_DIR=${dataDirectory}\n`);
  await appendFile(
    outputFile,
    `version=${version}\nsha256=${sha256}\n` +
      `curl-home=${directory}\ndata-dir=${dataDirectory}\n` +
      `cache-key=${cacheKey}\n`,
  );
}

/** Verify raw bytes while preserving upstream archive verification. */
export async function verifyMiseBinary(
  binaryPath: string,
  expectedSha256: string,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new Error("Invalid expected mise SHA256");
  }
  const bytes = await readFile(binaryPath);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) throw new Error("Mise binary SHA256 mismatch");
}

/** Bind the data cache to exact release bytes and tool configuration. */
export function miseCacheKey(
  asset: string,
  sha256: string,
  image: string,
  configHash: string,
  installArgs: string,
  miseEnvironment: string = "",
): string {
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        asset,
        sha256,
        image,
        configHash,
        installArgs,
        miseEnvironment,
      ]),
    )
    .digest("hex");
  return `oseo-mise-v1-${asset}-${identity}`;
}

/** A prefix restore is not an exact hit; never execute any of its contents. */
export async function checkRestoredMise(
  directory: string,
  exactHit: boolean,
  expectedSha256: string,
  platform: string = process.platform,
): Promise<void> {
  if (!exactHit) {
    await rm(directory, { recursive: true, force: true });
    return;
  }
  await verifyMiseBinary(
    join(directory, "bin", platform === "win32" ? "mise.exe" : "mise"),
    expectedSha256,
  );
}
