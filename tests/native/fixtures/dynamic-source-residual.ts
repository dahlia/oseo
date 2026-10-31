import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";
import { residualClassCases } from "./residual-class-cases.ts";
import { residualCompletionCases } from "./residual-completion-cases.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

const completionCheck = `function completion(actual, expected) {
          if (actual !== expected || typeof actual !== typeof expected)
            throw new Test262Error("completion value/type");
          return actual;
        }\n`;

const classCheck = `function check(actual, expected) {
        if (actual !== expected || typeof actual !== typeof expected)
          throw new Test262Error("class value/type");
      }\n`;

function strictSource(source: string): string {
  const directive = '"use strict"; void 0;\n';
  if (!source.startsWith("#!")) return directive + source;
  const newline = source.indexOf("\n");
  // With no executable code, retain the exact no-newline hashbang probe.
  // This is partial evidence only; its strict-mode gap remains remediation.
  if (newline < 0) return source;
  return source.slice(0, newline + 1) + directive + source.slice(newline + 1);
}

/** Observe completion before the original assertion consumes its value. */
export const residualCompletionFixtures: readonly Fixture[] =
  residualCompletionCases.map((subject, index) => {
    const lines: string[] = [];
    for (const strict of [false, true]) {
      const sourceParts = subject.parts;
      const expectations = subject.sources.map((source) => {
        if (source.includes("6; continue")) return "6";
        if (source.includes("3;")) {
          return source.includes("of []") ? "undefined" : "3";
        }
        return source.includes("1;") || source.endsWith("\n1")
          ? source.includes("for (")
            ? "undefined"
            : "1"
          : "undefined";
      });
      for (let mutation = -1; mutation < subject.sources.length; mutation++) {
        let program = strict ? '"use strict";\n' : "";
        program += completionCheck;
        for (const [site, part] of sourceParts.entries()) {
          program += part;
          let source = subject.sources[site];
          if (source == null) continue;
          if (strict && !subject.indirect) source = strictSource(source);
          const call =
            "$262.createRealm().evalScript(" + JSON.stringify(source) + ")";
          const actual = site === mutation ? `(${call}, "wrong")` : call;
          program += `completion(${actual}, ${expectations[site]})`;
        }
        const id = `${strict ? "s" : "n"}_${mutation + 1}`;
        const realm = `r_${id}`;
        lines.push(
          `const ${realm} = $262.createRealm();`,
          `${realm}.evalScript(${JSON.stringify(harness)});`,
        );
        const invoke = `${realm}.evalScript(${JSON.stringify(program)});`;
        if (mutation < 0) lines.push(invoke);
        else {
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
      }
    }
    lines.push(`console.log("residual-completion-${index} ok");`);
    return {
      name: `residual-completion-${index}`,
      source: lines.join("\n"),
      test262Host: true,
    };
  });

/** Static replacements retain every ordinary class assertion. */
export const residualClassFixtures: readonly Fixture[] = residualClassCases.map(
  (subject, index) => {
    const lines: string[] = [];
    for (const [variant, body] of [
      subject.source,
      ...subject.mutations,
    ].entries()) {
      const realm = `class_${variant}`;
      const program = classCheck + body.replaceAll("assert.sameValue", "check");
      lines.push(
        `const ${realm} = $262.createRealm();`,
        `${realm}.evalScript(${JSON.stringify(harness)});`,
      );
      const invoke = `${realm}.evalScript(${JSON.stringify(program)});`;
      if (variant === 0) lines.push(invoke);
      else
        lines.push(
          `let rejected_${variant} = false;`,
          "try {",
          invoke,
          "} catch (error) {",
          `if (!(error instanceof ${realm}.global.Test262Error))` +
            " throw error;",
          `rejected_${variant} = true;`,
          "}",
          `if (!rejected_${variant}) throw new Error("mutation survived");`,
        );
    }
    lines.push(`console.log("residual-class-${index} ok");`);
    return {
      name: `residual-class-${index}`,
      source: lines.join("\n"),
      test262Host: true,
    };
  },
);

/** Type-confusion mutants have identical printed values to their oracles. */
export const residualValueOracleFixture: Fixture = {
  name: "residual-value-oracle",
  test262Host: true,
  source:
    "$262.evalScript(" +
    JSON.stringify(
      harness +
        "\n" +
        completionCheck +
        classCheck +
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
completion(1, 1);
check("Test262", "Test262");
rejected(function () { completion(1, "1"); });
rejected(function () { completion("1", 1); });
rejected(function () { completion(undefined, "undefined"); });
rejected(function () { completion(42, "42"); });
rejected(function () { check(1, "1"); });
rejected(function () { check(undefined, "undefined"); });
rejected(function () { check(42, "42"); });
rejected(function () { check(true, "true"); });
rejected(function () {
  check("Test262", {toString() { return "Test262"; }});
});
`,
    ) +
    ');\nconsole.log("residual-value-oracle ok");',
};
