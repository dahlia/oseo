/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { downloadWithNode } from "./download.ts";
import { verifyZigSignature, zigPublicKey } from "./minisign.ts";
import { zigVersion } from "./pin.generated.ts";

const run = promisify(execFile);
const mirrorListUrl = "https://ziglang.org/download/community-mirrors.txt";
const oneDay = 24 * 60 * 60 * 1000;

interface AcquisitionOptions {
  readonly cacheDirectory: string;
  readonly host: string;
  readonly publicKey: string;
  readonly fetch?: typeof fetch;
  readonly report: (message: string) => void;
}

function zigHost(): string {
  if (process.platform === "linux") {
    if (process.arch === "x64") return "x86_64-linux";
    if (process.arch === "arm64") return "aarch64-linux";
  }
  if (process.platform === "darwin") {
    if (process.arch === "x64") return "x86_64-macos";
    if (process.arch === "arm64") return "aarch64-macos";
  }
  throw new Error(
    `No automatic Zig installation for ${process.platform}/${process.arch}; ` +
      "provide an installed executable with --zig PATH.",
  );
}

function userCache(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base =
    xdg != null && isAbsolute(xdg)
      ? xdg
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Caches")
        : join(homedir(), ".cache");
  return join(base, "oseo", "zig");
}

async function requireExecutable(path: string): Promise<void> {
  if (!(await stat(path)).isFile()) {
    throw new Error(`Not an executable file: '${path}'.`);
  }
  await access(path, constants.X_OK);
}

async function isInstallation(directory: string): Promise<boolean> {
  try {
    // The downloader publishes whole directories only. Never accept a
    // symlink as the cache entry, or a bare executable without Zig's lib.
    if (!(await lstat(directory)).isDirectory()) return false;
    await requireExecutable(join(directory, "zig"));
    return (await lstat(join(directory, "lib"))).isDirectory();
  } catch {
    return false;
  }
}

async function* download(
  fetcher: typeof fetch | undefined,
  url: string,
  limit: number,
  timeout: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const signal = AbortSignal.timeout(timeout);
  const response =
    fetcher != null || process.versions.deno != null
      ? await (fetcher ?? globalThis.fetch)(url, { signal })
      : await downloadWithNode(url, signal);
  if (
    response.status !== 200 ||
    response.body == null ||
    (response.url !== "" && !response.url.startsWith("https://"))
  ) {
    await response.body?.cancel();
    throw new Error(`Expected an HTTPS download (HTTP ${response.status}).`);
  }
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Stream backpressure.
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) throw new Error("Download exceeded its size limit.");
      yield result.value;
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}

async function downloadText(
  fetcher: typeof fetch | undefined,
  url: string,
  limit: number,
): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  for await (const bytes of download(fetcher, url, limit, 15_000)) {
    text += decoder.decode(bytes, { stream: true });
  }
  return text + decoder.decode();
}

