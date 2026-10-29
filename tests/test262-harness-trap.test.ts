/* eslint-disable no-await-in-loop -- Scripted variants run in order. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

import type { CliResult } from "../packages/cli/src/index.ts";
import type { Test262Result } from "../packages/testkit/src/index.ts";
import {
  assembleTest262Source,
  executeTest262Case,
  parseHarnessDefinitions,
  parseHarnessObjectMembers,
  parseTest262Case,
} from "../tools/test262.ts";
import type {
  Test262ExecutionRequest,
  Test262Executor,
  Test262Harnesses,
} from "../tools/test262.ts";
import {
  harnessArmedMarker,
  harnessTrapMarker,
  harnessTrapOutcome,
  harnessTrapSource,
} from "../tools/test262-harness-trap.ts";
import { isString } from "../tools/value-kinds.ts";

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const include = "temporalHelpers.js";
const reviewed = await readFile(
  new URL(`test262/harness/${include}`, import.meta.url),
  "utf8",
);
const upstream = await readFile(
  new URL(`harness/${include}`, import.meta.resolve("test262/package.json")),
  "utf8",
);

const harnesses: Test262Harnesses = {
  base: "function assert() {}",
  done: "function $DONE() {}",
  includes: new Map([[include, reviewed]]),
  upstreamDefinitions: new Map([
    [include, parseHarnessDefinitions(upstream, include)],
  ]),
  upstreamMembers: new Map([[include, parseHarnessObjectMembers(upstream)]]),
};

/** The token of the trap one assembled request installs. */
function requestToken(request: Test262ExecutionRequest): string {
  const prefix = JSON.stringify(harnessArmedMarker).slice(0, -1);
  const start = request.source.indexOf(prefix);
  assert.ok(start >= 0, "the request installs the trap");
  const token = request.source.slice(
    start + prefix.length,
    start + prefix.length + 32,
  );
  assert.match(token, /^[0-9a-f]{32}$/u);
  return token;
}

/**
 * Run each assembled variant in a fresh realm and report it the way the
 * native runtime does: buffered `console.log` output on standard output,
 * a nonzero status and the thrown identity marker for an unhandled throw.
 */
function realmExecutor(requests: Test262ExecutionRequest[]): Test262Executor {
  return {
    async execute(request) {
      requests.push(request);
      let stdout = "";
      const context = createContext({
        write(line: string) {
          stdout += `${line}\n`;
        },
      });
      runInContext(
        "(function (write) { globalThis.console = { log: function () { " +
          "write(Array.prototype.join.call(arguments, ' ')); } }; })" +
          "(write);\n" +
          "delete globalThis.write;",
        context,
      );
      try {
        runInContext(request.source, context);
      } catch (error) {
        context.thrown = error;
        const identity: unknown = runInContext(
          "thrown instanceof Error ? thrown.constructor.name : undefined",
          context,
        );
        return await Promise.resolve({
          executed: true,
          exitStatus: 1,
          stderr: isString(identity)
            ? `${identity}\nOSEO_THROWN ${identity}\n`
            : "error[OSEO2001]: Unhandled JavaScript throw.\n",
          stdout,
        });
      }
      return await Promise.resolve({
        executed: true,
        exitStatus: 0,
        stderr: "",
        stdout,
      });
    },
  };
}

interface CaseOptions {
  readonly flags?: string;
  readonly negative?: boolean;
}

async function runCase(
  body: string,
  executor: Test262Executor,
  options: CaseOptions = {},
): Promise<Test262Result> {
  const metadata =
    (options.flags == null ? "" : `flags: [${options.flags}]\n`) +
    (options.negative === true
      ? "negative:\n  phase: runtime\n  type: TypeError\n"
      : "");
  const source = `/*---\n${metadata}includes: [${include}]\n---*/\n${body}\n`;
  const parsed = parseTest262Case(source, "test/temporal.js", revision);
  return await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    executor,
    ["iterator-protocol"],
  );
}

