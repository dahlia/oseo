import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";
import {
  hostScriptTraincCases,
  type HostScriptTraincCase,
  type HostScriptTraincSite,
} from "./host-script-trainc-cases.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

/** Read one pinned original file from the reviewed test262 checkout. */
export function hostScriptTraincOriginal(path: string): string {
  return readFileSync(
    new URL(path, import.meta.resolve("test262/package.json")),
    "utf8",
  );
}

/**
 * Value/type and early-error checks. They throw the realm's Test262Error, so
 * a mutation verdict needs only error identity, never these comparators.
 */
export const hostScriptChecks = `function __hsCompletion(actual, expected) {
  if (actual !== expected || typeof actual !== typeof expected)
    throw new Test262Error("completion value/type");
  return actual;
}
function __hsEarlyError(evaluate, after) {
  var keys = Reflect.ownKeys(globalThis).length;
  var evalFunction = globalThis.eval;
  try { evaluate(); }
  catch (error) {
    if (Object.getPrototypeOf(error) !== SyntaxError.prototype)
      throw new Test262Error("early error identity");
    if (Reflect.ownKeys(globalThis).length !== keys ||
        globalThis.eval !== evalFunction || !after())
      throw new Test262Error("early error effects");
    throw error;
  }
  throw new Test262Error("early error missing");
}
`;

const strictPrefix = '"use strict"; void 0;\n';

/** Literal host Script call for one eval site, with its strictness. */
function hostCall(
  site: HostScriptTraincSite,
  strict: boolean,
  nestedMutant: boolean,
): string {
  const direct = strict && !site.indirect;
  let source = site.source;
  if (site.nested != null) {
    const { call, source: inner } = site.nested;
    if (
      source.indexOf(call) < 0 ||
      source.indexOf(call) !== source.lastIndexOf(call)
    )
      throw new Error(`nested call is not unique: ${call}`);
    // Eval code inherits the outer eval code's strictness.
    let replacement = `$262.evalScript(${JSON.stringify(
      (direct ? strictPrefix : "") + inner,
    )})`;
    if (nestedMutant) replacement = `(${replacement}, "mutant")`;
    source = source.replace(call, replacement);
  }
  return `$262.evalScript(${JSON.stringify(
    (direct ? strictPrefix : "") + source,
  )})`;
}

/** Normal and mutated text selected at run time by `__hsMutant`. */
function siteText(
  site: HostScriptTraincSite,
  strict: boolean,
  index: number,
): string {
  const host = hostCall(site, strict, false);
  let normal: string;
  let mutant: string;
  if (site.expected == null) {
    normal = `__hsEarlyError(() => ${host}, () => (${site.after ?? "true"}))`;
    mutant = `(${site.mutant})`;
  } else {
    normal = `__hsCompletion(${host}, (${site.expected}))`;
    const wrong = `(${host}, ${site.mutant})`;
    mutant = site.consumed
      ? wrong
      : `__hsCompletion(${wrong}, (${site.expected}))`;
  }
  let text = `(__hsMutant === ${index} ? ${mutant} : `;
  if (site.nested != null) {
    // The nested call's completion is consumed by the outer completion.
    const nested = hostCall(site, strict, true);
    text += `__hsMutant === ${index + 1} ? `;
    text += `__hsCompletion(${nested}, (${site.expected})) : `;
  }
  return text + normal + ")";
}

/** Number of mutation indices a case's sites use. */
export function hostScriptTraincMutations(
  subject: HostScriptTraincCase,
): number {
  return subject.sites.reduce(
    (total, site) => total + (site.nested == null ? 1 : 2),
    0,
  );
}

/**
 * Reassemble one original with each eval call replaced at its pinned offset.
 * Text outside the call expressions, including every assertion, is kept.
 */
export function hostScriptTraincProgram(
  subject: HostScriptTraincCase,
  strict: boolean,
): string {
  const original = hostScriptTraincOriginal(subject.path);
  let program = strict ? '"use strict";\n' : "";
  program += hostScriptChecks;
  let offset = original.indexOf("---*/") + "---*/".length;
  let index = 0;
  for (const site of subject.sites) {
    if (!original.startsWith(site.call, site.start) || site.start < offset)
      throw new Error(`${subject.path}: call moved at ${site.start}`);
    program += original.slice(offset, site.start);
    program += siteText(site, strict, index);
    index += site.nested == null ? 1 : 2;
    offset = site.start + site.call.length;
  }
  return program + original.slice(offset);
}