function parseMirrors(text: string): string[] {
  return [
    ...new Set(
      text.split(/\r?\n/u).flatMap((line) => {
        if (!line.startsWith("https://") || /[^\x21-\x7e]/u.test(line))
          return [];
        try {
          const url = new URL(line);
          if (url.username || url.password || url.search || url.hash) return [];
          return [url.href.replace(/\/+$/u, "")];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

async function mirrorList(options: AcquisitionOptions): Promise<string[]> {
  const path = join(options.cacheDirectory, "community-mirrors.txt");
  let cached: string[] = [];
  try {
    const info = await stat(path);
    cached = parseMirrors(await readFile(path, "utf8"));
    if (cached.length > 0 && Date.now() - info.mtimeMs < oneDay) return cached;
  } catch {
    // A missing or unreadable cache is not needed for a fresh fetch.
  }
  let text: string;
  let mirrors: string[];
  try {
    text = await downloadText(options.fetch, mirrorListUrl, 64 * 1024);
    mirrors = parseMirrors(text);
    if (mirrors.length === 0) throw new Error("No HTTPS mirrors in the list.");
  } catch (error) {
    if (cached.length > 0) return cached;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Fetch mirror list ${mirrorListUrl}: ${detail}`, {
      cause: error,
    });
  }
  const temporary = await mkdtemp(join(options.cacheDirectory, ".mirrors-"));
  try {
    const fresh = join(temporary, "mirrors");
    await writeFile(fresh, text, { mode: 0o600 });
    await rename(fresh, path);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
  return mirrors;
}

async function downloadArchive(
  fetcher: typeof fetch | undefined,
  url: string,
  path: string,
): Promise<Buffer> {
  const digest = createHash("blake2b512");
  const file = await open(path, "wx", 0o600);
  try {
    for await (const chunk of download(
      fetcher,
      url,
      512 * 1024 * 1024,
      180_000,
    )) {
      digest.update(chunk);
      await file.writeFile(chunk);
    }
  } finally {
    await file.close();
  }
  return digest.digest();
}

async function tryMirror(
  options: AcquisitionOptions,
  mirror: string,
  destination: string,
  temporary: string,
): Promise<void> {
  const name = `zig-${options.host}-${zigVersion}`;
  const filename = `${name}.tar.xz`;
  const archive = join(temporary, filename);
  let step = "download signature";
  try {
    const signature = await downloadText(
      options.fetch,
      `${mirror}/${filename}.minisig?source=oseo`,
      8192,
    );
    step = "download archive";
    const digest = await downloadArchive(
      options.fetch,
      `${mirror}/${filename}?source=oseo`,
      archive,
    );
    step = "verify archive and trusted filename";
    verifyZigSignature(digest, signature, filename, options.publicKey);
    step = "unpack verified archive (requires tar with XZ support)";
    await run("tar", ["-xf", archive, "-C", temporary], {
      // Do not let inherited tar options affect extraction.
      env: { PATH: process.env.PATH },
    });
    const extracted = join(temporary, name);
    if (!(await isInstallation(extracted))) {
      throw new Error("Missing executable or lib directory.");
    }
    step = "install verified Zig in the cache";
    try {
      await rename(extracted, destination);
    } catch (error) {
      // A competing installer may have won; its complete entry is usable.
      if (!(await isInstallation(destination))) throw error;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${mirror}: ${step}: ${detail}`, { cause: error });
  }
}

async function installFromMirror(
  options: AcquisitionOptions,
  mirror: string,
  directory: string,
  destination: string,
): Promise<void> {
  if (await isInstallation(destination)) return;
  const temporary = await mkdtemp(join(directory, ".install-"));
  try {
    options.report(
      `Downloading Zig ${zigVersion} (${options.host}) from ${mirror}`,
    );
    await tryMirror(options, mirror, destination, temporary);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

/** Internal acquisition workflow; production supplies the pinned trust key. */
export async function acquireZig(options: AcquisitionOptions): Promise<string> {
  const directory = join(options.cacheDirectory, zigVersion);
  const destination = join(directory, options.host);
  const executable = join(destination, "zig");
  if (await isInstallation(destination)) return executable;
  await mkdir(directory, { mode: 0o700, recursive: true });
  const mirrors = await mirrorList(options);
  for (let index = mirrors.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1);
    const last = mirrors[index];
    const first = mirrors[selected];
    if (last != null && first != null) {
      mirrors[index] = first;
      mirrors[selected] = last;
    }
  }
  const failures: string[] = [];
  for (const mirror of mirrors) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Try one mirror at a time.
      await installFromMirror(options, mirror, directory, destination);
      return executable;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(
    `Could not install Zig ${zigVersion}:\n${failures.join("\n")}`,
  );
}

/** Resolve an explicit Zig path or acquire the pinned host build. */
export async function resolveZigExecutable(
  explicitPath: string | undefined,
  report: (message: string) => void,
): Promise<string> {
  if (explicitPath != null) {
    const path = resolve(explicitPath);
    try {
      await requireExecutable(path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot use --zig '${explicitPath}': ${detail}`, {
        cause: error,
      });
    }
    return path;
  }
  return acquireZig({
    cacheDirectory: userCache(),
    host: zigHost(),
    publicKey: zigPublicKey,
    report,
  });
}