function assertHarnessFailure(result: Test262Result, pattern: RegExp): void {
  assert.equal(result.classification, "harness-failure", result.case.path);
  assert.equal(result.observation.failureKind, "harness");
  assert.match(result.observation.detail ?? "", pattern);
  assert.deepEqual(result.dependencies, ["iterator-protocol"]);
}

/**
 * Observations of omitted members, including every shape that bypassed
 * the static member guard this trap replaces.
 */
const trappedBodies: readonly (readonly [string, string?])[] = [
  ["TemporalHelpers.observeProperty([], {}, 'x', 1);"],
  ["TemporalHelpers['assertDuration'];"],
  ["TemporalHelpers?.ISO;"],
  ["const key = 'ISO';\nTemporalHelpers[key];"],
  ["const { observeProperty } = TemporalHelpers;"],
  ["'ISO' in TemporalHelpers;"],
  ["Object.getOwnPropertyDescriptor(TemporalHelpers, 'ISO');"],
  ["Object.keys(TemporalHelpers);"],
  ["for (const key in TemporalHelpers) {}"],
  ["JSON.stringify(TemporalHelpers);"],
  ["({ ...TemporalHelpers });"],
  ["Reflect.ownKeys(TemporalHelpers);"],
  ["TemporalHelpers.ISO = 1;"],
  ["delete TemporalHelpers.ISO;"],
  ["Object.defineProperty(TemporalHelpers, 'ISO', { value: 1 });"],
  ["Object.create(TemporalHelpers).ISO;"],
  ["Reflect.get(TemporalHelpers, 'ISO');"],
  // The outer review's two bypasses: an object environment that lacks the
  // name, and a Script var that shares the harness binding.
  [
    "with ({}) { TemporalHelpers.observeProperty([], {}, 'x', 1); }",
    "noStrict",
  ],
  ["var TemporalHelpers;\nTemporalHelpers.observeProperty([], {}, 'x', 1);"],
  ["if (true) { var TemporalHelpers; }\nTemporalHelpers.ISO;"],
  ["{ var TemporalHelpers; TemporalHelpers.ISO; }"],
  ["for (var TemporalHelpers in {}) {}\nTemporalHelpers.ISO;"],
  ["function f() { with ({}) { TemporalHelpers.ISO; } }\nf();", "noStrict"],
  ["with (TemporalHelpers) { ISO; }", "noStrict"],
  // The global object, run-time source, and getters.
  ["globalThis.TemporalHelpers.ISO;"],
  ["this.TemporalHelpers.ISO;"],
  ["(function () { return this; })()['Temporal' + 'Helpers'].ISO;", "noStrict"],
  ["eval('TemporalHelpers.ISO');"],
  ["Function('return TemporalHelpers.ISO')();"],
  ["const o = { get h() { return TemporalHelpers; } };\no.h.ISO;"],
  // Inherited and replaced members that return the object itself.
  ["TemporalHelpers.valueOf().observeProperty([], {}, 'x', 1);"],
  [
    "TemporalHelpers.observeMethod = Object.prototype.valueOf;\n" +
      "TemporalHelpers.observeMethod().observeProperty([], {}, 'x', 1);",
  ],
  // A computed class key sees the this around the class.
  ["class C { [this['Temporal' + 'Helpers'].ISO]() {} }", "noStrict"],
  // Inherited properties cannot add a trap or hide an omitted key.
  [
    "Object.prototype.getPrototypeOf = function () { return null; };\n" +
      "Object.getPrototypeOf(TemporalHelpers);\nTemporalHelpers.ISO;",
  ],
  // Replacing what the trap uses after arming changes nothing.
  ["Reflect.get = function () { return 1; };\nTemporalHelpers.ISO;"],
  ["Proxy = undefined;\nTypeError = undefined;\nTemporalHelpers.ISO;"],
];

