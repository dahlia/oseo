import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Fixture } from "../fixture.ts";
import {
  hostScriptCases,
  type HostScriptCall,
  type HostScriptCase,
} from "./host-script-evidence-cases.ts";

const harness = (name: string): string =>
  readFileSync(
    new URL(`../../test262/harness/${name}`, import.meta.url),
    "utf8",
  );

const suite = dirname(
  fileURLToPath(import.meta.resolve("test262/package.json")),
);

/** Read the pinned original byte for byte. */
export function hostScriptOriginal(subject: HostScriptCase): string {
  return readFileSync(join(suite, subject.path), "utf8");
}

const valueCheck = `function hostValue(actual, expected) {
  if (actual !== expected || typeof actual !== typeof expected)
    throw new Test262Error("host Script value/type");
  return actual;
}
`;

/** Prefixes that introduce the single literal argument of an eval call. */
const callPrefixes = ["(0, eval)(", "(0,eval)(", "_eval(", "eval("];

/**
 * Decode the call's literal argument. Only quote and backslash escapes are
 * accepted, so a decoding mismatch cannot hide behind a broader grammar.
 */
export function cookedArgument(call: string): string {
  const prefix = callPrefixes.find((entry) => call.startsWith(entry));
  if (prefix == null || !call.endsWith(")")) {
    throw new Error(`unrecognized eval call: ${call}`);
  }
  const literal = call.slice(prefix.length, -1);
  const quote = literal[0];
  if ((quote !== "'" && quote !== '"') || !literal.endsWith(quote)) {
    throw new Error(`not one string literal: ${call}`);
  }
  let value = "";
  for (let index = 1; index < literal.length - 1; index += 1) {
    const char = literal[index]!;
    if (char === quote) throw new Error(`unescaped quote: ${call}`);
    if (char !== "\\") {
      value += char;
      continue;
    }
    index += 1;
    const escaped = literal[index]!;
    if (escaped !== "'" && escaped !== '"' && escaped !== "\\") {
      throw new Error(`unsupported escape: ${call}`);
    }
    value += escaped;
  }
  return value;
}

/** Host Script source, with inherited strictness made explicit. */
function scriptSource(
  subject: HostScriptCase,
  strict: boolean,
  source: string,
): string {
  const inherited =
    subject.direct && (strict || subject.strictFunctionCaller === true);
  // As in DS-21, `void 0` keeps the directive from becoming the completion.
  return inherited ? '"use strict"; void 0;\n' + source : source;
}

function hostCall(
  subject: HostScriptCase,
  strict: boolean,
  call: HostScriptCall,
  mutated: boolean,
): string {
  const source = mutated ? call.mutation : call.source;
  const invoke = `$262.evalScript(${JSON.stringify(
    scriptSource(subject, strict, source),
  )})`;
  return call.expected == null
    ? invoke
    : `hostValue(${invoke}, ${call.expected})`;
}

/**
 * Replace each eval call, in source order, after the frontmatter. Every
 * other byte of the original, including all assertions, is retained.
 */
export function hostScriptProgram(
  subject: HostScriptCase,
  strict: boolean,
  mutation = -1,
): string {
  const original = hostScriptOriginal(subject);
  const marker = "---*/";
  let cursor = original.indexOf(marker);
  if (cursor < 0) throw new Error(`${subject.path} has no frontmatter`);
  cursor += marker.length;
  let program = original;
  const edits: { readonly from: string; readonly to: string }[] = [
    ...(subject.aliases ?? []).map((from) => ({
      from,
      to: from.replace("= eval;", "= $262.evalScript;"),
    })),
    ...subject.calls.map((call, index) => ({
      from: call.call,
      to: hostCall(subject, strict, call, index === mutation),
    })),
  ];
  for (const edit of edits) {
    const at = program.indexOf(edit.from, cursor);
    if (at < 0) throw new Error(`${subject.path}: missing ${edit.from}`);
    program =
      program.slice(0, at) + edit.to + program.slice(at + edit.from.length);
    cursor = at + edit.to.length;
  }
  if (program.slice(original.indexOf(marker)).includes("eval(")) {
    throw new Error(`${subject.path}: eval call left unreplaced`);
  }
  const includes = (subject.includes ?? []).map(harness).join("\n");
  return (strict ? '"use strict";\n' : "") + includes + valueCheck + program;
}

