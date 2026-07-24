import assert from "node:assert/strict";
import test from "node:test";

import {
  canExecuteTarget,
  describeTarget,
  printMir,
  renderDiagnostic,
  targetForExecutionHost,
} from "../src/index.ts";
import type {
  Diagnostic,
  DiagnosticCode,
  MirProgram,
  SourceRange,
} from "../src/index.ts";

const diagnostic: Diagnostic = {
  byteRange: { end: 0, start: 0 },
  code: "OSEO1001",
  message: "Unsupported syntax.",
  range: {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  },
  sourceId: "fixture.ts",
};

test("renders an owned source-located diagnostic", () => {
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.ts:1:1: error[OSEO1001]: Unsupported syntax.",
  );
});

test("renders every owned diagnostic class without a host stack", () => {
  const codes: readonly DiagnosticCode[] = [
    "OSEO0001",
    "OSEO1001",
    "OSEO2001",
    "OSEO3001",
  ];
  for (const code of codes) {
    const rendered = renderDiagnostic({ ...diagnostic, code });
    assert.match(rendered, new RegExp(`error\\[${code}\\]`, "u"));
    assert.doesNotMatch(rendered, /Error:| at /u);
  }
});

test("requires explicit native and cross targets", () => {
  const linuxHost = {
    architecture: "x86_64",
    operatingSystem: "linux",
  } as const;
  const macHost = {
    architecture: "aarch64",
    operatingSystem: "macos",
  } as const;
  assert.equal(targetForExecutionHost(linuxHost)?.name, "linux-x86_64-gnu");
  assert.equal(targetForExecutionHost(macHost)?.name, "macos-aarch64");
  assert.equal(describeTarget("linux-x86_64-gnu").abi, "gnu");
  assert.equal(describeTarget("linux-aarch64-musl").abi, "musl");
  assert.equal(describeTarget("macos-aarch64").abi, undefined);
  assert.ok(canExecuteTarget(linuxHost, describeTarget("linux-x86_64-gnu")));
  assert.ok(canExecuteTarget(macHost, describeTarget("macos-aarch64")));
  assert.ok(!canExecuteTarget(macHost, describeTarget("linux-aarch64-musl")));
  assert.ok(
    !canExecuteTarget(
      { architecture: "aarch64", operatingSystem: "linux" },
      describeTarget("linux-aarch64-musl"),
    ),
  );
  assert.equal(
    targetForExecutionHost({
      architecture: "unknown",
      operatingSystem: "unknown",
    }),
    undefined,
  );
  assert.throws(
    () => describeTarget("unknown" as never),
    /Unsupported native target/u,
  );
  assert.throws(
    () => describeTarget("aarch64-macos" as never),
    /Unsupported native target/u,
  );
});

const range: SourceRange = {
  end: { column: 2, line: 1 },
  start: { column: 1, line: 1 },
};

test("prints iterator operations with their rooted secondary results", () => {
  const mir: MirProgram = {
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [0],
              detail: "get iterator",
              id: 1,
              iteratorNextMethodResult: 2,
              kind: "iterator-get",
              range,
            },
            {
              arguments: [1, 2],
              detail: "step iterator",
              id: 3,
              iteratorValueResult: 4,
              kind: "iterator-next",
              range,
            },
          ],
          terminator: { kind: "return", value: 4 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 5,
    },
    sourceId: "iterator.ts",
    specialization: "disabled",
  };
  const text = printMir(mir);
  assert.match(text, /%1, %2 = iterator-get get iterator %0/u);
  assert.match(text, /%3, %4 = iterator-next step iterator %1, %2/u);
});

test("prints dynamic argument-list ownership", () => {
  const mir: MirProgram = {
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              detail: "create arguments",
              id: 0,
              kind: "argument-list-create",
              range,
            },
            {
              argumentListId: 0,
              arguments: [],
              detail: "console_log",
              id: 1,
              kind: "call",
              range,
              target: { kind: "console-log" },
            },
          ],
          terminator: { kind: "return", value: 1 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 2,
    },
    sourceId: "argument-list.ts",
    specialization: "disabled",
  };
  assert.match(
    printMir(mir),
    /%1 = call console_log @1:1-1:2 argument-list=%0/u,
  );
});