test("traps every observation of an omitted harness member", async () => {
  const requests: Test262ExecutionRequest[] = [];
  const executor = realmExecutor(requests);
  for (const [body, flags] of trappedBodies) {
    const options = flags == null ? {} : { flags };
    assertHarnessFailure(
      await runCase(body, executor, options),
      /observed TemporalHelpers[. ]/u,
    );
    // A throw the trap causes can never satisfy a runtime negative.
    assertHarnessFailure(
      await runCase(body, executor, { ...options, negative: true }),
      /observed TemporalHelpers[. ]/u,
    );
  }
  for (const request of requests) {
    assert.ok(request.source.includes(reviewed));
    assert.deepEqual(
      request.fragment?.sources.map((source) => source.sourceId),
      ["base.js", include, "harness-trap.js"],
    );
  }
});

test("a case cannot catch or outlast the harness trap", async () => {
  const executor = realmExecutor([]);
  for (const body of [
    "try { TemporalHelpers.ISO; } catch (error) {}",
    "try { Object.keys(TemporalHelpers); } catch (error) {}\n" +
      "throw new TypeError('expected');",
    "try { TemporalHelpers.ISO; } finally { console.log('after'); }",
  ]) {
    assertHarnessFailure(await runCase(body, executor), /observed/u);
    assertHarnessFailure(
      await runCase(body, executor, { negative: true }),
      /observed|without/u,
    );
  }
});

test("kept harness members run through the trap unchanged", async () => {
  const requests: Test262ExecutionRequest[] = [];
  const executor = realmExecutor(requests);
  for (const [body, flags] of [
    [
      "const calls = [];\n" +
        "const bag = TemporalHelpers.propertyBagObserver(calls, {}, 'o');\n" +
        "TemporalHelpers.observeMethod(calls, {}, 'm', 'o');\n" +
        "TemporalHelpers['toPrimitiveObserver'](calls, 1, 'p');",
    ],
    ["// TemporalHelpers.ISO\nconst text = 'TemporalHelpers.ISO';"],
    ["typeof TemporalHelpers;"],
    ["function local(TemporalHelpers) { TemporalHelpers.ISO; }\nlocal({});"],
    ["with ({ TemporalHelpers: {} }) { TemporalHelpers.ISO; }", "noStrict"],
    ["with (TemporalHelpers) { observeMethod([], {}, 'm'); }", "noStrict"],
    ["const global = globalThis;\neval('1');"],
    ["'observeMethod' in TemporalHelpers;\nTemporalHelpers.unknown;"],
    ["TemporalHelpers.added = 1;\nif (TemporalHelpers.added !== 1) throw 1;"],
    [
      "TemporalHelpers.observeMethod = 1;\n" +
        "delete TemporalHelpers.observeMethod;",
    ],
    ["Object.prototype.toString.call(TemporalHelpers);"],
    ["String(TemporalHelpers.valueOf() === TemporalHelpers);"],
    // Printed marker text without this case's token is program output.
    [
      `console.log('${harnessTrapMarker}' + '0'.repeat(32) + ':x.y');\n` +
        `console.log('${harnessTrapMarker}');`,
    ],
  ] as const) {
    const result = await runCase(
      body,
      executor,
      flags == null ? {} : { flags },
    );
    assert.equal(result.classification, "pass", result.observation.detail);
  }
  // Every variant of one case shares a token; another case gets a new one.
  const tokens = new Set(requests.map(requestToken));
  assert.ok(tokens.size > 1);
  const first = requests.filter(
    (request) => requestToken(request) === requestToken(requests[0]!),
  );
  assert.ok(first.length > 1);
});

