/* eslint-disable no-await-in-loop -- Reference Scripts use fresh realms. */
import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import {
  annexbIdentityExpected,
  annexbIdentityDenoExpected,
  annexbIdentityProgram,
} from "./helpers/annexb-identity.ts";

const host = createNodeHost();

test("excluded reflection retains labeled reference metadata", async () => {
  const directory = await host.makeTemporaryDirectory("oseo-identity-pure-");
  try {
    const path = join(directory, "case.js");
    for (const value of [-1000, -1, 0, 17, 1000]) {
      await host.writeTextFile(path, annexbIdentityProgram(value));
      for (const [command, args] of [
        ["node", [path]],
        ["deno", ["run", "--quiet", path]],
      ] as const) {
        assert.deepEqual(await host.run({ command, args, cwd: directory }), {
          exitStatus: 0,
          stderr: "",
          stdout:
            command === "deno"
              ? annexbIdentityDenoExpected
              : annexbIdentityExpected,
        });
      }
    }
  } finally {
    await host.remove(directory);
  }
});

test("reflection subjects retain both native policy compilation paths", () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      {
        source: annexbIdentityProgram(17),
        sourceId: "annexb-identities.js",
      },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    assert.ok(cBackend.emit(result.mir).source.length > 0);
  }
});
