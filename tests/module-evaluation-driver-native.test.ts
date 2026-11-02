/* eslint-disable no-await-in-loop -- Native policies run serially. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { fileURLToPath } from "node:url";

import { runNativeCli } from "./native-cli.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const fixtures = fileURLToPath(
  new URL("./fixtures/module-evaluation-driver/", import.meta.url),
);

/**
 * One fixed static graph. Every listed reference host must print the same
 * stdout as both native policies under forced collection. A rejected entry
 * names its error; these graphs leave no job queued after the rejection,
 * so a host that stops at the report still prints the whole log.
 */
interface DriverCase {
  readonly error?: string;
  /** Generated sources written to a temporary directory instead. */
  readonly files?: () => ReadonlyMap<string, string>;
  readonly name: string;
  readonly references: readonly ("deno" | "node")[];
  readonly stdout: string;
}

/**
 * A chain of 160 modules whose leaf and every fortieth link await, so the
 * driver's depth-first walk and ancestor gathering run 160 levels deep
 * while the collector runs at every safepoint.
 */
function deepChain(): ReadonlyMap<string, string> {
  const length = 160;
  const files = new Map<string, string>();
  for (let index = 0; index < length; index += 1) {
    const lines =
      index + 1 < length
        ? [`import { value as next } from "./m${index + 1}.mjs";`]
        : [];
    if (index === length - 1) {
      lines.push("export let value = 0;", "await 0;", "value = 1;");
    } else {
      lines.push("export let value = next + 1;");
      if (index % 40 === 20) lines.push("await null;");
    }
    files.set(`m${index}.mjs`, `${lines.join("\n")}\n`);
  }
  files.set(
    "entry.mjs",
    'import { value } from "./m0.mjs";\nconsole.log("depth", value);\n',
  );
  return files;
}

const cases: readonly DriverCase[] = [
  {
    name: "ancestor-order",
    references: ["deno", "node"],
    stdout: [
      "leaf start",
      "tick 1",
      "leaf done",
      "tick 2",
      "sync a",
      "sync c",
      "async b start",
      "tick 3",
      "async b done",
      "tick 4",
      "sync d",
      "entry",
      "",
    ].join("\n"),
  },
  {
    name: "cycle-async",
    references: ["deno", "node"],
    stdout: [
      "c sync",
      "b start",
      "c reaction",
      "b done",
      "a start b ready",
      "a done",
      "observer a ready b ready",
      "entry b ready",
      "",
    ].join("\n"),
  },
  {
    files: deepChain,
    name: "deep-chain",
    references: ["deno", "node"],
    stdout: "depth 160\n",
  },
  {
    name: "json-sibling",
    references: ["deno", "node"],
    stdout: "slow start data\nslow done\nentry 1,2,3,4\n",
  },
  {
    // Node.js 24 reads `then` and species from user-visible promises in
    // its loader and aborts when the global Promise is replaced, so Deno
    // is the single reference for this graph.
    name: "promise-patching",
    references: ["deno"],
    stdout: [
      "patched",
      "waiting start",
      "other start",
      "waiting done 0",
      "other done 0",
      "entry 0",
      "",
    ].join("\n"),
  },
  {
    error: "Error: leaf failed",
    name: "rejection-skips-parents",
    references: ["deno", "node"],
    stdout: "independent\nleaf start\nleaf throws\n",
  },
  {
    error: "RangeError: cycle member failed",
    name: "sync-error-in-cycle",
    references: ["deno", "node"],
    stdout: "b throws\n",
  },
];

for (const driverCase of cases) {
  test(
    `the module evaluation driver runs ${driverCase.name}`,
    {
      skip: nativeTarget == null ? "requires a supported native host" : false,
    },
    async () => {
      let directory = `${fixtures}${driverCase.name}`;
      const generated = driverCase.files?.();
      if (generated != null) {
        directory = await host.makeTemporaryDirectory("oseo-module-driver-");
        for (const [name, source] of generated) {
          await host.writeTextFile(`${directory}/${name}`, source);
        }
      }
      try {
        await assertCase(driverCase, `${directory}/entry.mjs`);
      } finally {
        if (generated != null) await host.remove(directory);
      }
    },
  );
}

async function assertCase(
  driverCase: DriverCase,
  entry: string,
): Promise<void> {
  for (const reference of driverCase.references) {
    const observation = await host.run(
      reference === "node"
        ? { args: [entry], command: process.execPath, cwd: fixtures }
        : {
            args: ["run", "--quiet", "--allow-read", entry],
            command: "deno",
            cwd: fixtures,
          },
    );
    assert.equal(observation.stdout, driverCase.stdout, reference);
    if (driverCase.error == null) {
      assert.equal(observation.exitStatus, 0, observation.stderr);
      assert.equal(observation.stderr, "", reference);
    } else {
      assert.notEqual(observation.exitStatus, 0, reference);
      assert.ok(
        observation.stderr.includes(driverCase.error),
        observation.stderr,
      );
    }
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const native = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            entry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(native.stdout, driverCase.stdout, specialization);
      if (driverCase.error == null) {
        assert.equal(native.exitStatus, 0, native.stderr);
        assert.equal(native.stderr, "");
      } else {
        assert.equal(native.exitStatus, 1, specialization);
        assert.ok(
          native.stderr.includes(`error[OSEO2001]: ${driverCase.error}\n`),
          native.stderr,
        );
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}
