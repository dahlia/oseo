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

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runCli } from "../packages/cli/dist/index.js";
import { describeTarget } from "../packages/compiler/dist/index.js";

function runBuiltCli(...args: readonly string[]) {
  const cli = fileURLToPath(
    new URL("../packages/cli/dist/main.js", import.meta.url),
  );
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("built CLI exposes root and command help in both forms", () => {
  for (const [command, option] of [
    [["help"], ["--help"]],
    [
      ["help", "run"],
      ["run", "--help"],
    ],
    [
      ["help", "build"],
      ["build", "--help"],
    ],
    [
      ["help", "completion"],
      ["completion", "--help"],
    ],
  ] as const) {
    const result = runBuiltCli(...command);
    const alternate = runBuiltCli(...option);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(alternate.status, 0, alternate.stderr);
    assert.equal(result.stderr, "");
    assert.equal(alternate.stderr, "");
    assert.equal(result.stdout, alternate.stdout);
    if (command[1] === "completion") {
      assert.match(result.stdout, /Examples:/u);
      assert.match(result.stdout, /oseo completion bash/u);
      assert.match(result.stdout, /oseo completion zsh/u);
      assert.match(result.stdout, /oseo completion fish/u);
      assert.match(result.stdout, /oseo completion pwsh/u);
      assert.match(result.stdout, /oseo completion nu/u);
    } else {
      assert.match(
        result.stdout,
        command[1] === "build" ? /--output/u : /SOURCE/u,
      );
    }
    assert.equal(
      [...result.stdout.matchAll(/Copyright \(C\) 2026 Hong Minhee/gu)].length,
      1,
    );
    assert.match(result.stdout, /ABSOLUTELY NO WARRANTY/u);
    assert.ok(
      result.stdout.includes("<https://www.gnu.org/licenses/gpl-3.0.html>"),
    );
    const footer = result.stdout.slice(result.stdout.indexOf("Copyright"));
    assert.ok(
      footer
        .trimEnd()
        .split("\n")
        .every((line) => line.length <= 80),
    );
    if (command.length === 1) {
      assert.match(result.stdout, /subset of JavaScript and TypeScript/u);
      assert.match(result.stdout, /Hong Minhee <https:\/\/hongminhee\.org\/>/u);
      assert.ok(
        result.stdout.includes("<https://github.com/dahlia/oseo/issues>"),
      );
    }
  }
});

test("built CLI prints only its version for --version", () => {
  const result = runBuiltCli("--version");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^\d+\.\d+\.\d+\S*\n$/u);
});

test("built CLI generates and serves shell completion in both forms", () => {
  const command = runBuiltCli("completion", "bash");
  const option = runBuiltCli("--completion", "bash");
  assert.equal(command.status, 0, command.stderr);
  assert.equal(option.status, 0, option.stderr);
  assert.equal(command.stderr, "");
  assert.equal(option.stderr, "");
  assert.match(command.stdout, /function _oseo\b/u);
  for (const name of ["completion", "--completion"]) {
    const query = runBuiltCli(name, "bash", "build", "--out");
    assert.equal(query.status, 0, query.stderr);
    assert.equal(query.stderr, "");
    assert.match(query.stdout, /--output/u);
  }
  const invalid = runBuiltCli("completion", "not-a-shell");
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /not-a-shell/u);
});

test("built ESM packages compose through public exports", () => {
  assert.equal(describeTarget("linux-x86_64-gnu").executableFormat, "elf");
  assert.match(
    runCli({ args: ["build", "--help"], version: "0.0.0" }).stdout,
    /--emit-c/u,
  );
});

test("built npm CLI reads source for dump modes", () => {
  const cli = fileURLToPath(
    new URL("../packages/cli/dist/main.js", import.meta.url),
  );
  const fixture = fileURLToPath(
    new URL("./fixtures/native-reference.ts", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [cli, "build", "--emit-c", fixture],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /oseo_add/u);
  assert.match(result.stdout, /oseo_console_log/u);
});

test("built npm CLI reports Optique argument errors", () => {
  const cli = fileURLToPath(
    new URL("../packages/cli/dist/main.js", import.meta.url),
  );
  const result = spawnSync(process.execPath, [cli, "--unknown"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected option/u);
  assert.match(result.stderr, /--unknown/u);
});
