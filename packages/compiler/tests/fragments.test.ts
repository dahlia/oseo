import assert from "node:assert/strict";
import test from "node:test";

import {
  compileBodyFragment,
  compileHarnessFragment,
  type SourceFrontend,
  type SyntaxProgram,
} from "../src/index.ts";

const range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 2 },
};
const program: SyntaxProgram = {
  kind: "program",
  sourceId: "owned",
  range,
  body: [
    {
      kind: "let",
      name: "helper",
      hint: undefined,
      range,
      initializer: { kind: "number", value: 1, range },
    },
  ],
  globalLexicalNames: [{ name: "helper", range }],
  globalObjectNames: [],
};

test("ordered source bytes and duplicates reach the supplied frontend", () => {
  let seen = "";
  const frontend: SourceFrontend = {
    parse(input) {
      seen = input.source;
      return { diagnostics: [], program, parsed: true, sourceId: "owned" };
    },
  };
  const source = { source: "let helper;", sourceId: "helper.js" };
  const result = compileHarnessFragment(frontend, [source, source], true);
  assert.equal(seen, '"use strict";\nlet helper;\nlet helper;');
  assert.equal(result.kind, "compiled");
  if (result.kind !== "compiled") return;
  assert.equal(result.harness.sources.length, 2);
  assert.equal(result.harness.nextBindingId, 1);
});

test("case IDs start after the harness reservation", () => {
  const frontend: SourceFrontend = {
    parse(input) {
      if (input.source === "case") {
        return {
          parsed: true,
          sourceId: "owned",
          diagnostics: [],
          program: {
            ...program,
            body: [
              {
                kind: "let",
                name: "harmless",
                hint: undefined,
                range,
                initializer: { kind: "number", value: 1, range },
              },
            ],
            globalLexicalNames: [{ name: "harmless", range }],
          },
        };
      }
      return { diagnostics: [], program, parsed: true, sourceId: "owned" };
    },
  };
  const prepared = compileHarnessFragment(frontend, []);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  const result = compileBodyFragment(frontend, prepared.harness, {
    sourceId: "case",
    source: "case",
  });
  assert.equal(result.kind, "compiled");
  if (result.kind !== "compiled") return;
  assert.equal(result.bindingCount, 2);
  assert.deepEqual(result.body.mir.script.localBindingIds, [1]);
});

test("frontend recovery diagnostics never produce reusable fragments", () => {
  const frontend: SourceFrontend = {
    parse() {
      return {
        parsed: true,
        sourceId: "owned",
        program,
        diagnostics: [
          {
            code: "OSEO1001",
            message: "recovered",
            sourceId: "owned",
            byteRange: { start: 0, end: 1 },
            range,
          },
        ],
      };
    },
  };
  assert.equal(compileHarnessFragment(frontend, []).kind, "fallback");
});
