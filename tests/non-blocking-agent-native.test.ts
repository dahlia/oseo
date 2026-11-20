/* eslint-disable no-await-in-loop -- Each native build is isolated. */
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
import process from "node:process";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import {
  blockingAgentFixture,
  nonBlockingAgentSource,
} from "./native/fixtures/non-blocking-agent.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

test(
  "the ordinary and hosted default agents can still block",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = blockingAgentFixture.source;
    const expected = "timed-out\nnot-equal\ntimed-out\nnot-equal\n";
    for (const command of [process.execPath, "deno"]) {
      const result = await host.run({
        command,
        args: command === "deno" ? ["eval", source] : ["-e", source],
        cwd: ".",
      });
      assert.equal(result.exitStatus, 0, result.stderr);
      assert.equal(result.stdout, expected);
    }
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const hosted of [false, true]) {
        for (const specialization of ["disabled", "enabled"] as const) {
          const result = await runNativeCli(
            {
              args: [
                ...(hosted ? ["--test262-host"] : []),
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                "default-policy.js",
              ],
              source,
              version: "0.1.0",
            },
            host,
          );
          assert.equal(result.exitStatus, 0, result.stderr);
          assert.equal(result.stdout, expected);
          assert.equal(result.stderr, "");
        }
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  },
);

test(
  "non-blocking waits validate first and preserve other agents and realms",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const result = await runNativeCli(
          {
            args: [
              "--test262-host",
              "--test262-non-blocking",
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              "non-blocking-agent.js",
            ],
            source: nonBlockingAgentSource,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.match(result.stdout, /realm policy true\n/u);
        assert.match(result.stdout, /child policy timed-out,not-equal\n/u);
        assert.equal(result.stdout.split("async notify ok\n").length - 1, 2);
        assert.equal(result.stdout.split("order ivt\n").length - 1, 2);
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);
