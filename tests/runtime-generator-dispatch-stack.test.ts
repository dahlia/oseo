/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** Assert that normal, thrown, and budget-failure exits restore the charge. */
const accountingBackend: typeof cBackend = {
  ...cBackend,
  emit(input) {
    const emitted = cBackend.emit(input);
    return {
      ...emitted,
      source: emitted.source.replaceAll(
        "oseo_context_destroy(&context);",
        "if (context.active_frame_slots != 0u) abort();\n" +
          "        oseo_context_destroy(&context);",
      ),
    };
  },
};

/** Wide live bodies must consume the callable native-stack charge. */
function recursiveSource(
  kind: "generator" | "async" | "async-generator",
  resumed: boolean,
): string {
  const bindings = Array.from(
    { length: 1_000 },
    (_, index) => `let a${index} = ${index};`,
  ).join("\n");
  const header =
    kind === "generator"
      ? "function*"
      : kind === "async"
        ? "async function"
        : "async function*";
  const suspend = kind === "async" ? "await 0;" : "yield 0;";
  const recurse =
    kind === "async" ? "g(depth - 1, false);" : "g(depth - 1, false).next();";
  const start =
    kind === "async"
      ? `g(24, ${resumed});`
      : resumed
        ? "const it = g(24, true); it.next(); it.next();"
        : "g(24, false).next();";
  return `${header} g(depth, pause) {
${bindings}
  ${resumed ? `if (pause) { ${suspend} }` : ""}
  if (depth > 0) { ${recurse} }
  return a999;
}
console.log("before");
${start}
console.log("after");
`;
}

/** Observe the selected native lane, with an instrumented final balance. */
async function observe(
  source: string,
  policy: "disabled" | "enabled",
  expectedOutput?: string,
) {
  assert.ok(nativeTarget != null);
  const compiled = compileSource(
    babelFrontend,
    {
      source,
      sourceId: "generator-stack.js",
    },
    { specialization: policy, test262Host: true },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const observation = withNativeFixture(
    {
      backend: accountingBackend,
      host,
      input: compiled.mir,
      operation: "execute",
      runtime: cRuntimeProvider,
      target: nativeTarget,
      toolchain: nativeToolchain,
    },
    (native) => {
      assert.doesNotMatch(
        native.stderr,
        /AddressSanitizer|runtime error:|stack-overflow/u,
      );
      assert.ok(expectedOutput != null, "Expected a resource diagnostic.");
      assert.equal(native.exitStatus, 0, native.stderr);
      assert.equal(native.stderr, "");
      assert.equal(native.stdout, expectedOutput);
    },
  );
  if (expectedOutput == null) {
    // The fixture helper retains any nonzero execution as an Error cause.
    // Require the exact owned diagnostic and exit 1, including the injected
    // zero-charge assertion on the generated main's failure path.
    await assert.rejects(observation, (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error.cause instanceof Error);
      assert.match(
        error.cause.message,
        new RegExp(
          "^Native fixture failed \\(1\\):\\n" +
            "generator-stack\\.js:\\d+:\\d+: error\\[OSEO2001\\]: " +
            "Maximum active native frame budget exceeded\\.\\n$",
          "u",
        ),
      );
      return true;
    });
  } else {
    await observation;
  }
}

for (const kind of ["generator", "async", "async-generator"] as const) {
  for (const resumed of [false, true]) {
    test(
      `${kind} ${resumed ? "resumed" : "initial"} dispatch owns stack budget`,
      {
        skip: nativeTarget == null ? "requires a supported native host" : false,
      },
      async () => {
        for (const policy of ["disabled", "enabled"] as const) {
          await observe(recursiveSource(kind, resumed), policy);
        }
      },
    );
  }
}

test(
  "continuation charges balance across suspension, throw, and return",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const bindings = Array.from(
      { length: 256 },
      (_, index) => `let a${index} = ${index};`,
    ).join("\n");
    const source = `
let cleaned = 0;
function* g(marker) {
${bindings}
  try {
    yield marker;
    return a255;
  } finally { cleaned++; }
}
async function f(marker) {
${bindings}
  await 0;
  return marker;
}
async function* ag(marker) {
${bindings}
  try {
    yield await f(marker);
    return a255;
  } finally { cleaned++; }
}
async function main() {
  const other = $262.createRealm().global;
  for (let i = 0; i < 72; i++) {
    const marker = new other.Object();
    const it = g(marker);
    if (it.next().value !== marker) throw "lost generator root";
    try { it.throw(marker); } catch (reason) {
      if (reason !== marker) throw "lost thrown root";
    }
    const closed = g(marker);
    closed.next();
    if (closed.return(marker).value !== marker) throw "lost return root";
    const ait = ag(marker);
    const first = await ait.next();
    if (first.value !== marker) throw "lost async root";
    const last = await ait.return(marker);
    if (last.value !== marker) throw "lost async return root";
    if (await f(marker) !== marker) throw "lost await root";
  }
  console.log("balanced", cleaned);
}
main();
`;
    for (const policy of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await observe(source, policy, "balanced 216\n");
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);
