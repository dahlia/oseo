/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";
import {
  completionRecordCases,
  type CompletionRecordCase,
} from "./completion-record-cases.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

/** Reassemble fixed source with literal, finite AOT host Script calls. */
export function completionRecordProgram(
  subject: CompletionRecordCase,
  strict: boolean,
  mutation = false,
): string {
  let source = strict ? '"use strict";\n' : "";
  for (const [index, part] of subject.parts.entries()) {
    source += part;
    const original = subject.sources[index];
    if (original == null) continue;
    let inner = strict && !subject.indirect ? '"use strict"; void 0;\n' : "";
    inner += original;
    const throwing = subject.path.endsWith("cptn-thrw-prim.js");
    if (mutation && throwing) inner = inner.replace("throw 1", "throw 0");
    const call = `$262.evalScript(${JSON.stringify(inner)})`;
    const truthy =
      subject.path.includes("/Boolean/") ||
      subject.path.includes("/logical-not/");
    const forIn = subject.path.includes("S12.6.4_");
    const wrong =
      subject.path.includes("arrow-function-") &&
      !subject.path.includes("boolean-literal")
        ? "function () { return 0; }"
        : truthy
          ? "1"
          : forIn
            ? JSON.stringify("mutation")
            : "0";
    let observed = mutation && !throwing ? `(${call}, ${wrong})` : call;
    if (original === "var x") {
      // Conversions alone would also accept some incorrect completion types.
      observed =
        "(function (value) {" +
        " if (value !== undefined)" +
        ' throw new Test262Error("declaration completion type");' +
        " return value; }) (" +
        observed +
        ")";
    }
    source += observed;
  }
  return source;
}

/** Positive and mutation observations use separate global Script realms. */
export function completionRecordFixture(
  subjects: readonly CompletionRecordCase[],
  group: number,
): Fixture {
  const lines: string[] = [];
  for (const [index, subject] of subjects.entries()) {
    for (const strict of subject.strict ? [false, true] : [false]) {
      const id = `${index}_${strict ? "strict" : "sloppy"}`;
      const realm = `realm_${id}`;
      const mutant = `mutant_${id}`;
      lines.push(
        `const ${realm} = $262.createRealm();`,
        `${realm}.evalScript(${JSON.stringify(harness)});`,
        `${realm}.evalScript(${JSON.stringify(
          completionRecordProgram(subject, strict),
        )});`,
        `const ${mutant} = $262.createRealm();`,
        `${mutant}.evalScript(${JSON.stringify(harness)});`,
        `let rejected_${id} = false;`,
        "try {",
        `${mutant}.evalScript(${JSON.stringify(
          completionRecordProgram(subject, strict, true),
        )});`,
        "} catch (error) {",
        `if (!(error instanceof ${mutant}.global.Test262Error)) throw error;`,
        `rejected_${id} = true;`,
        "}",
        `if (!rejected_${id}) throw new Error("mutation survived");`,
        `console.log(${JSON.stringify(subject.path + " " + id)});`,
      );
    }
  }
  return {
    name: `completion-records-${group}`,
    source: lines.join("\n"),
    test262Host: true,
  };
}

/** One original per process bounds persistent realm roots under forced GC. */
export const completionRecordFixtures: readonly Fixture[] =
  completionRecordCases.map((subject, index) =>
    completionRecordFixture([subject], index),
  );

/** Explicit type-confusion mutations exercise the shared upstream oracle. */
export const completionRecordOracleFixture: Fixture = {
  name: "completion-records-oracle",
  test262Host: true,
  source: `
const oracleRealm = $262.createRealm();
oracleRealm.evalScript(${JSON.stringify(harness)});
oracleRealm.evalScript(${JSON.stringify(`
function checkCompletion(actual, expected, wrongType) {
  assert.sameValue(actual, expected);
  assert.sameValue(typeof actual, typeof expected);
  var rejected = false;
  try { assert.sameValue(wrongType, expected); }
  catch (error) {
    if (!(error instanceof Test262Error)) throw error;
    rejected = true;
  }
  if (!rejected) throw new Test262Error("type confusion survived");
}
checkCompletion($262.evalScript("1;"), 1, "1");
checkCompletion($262.evalScript("42;"), 42, "42");
checkCompletion($262.evalScript("var empty;"), undefined, "undefined");
checkCompletion($262.evalScript('"1";'), "1", 1);
checkCompletion($262.evalScript('"42";'), "42", 42);
`)});
console.log("strict-completion-oracle");
`,
};