test("the kept observers behave as upstream behind the trap", () => {
  const probe = `(() => {
    const calls = [];
    const local = Symbol("local");
    const bag = TemporalHelpers.propertyBagObserver(calls, {
      plain: 1, "two words": "x", 3: 2, [local]: 4, nested: {},
      skipped: "kept",
    }, "bag", ["skipped"]);
    const reads = [+bag.plain, \`\${bag["two words"]}\`, +bag[3],
      +bag[local], bag.skipped, Object.keys(bag)];
    const target = {
      value: 2,
      add(left, right) { return [this === target, left + right + this.value]; },
    };
    TemporalHelpers.observeMethod(calls, target, "add", "target");
    reads.push(target.add(3, 4));
    reads.push(String(TemporalHelpers.toPrimitiveObserver(calls, 5, "p")));
    return JSON.stringify({ calls, reads });
  })()`;
  const run = (harness: string): string => {
    const context = createContext({ console: { log() {} } });
    runInContext(harness, context);
    const observed: unknown = runInContext(probe, context);
    assert.ok(isString(observed));
    return observed;
  };
  const parsed = parseTest262Case(
    `/*---\nincludes: [${include}]\n---*/\n`,
    "test/temporal.js",
    revision,
  );
  for (const strictness of ["non-strict", "strict"] as const) {
    const trapped = assembleTest262Source(
      "",
      strictness,
      parsed.case,
      { ...harnesses, base: "" },
      false,
      "0".repeat(32),
    );
    assert.ok(trapped.includes(harnessArmedMarker));
    assert.equal(run(trapped), run(upstream));
  }
});

test("an assembly that needs the trap requires its token", async () => {
  const parsed = parseTest262Case(
    `/*---\nincludes: [${include}]\n---*/\n`,
    "test/temporal.js",
    revision,
  );
  assert.throws(
    () =>
      assembleTest262Source("", "non-strict", parsed.case, harnesses, false),
    /needs a token for the omitted-member trap/u,
  );
  // Without upstream member records nothing is trapped or needs a token.
  const plain = assembleTest262Source(
    "",
    "non-strict",
    parsed.case,
    {
      base: harnesses.base,
      done: harnesses.done,
      includes: harnesses.includes,
    },
    false,
  );
  assert.ok(!plain.includes(harnessArmedMarker));
  const sourceText = harnessTrapSource(
    new Map([["Helpers", new Set(["b", "a"])]]),
    "1".repeat(32),
  );
  assert.match(
    sourceText,
    /Helpers = install\(Helpers, "Helpers", \["a","b"\]\);/u,
  );
});

/**
 * Kept-member operations whose descriptors inherit fields a case added to
 * Object.prototype. Upstream completes each one, so the trapped harness
 * must too, and a runtime negative must not match a throw it introduced.
 */
const inheritedDescriptorBodies: readonly string[] = [
  "Object.prototype.get = function () {};\n" +
    "TemporalHelpers.observeMethod = 1;",
  "Object.prototype.get = function () {};\n" +
    "Object.getOwnPropertyDescriptor(TemporalHelpers, 'observeMethod');",
  "Object.prototype.set = function () {};\n" +
    "TemporalHelpers.observeMethod = 1;",
  "Object.prototype.get = function () {};\n" +
    "Object.prototype.hasOwnProperty.call(TemporalHelpers, 'observeMethod');",
  "Object.defineProperty(TemporalHelpers, 'added', { get() {} });\n" +
    "Object.prototype.value = 1;\n" +
    "Object.getOwnPropertyDescriptor(TemporalHelpers, 'added');\n" +
    "TemporalHelpers.added;",
];

test("inherited descriptor fields leave kept members as upstream", async () => {
  const executor = realmExecutor([]);
  for (const body of inheritedDescriptorBodies) {
    const context = createContext({ console: { log() {} } });
    runInContext(upstream, context);
    runInContext(body, context);
    const result = await runCase(body, executor);
    assert.equal(result.classification, "pass", result.observation.detail);
    const negative = await runCase(body, executor, { negative: true });
    assert.equal(negative.classification, "semantic-failure", body);
  }
});

