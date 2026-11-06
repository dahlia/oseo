/*
 * The early errors around the legacy numeric and string literals.
 * Each source text gets one verdict per goal from the compiler and from
 * Node.js and Deno, and all three must match the verdict written here. The
 * values of the admitted forms are the annexb-legacy-literals fixture's in
 * tests/native.ts.
 */

import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import test from "node:test";

import type { Diagnostic } from "../packages/compiler/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";
import {
  acceptedInEveryGoal,
  type LegacyLiteralCase,
  rejectedInEveryGoal,
  sloppyScriptOnly,
} from "./native/fixtures/annexb-legacy-literals.ts";

type Goal = "module" | "script" | "strict";

const strictPrefix = '"use strict";\n';
const goals: readonly Goal[] = ["script", "strict", "module"];
const goalSource = (goal: Goal, source: string): string =>
  goal === "strict" ? `${strictPrefix}${source}` : source;

const allSources = [
  ...sloppyScriptOnly.map(({ source }) => source),
  ...rejectedInEveryGoal.map(({ source }) => source),
  ...acceptedInEveryGoal,
];

/*
 * Parsing a Script through node:vm and importing a Module from a data: URL
 * both work unchanged on the two hosts. The accepted sources throw nothing
 * when a Module evaluates them, so only an early error reaches the catch.
 * Deno's module loader parses before V8 does and wraps the parse failures it
 * finds first in a TypeError whose message begins with "SyntaxError:".
 */
const observer = (sources: readonly string[]): string => `
import vm from "node:vm";
const verdict = async (parse) => {
  try {
    await parse();
    return "accept";
  } catch (error) {
    const syntax =
      error instanceof SyntaxError ||
      (error instanceof TypeError && error.message.startsWith("SyntaxError:"));
    return syntax ? "reject" : String(error);
  }
};
const strictPrefix = ${JSON.stringify(strictPrefix)};
const verdicts = [];
for (const source of ${JSON.stringify(sources)}) {
  const url = "data:text/javascript;base64," + btoa(source);
  verdicts.push({
    module: await verdict(() => import(url)),
    script: await verdict(() => new vm.Script(source)),
    strict: await verdict(() => new vm.Script(strictPrefix + source)),
  });
}
console.log(JSON.stringify(verdicts));
`;

type Verdicts = Readonly<Record<Goal, string>>;

async function hostVerdicts(): Promise<readonly (readonly Verdicts[])[]> {
  const host = createNodeHost();
  const directory = await realpath(
    await host.makeTemporaryDirectory("oseo-legacy-literals-"),
  );
  try {
    const path = `${directory}/observer.mjs`;
    await host.writeTextFile(path, observer(allSources));
    const observations = [
      await host.run({ args: [path], command: "node", cwd: directory }),
      await host.run({
        args: ["run", "--quiet", path],
        command: "deno",
        cwd: directory,
      }),
    ];
    return observations.map((observation) => {
      assert.equal(observation.exitStatus, 0, observation.stderr);
      // SAFETY: the observer above prints exactly this array shape.
      return JSON.parse(observation.stdout) as readonly Verdicts[];
    });
  } finally {
    await host.remove(directory);
  }
}

function compilerDiagnostics(
  goal: Goal,
  source: string,
): readonly Diagnostic[] {
  const input = {
    source: goalSource(goal, source),
    sourceId: "annexb-legacy-literal.js",
  };
  return goal === "module"
    ? babelModuleFrontend.parseModule(input).diagnostics
    : compileSource(babelFrontend, input).diagnostics;
}

function assertRejected(goal: Goal, { at, source }: LegacyLiteralCase): void {
  const diagnostics = compilerDiagnostics(goal, source);
  assert.ok(diagnostics.length > 0, `${goal} accepted ${source}`);
  const offset = goal === "strict" ? strictPrefix.length : 0;
  const start = offset + source.indexOf(at);
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.code, "OSEO0001", source);
    const position = diagnostic.byteRange?.start;
    assert.ok(
      position != null && position >= start && position <= start + at.length,
      `${goal} reported ${source} at ${position}`,
    );
  }
}

test("both hosts decide every goal as the tables do", async () => {
  const expected = [
    ...sloppyScriptOnly.map(() => ({
      module: "reject",
      script: "accept",
      strict: "reject",
    })),
    ...rejectedInEveryGoal.map(() => ({
      module: "reject",
      script: "reject",
      strict: "reject",
    })),
    ...acceptedInEveryGoal.map(() => ({
      module: "accept",
      script: "accept",
      strict: "accept",
    })),
  ];
  for (const verdicts of await hostVerdicts()) {
    assert.deepEqual(verdicts, expected);
  }
});

for (const literal of sloppyScriptOnly) {
  test(`only sloppy Script admits ${literal.source}`, () => {
    assert.deepEqual(compilerDiagnostics("script", literal.source), []);
    assertRejected("strict", literal);
    assertRejected("module", literal);
  });
}

for (const literal of rejectedInEveryGoal) {
  test(`every goal rejects ${literal.source}`, () => {
    for (const goal of goals) assertRejected(goal, literal);
  });
}

for (const source of acceptedInEveryGoal) {
  test(`every goal admits ${source}`, () => {
    for (const goal of goals) {
      assert.deepEqual(compilerDiagnostics(goal, source), []);
    }
  });
}
