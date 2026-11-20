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

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireZig, resolveZigExecutable } from "../src/acquire.ts";
import { zigVersion } from "../src/pin.generated.ts";

const host = "x86_64-linux";
const stem = `zig-${host}-${zigVersion}`;
const filename = `${stem}.tar.xz`;
const mirror = "https://mirror.example/zig";
const list = "https://ziglang.org/download/community-mirrors.txt";

const keys = generateKeyPairSync("ed25519");
const publicBytes = keys.publicKey.export({ type: "spki", format: "der" });
const keyId = Buffer.from("01234567");
const publicKey = Buffer.concat([
  Buffer.from("Ed"),
  keyId,
  publicBytes.subarray(-32),
]).toString("base64");

function signature(archive: Buffer, file: string): string {
  const digest = createHash("blake2b512").update(archive).digest();
  const main = sign(null, digest, keys.privateKey);
  const packet = Buffer.concat([Buffer.from("ED"), keyId, main]);
  const comment = `timestamp:1\tfile:${file}\thashed`;
  const global = sign(
    null,
    Buffer.concat([main, Buffer.from(comment)]),
    keys.privateKey,
  );
  return [
    "untrusted comment: test signature",
    packet.toString("base64"),
    `trusted comment: ${comment}`,
    global.toString("base64"),
    "",
  ].join("\n");
}

test("the generated Zig pin matches the mise tools pin", async () => {
  const mise = await readFile(
    new URL("../../../mise.toml", import.meta.url),
    "utf8",
  );
  const tools = /^\[tools\]\s*\n([^[]+)/mu.exec(mise)?.[1];
  assert.equal(/^zig\s*=\s*"([^"]+)"$/mu.exec(tools ?? "")?.[1], zigVersion);
});

test("publish only signed matching archives and reuse offline", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "oseo-zig-test-"));
  t.after(() => rm(temporary, { force: true, recursive: true }));
  const tree = join(temporary, stem);
  await mkdir(join(tree, "lib"), { recursive: true });
  await writeFile(join(tree, "zig"), "#!/bin/sh\n", { mode: 0o755 });
  const tar = join(temporary, filename);
  execFileSync("tar", ["-cJf", tar, "-C", temporary, stem]);
  const archive = await readFile(tar);
  const cacheDirectory = join(temporary, "cache");
  const reportMessages: string[] = [];
  const options = {
    cacheDirectory,
    host,
    publicKey,
    report: (message: string) => reportMessages.push(message),
  };
  const goodSignature = signature(archive, filename);
  const network: string[] = [];
  function requests(signed: string, contents: Buffer): typeof fetch {
    return async (input) => {
      const url = String(input);
      network.push(url);
      switch (url) {
        case list:
          return new Response(`${mirror}\n`);
        case `${mirror}/${filename}.minisig?source=oseo`:
          return new Response(signed);
        case `${mirror}/${filename}?source=oseo`:
          return new Response(Uint8Array.from(contents));
        default:
          throw new Error(`Unexpected request: ${url}`);
      }
    };
  }
  const wrongFilename = signature(archive, "zig-older.tar.xz");
  for (const [signed, contents, error] of [
    [wrongFilename, archive, /trusted comment does not name/iu],
    [
      wrongFilename.replace("zig-older.tar.xz", filename),
      archive,
      /Invalid Minisign signature/iu,
    ],
    [
      goodSignature,
      Buffer.from("tampered archive"),
      /Invalid Minisign signature/iu,
    ],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Shared cache.
    await assert.rejects(
      acquireZig({ ...options, fetch: requests(signed, contents) }),
      (failure) =>
        failure instanceof Error &&
        failure.message.includes(`${mirror}: verify archive`) &&
        error.test(failure.message),
    );
    // oxlint-disable-next-line no-await-in-loop -- Shared cache.
    assert.deepEqual(await readdir(join(cacheDirectory, zigVersion)), []);
  }
  const fetcher = requests(goodSignature, archive);
  const executable = join(cacheDirectory, zigVersion, host, "zig");
  assert.deepEqual(
    await Promise.all([
      acquireZig({ ...options, fetch: fetcher }),
      acquireZig({ ...options, fetch: fetcher }),
    ]),
    [executable, executable],
  );
  assert.deepEqual(await readdir(join(cacheDirectory, zigVersion)), [host]);
  assert.deepEqual(
    network.filter((url) => url === list),
    [list],
  );
  assert.ok(
    reportMessages.includes(
      `Downloading Zig ${zigVersion} (${host}) from ${mirror}`,
    ),
  );
  assert.equal(
    await acquireZig({
      ...options,
      fetch: () => {
        throw new Error("Cached Zig must work offline.");
      },
    }),
    executable,
  );
  assert.equal(await resolveZigExecutable(executable, assert.fail), executable);
  await assert.rejects(
    resolveZigExecutable(join(temporary, "missing"), assert.fail),
    /Cannot use --zig/iu,
  );
});