test("a rebound trap intrinsic leaves the case unarmed", async () => {
  const executor = realmExecutor([]);
  for (const body of [
    "function Proxy() {}",
    "function TypeError() {}",
    "function Reflect() {}",
    "async function Proxy() {}",
    "function console() {}",
    "let Reflect = {};",
    "class Proxy {}",
    // A case that cannot know the token cannot forge the armed line.
    "function Proxy() {}\n" +
      `console.log('${harnessArmedMarker}' + '0'.repeat(32));`,
  ]) {
    assertHarnessFailure(await runCase(body, executor), /without .* armed/u);
    assertHarnessFailure(
      await runCase(body, executor, { negative: true }),
      /without .* armed/u,
    );
  }
});

test("withholds trapped harness objects outside a plain Script", async () => {
  let executions = 0;
  const executor: Test262Executor = {
    async execute() {
      executions += 1;
      return await Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
  };
  for (const [metadata, body] of [
    ["flags: [module]\n", "TemporalHelpers.observeMethod([], {}, 'm');\n"],
    ["", "print('x');\n"],
  ] as const) {
    const source = `/*---\n${metadata}includes: [${include}]\n---*/\n` + body;
    const parsed = parseTest262Case(source, "test/temporal.js", revision);
    const result = await executeTest262Case(
      source,
      parsed,
      new Set<string>(),
      harnesses,
      executor,
      [],
      { rootPath: "/", sourcePath: "/test/temporal.js" },
    );
    assert.equal(result.classification, "unsupported-profile-feature");
    assert.equal(
      result.observation.detail,
      `Not executed: the reviewed harness ${include} omits members of ` +
        "TemporalHelpers, and its omitted-member trap needs a Script " +
        "without the test262 host.",
    );
  }
  assert.equal(executions, 0);
});

/** One variant result built from the trap token of its request. */
type ScriptedResult = (token: string) => CliResult;

function scriptedExecutor(results: readonly ScriptedResult[]): Test262Executor {
  let index = 0;
  return {
    async execute(request) {
      const result = results[Math.min(index, results.length - 1)]!;
      index += 1;
      return await Promise.resolve(result(requestToken(request)));
    },
  };
}

const armed = (token: string): string => `${harnessArmedMarker}${token}\n`;
const trapLine = (token: string): string =>
  `${harnessTrapMarker}${token}:TemporalHelpers.ISO\n`;

test("reads the trap marker on every outcome", async () => {
  const cases: readonly (readonly [
    string,
    CaseOptions,
    readonly ScriptedResult[],
    string,
  ])[] = [
    [
      "a pass",
      {},
      [
        (token) => ({
          exitStatus: 0,
          stderr: "",
          stdout: armed(token) + trapLine(token),
        }),
      ],
      "harness-failure",
    ],
    [
      "a matching runtime negative",
      { negative: true },
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "TypeError\nOSEO_THROWN TypeError\n",
          stdout: armed(token) + trapLine(token),
        }),
      ],
      "harness-failure",
    ],
    [
      "a marker without its line break",
      {},
      [
        (token) => ({
          exitStatus: 0,
          stderr: "",
          stdout: `${armed(token)}partial${trapLine(token).trimEnd()}`,
        }),
      ],
      "harness-failure",
    ],
    [
      "a killed process that kept the marker",
      {},
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "",
          stdout: armed(token) + trapLine(token),
        }),
      ],
      "harness-failure",
    ],
    [
      "a killed process that lost its buffered output",
      {},
      [() => ({ executed: true, exitStatus: 1, stderr: "", stdout: "" })],
      "harness-failure",
    ],
    [
      // A full buffer flushed the armed line before a later trap line
      // was lost; the kill still rules out a pass and a negative match.
      "a killed process that kept only its armed line",
      {},
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "",
          stdout: `${armed(token)}${"x".repeat(16_384)}`,
        }),
      ],
      "semantic-failure",
    ],
    [
      "a killed runtime negative that kept only its armed line",
      { negative: true },
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "",
          stdout: armed(token),
        }),
      ],
      "semantic-failure",
    ],
    [
      // The documented residual: an outside kill after the runtime wrote
      // its final identity line but before the exit flush lost the trap
      // line. No case code can cause it; this pins what the runner sees.
      "an outside kill between the identity line and the exit flush",
      { negative: true },
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "TypeError\nOSEO_THROWN TypeError\n",
          stdout: `${armed(token)}${"x".repeat(16_384)}`,
        }),
      ],
      "expected-negative",
    ],
    [
      "a matching runtime negative without the armed line",
      { negative: true },
      [
        () => ({
          executed: true,
          exitStatus: 1,
          stderr: "TypeError\nOSEO_THROWN TypeError\n",
          stdout: "",
        }),
      ],
      "harness-failure",
    ],
    [
      "a trap in a later variant only",
      {},
      [
        (token) => ({ exitStatus: 0, stderr: "", stdout: armed(token) }),
        (token) => ({
          exitStatus: 0,
          stderr: "",
          stdout: armed(token) + trapLine(token),
        }),
      ],
      "harness-failure",
    ],
    [
      "a trap beside an infrastructure failure",
      {},
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "a.js:1:1: error[OSEO3001]: Standard output failed.\n",
          stdout: armed(token) + trapLine(token),
        }),
      ],
      "harness-failure",
    ],
    [
      "an armed pass",
      {},
      [(token) => ({ exitStatus: 0, stderr: "", stdout: armed(token) })],
      "pass",
    ],
    [
      "an armed runtime negative",
      { negative: true },
      [
        (token) => ({
          executed: true,
          exitStatus: 1,
          stderr: "TypeError\nOSEO_THROWN TypeError\n",
          stdout: armed(token),
        }),
      ],
      "expected-negative",
    ],
    [
      "a forged token",
      {},
      [
        (token) => ({
          exitStatus: 0,
          stderr: "",
          stdout: armed(token) + trapLine("f".repeat(32)),
        }),
      ],
      "pass",
    ],
    [
      "a compile-stage rejection",
      {},
      [
        () => ({
          exitStatus: 1,
          stderr: "a.js:1:1: error[OSEO1001]: Unsupported syntax.\n",
          stdout: "",
        }),
      ],
      "unsupported-profile-feature",
    ],
    [
      "an infrastructure failure before arming",
      {},
      [
        () => ({
          executed: true,
          exitStatus: 1,
          stderr: "a.js:1:1: error[OSEO3001]: Host failure.\n",
          stdout: "",
        }),
      ],
      "infrastructure-failure",
    ],
  ];
  for (const [name, options, results, expected] of cases) {
    const result = await runCase(
      "TemporalHelpers.observeMethod([], {}, 'm');",
      scriptedExecutor(results),
      options,
    );
    assert.equal(result.classification, expected, name);
    if (expected === "harness-failure") {
      assert.doesNotMatch(result.observation.detail ?? "", /[0-9a-f]{32}/u);
    }
  }
});

test("parses the trap outcome of one variant", () => {
  const token = "a".repeat(32);
  assert.deepEqual(
    harnessTrapOutcome(`x${harnessTrapMarker}${token}:H.k\nmore`, token, true),
    { kind: "trapped", member: "H.k" },
  );
  assert.deepEqual(
    harnessTrapOutcome(`${harnessTrapMarker}${token}:H own keys`, token, false),
    { kind: "trapped", member: "H own keys" },
  );
  assert.equal(
    harnessTrapOutcome(`${harnessArmedMarker}${token}\n`, token, true),
    undefined,
  );
  assert.deepEqual(
    harnessTrapOutcome(`${harnessArmedMarker}${"b".repeat(32)}\n`, token, true),
    { kind: "unarmed" },
  );
  assert.equal(harnessTrapOutcome("", token, false), undefined);
  assert.equal(
    harnessTrapOutcome(
      `${harnessTrapMarker}${"b".repeat(32)}:H.k\n` +
        `${harnessArmedMarker}${token}\n`,
      token,
      true,
    ),
    undefined,
  );
});