/** Every variant and mutation runs in its own created realm. */
export function hostScriptTraincFixture(
  subjects: readonly HostScriptTraincCase[],
  name: string,
): Fixture {
  const lines: string[] = [];
  for (const [position, subject] of subjects.entries()) {
    for (const variant of subject.variants) {
      const id = `${position}_${variant}`;
      const program = hostScriptTraincProgram(subject, variant === "strict");
      lines.push(
        `for (let mutant = -1; mutant < ${hostScriptTraincMutations(
          subject,
        )}; mutant++) {`,
        "const realm = $262.createRealm();",
        `realm.evalScript(${JSON.stringify(harness)});`,
        "realm.global.__hsMutant = mutant;",
        `let rejected_${id} = false;`,
        "try {",
        `realm.evalScript(${JSON.stringify(program)});`,
        "} catch (error) {",
        "if (mutant < 0 || !(error instanceof realm.global.Test262Error))" +
          " throw error;",
        `rejected_${id} = true;`,
        "}",
        `if (mutant >= 0 && !rejected_${id})` +
          ` throw new Error(${JSON.stringify(
            `mutation survived: ${subject.path} ${variant} `,
          )} + mutant);`,
        "}",
      );
    }
  }
  lines.push(`console.log("${name} ok");`);
  return { name, source: lines.join("\n"), test262Host: true };
}

/** Selector-order groups keep persistent realm roots bounded per process. */
export const hostScriptTraincGroupSize = 6;

/** Native fixtures covering all 98 train C subjects. */
export const hostScriptTraincFixtures: readonly Fixture[] = Array.from(
  {
    length: Math.ceil(hostScriptTraincCases.length / hostScriptTraincGroupSize),
  },
  (_, group) =>
    hostScriptTraincFixture(
      hostScriptTraincCases.slice(
        group * hostScriptTraincGroupSize,
        (group + 1) * hostScriptTraincGroupSize,
      ),
      `residual-trainc-${group}`,
    ),
);

/** Comparator type confusion and wrong early errors must be rejected. */
export const hostScriptTraincOracleFixture: Fixture = {
  name: "residual-trainc-oracle",
  test262Host: true,
  source:
    "const other = $262.createRealm();\n" +
    "$262.evalScript(" +
    JSON.stringify(
      harness +
        "\n" +
        hostScriptChecks +
        `
function rejected(action) {
  let caught = false;
  try { action(); }
  catch (error) {
    if (!(error instanceof Test262Error)) throw error;
    caught = true;
  }
  if (!caught) throw new Error("oracle mutation survived");
}
function syntaxPassed(action) {
  let caught = false;
  try { action(); }
  catch (error) {
    if (Object.getPrototypeOf(error) !== SyntaxError.prototype) throw error;
    caught = true;
  }
  if (!caught) throw new Error("early error dropped");
}
__hsCompletion(1, 1);
__hsCompletion(undefined, undefined);
rejected(function () { __hsCompletion(1, "1"); });
rejected(function () { __hsCompletion("1", 1); });
rejected(function () { __hsCompletion(undefined, "undefined"); });
rejected(function () { __hsCompletion(undefined, null); });
rejected(function () { __hsCompletion(true, 1); });
rejected(function () { __hsCompletion(42, "42"); });
rejected(function () { __hsCompletion("mutant", undefined); });
syntaxPassed(function () {
  __hsEarlyError(function () { throw new SyntaxError("x"); },
    function () { return true; });
});
rejected(function () {
  __hsEarlyError(function () {}, function () { return true; });
});
rejected(function () {
  __hsEarlyError(function () { throw new TypeError("x"); },
    function () { return true; });
});
rejected(function () {
  __hsEarlyError(function () { throw new other.global.SyntaxError("x"); },
    function () { return true; });
});
rejected(function () {
  __hsEarlyError(function () {
    globalThis.__hsLeak = 1;
    throw new SyntaxError("x");
  }, function () { return true; });
});
rejected(function () {
  __hsEarlyError(function () {
    globalThis.eval = 42;
    throw new SyntaxError("x");
  }, function () { return true; });
});
rejected(function () {
  __hsEarlyError(function () { throw new SyntaxError("x"); },
    function () { return false; });
});
`,
    ) +
    ');\nconsole.log("residual-trainc-oracle ok");',
};