/** Fixture name for one pinned original. */
export function hostScriptFixtureName(index: number): string {
  return `host-script-evidence-${index}`;
}

/**
 * Each mode runs the program in a fresh realm, then one mutant realm per
 * call site. A mutant is rejected only by its own realm's Test262Error, or,
 * for a runtime-negative original, by completing without its SyntaxError.
 */
export function hostScriptFixture(
  subject: HostScriptCase,
  index: number,
): Fixture {
  const lines: string[] = [];
  const base = harness("base.js");
  for (const mode of subject.modes) {
    const strict = mode === "strict";
    for (let mutation = -1; mutation < subject.calls.length; mutation += 1) {
      const id = `${mode}_${mutation + 1}`;
      const realm = `realm_${id}`;
      const invoke = `${realm}.evalScript(${JSON.stringify(
        hostScriptProgram(subject, strict, mutation),
      )});`;
      lines.push(
        `const ${realm} = $262.createRealm();`,
        `${realm}.evalScript(${JSON.stringify(base)});`,
      );
      if (mutation < 0 && subject.negative === true) {
        lines.push(
          `let thrown_${id} = false;`,
          "try {",
          invoke,
          "} catch (error) {",
          `if (!(error instanceof ${realm}.global.SyntaxError)) throw error;`,
          `thrown_${id} = true;`,
          "}",
          `if (!thrown_${id}) throw new Error("negative completed");`,
        );
      } else if (mutation < 0) {
        lines.push(invoke);
      } else if (subject.negative === true) {
        lines.push(invoke);
      } else {
        lines.push(
          `let rejected_${id} = false;`,
          "try {",
          invoke,
          "} catch (error) {",
          `if (!(error instanceof ${realm}.global.Test262Error))` +
            " throw error;",
          `rejected_${id} = true;`,
          "}",
          `if (!rejected_${id}) throw new Error("mutation survived");`,
        );
      }
      if (mutation < 0 && subject.reached != null) {
        lines.push(`${realm}.evalScript(${JSON.stringify(subject.reached)});`);
      }
    }
    lines.push(`console.log(${JSON.stringify(`${subject.path} ${mode}`)});`);
  }
  return {
    name: hostScriptFixtureName(index),
    source: lines.join("\n"),
    test262Host: true,
  };
}

/** One original per process bounds persistent realm roots under forced GC. */
export const hostScriptFixtures: readonly Fixture[] =
  hostScriptCases.map(hostScriptFixture);

/** Expected standard output of one fixture. */
export function hostScriptExpectedOutput(subject: HostScriptCase): string {
  return subject.modes.map((mode) => `${subject.path} ${mode}\n`).join("");
}

/** Type confusions with identical printed text must fail the value check. */
export const hostScriptValueOracleFixture: Fixture = {
  name: "host-script-evidence-oracle",
  test262Host: true,
  source:
    "$262.evalScript(" +
    JSON.stringify(
      harness("base.js") +
        valueCheck +
        `
function rejected(action) {
  let caught = false;
  try { action(); }
  catch (error) {
    if (!(error instanceof Test262Error)) throw error;
    caught = true;
  }
  if (!caught) throw new Error("type confusion survived");
}
hostValue(true, true);
hostValue("outside", "outside");
hostValue(globalThis, globalThis);
rejected(function () { hostValue("true", true); });
rejected(function () { hostValue(1, true); });
rejected(function () { hostValue(new String("outside"), "outside"); });
rejected(function () { hostValue({}, globalThis); });
rejected(function () {
  hostValue({ toString() { return "outside"; } }, "outside");
});
`,
    ) +
    ');\nconsole.log("host-script-evidence-oracle ok");',
};
