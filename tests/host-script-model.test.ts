/* eslint-disable no-await-in-loop -- Reference realms are isolated. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNodeHost } from "../packages/host/src/index.ts";
import { assertMatchingObservations } from "../packages/testkit/src/index.ts";
import { hostScriptModel } from "./native/host-script-model.ts";
import type { ScriptCommand } from "./native/host-script-model.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

interface Control {
  readonly name: string;
  readonly scripts: readonly string[];
  readonly operations: readonly (readonly [ScriptCommand["kind"], number])[];
  readonly normative: string;
  readonly deno?: string;
}

const controls: readonly Control[] = [
  {
    name: "configurable var then lexical redeclaration",
    scripts: ["a = 1;", "var a = 2;", "a;", "let a = 3;", "a;"],
    operations: [
      ["write", 1],
      ["var", 2],
      ["read", 0],
      ["let", 3],
      ["read", 0],
    ],
    normative: "1\nundefined\n2\nundefined\n3\nxy\n",
    deno: "1\nundefined\n2\nerror:SyntaxError\n2\nxy\n",
  },
  {
    name: "delete configurable var before lexical redeclaration",
    scripts: ["a = 1;", "var a = 2;", "delete a;", "a;", "let a = 3;", "a;"],
    operations: [
      ["write", 1],
      ["var", 2],
      ["delete", 0],
      ["read", 0],
      ["let", 3],
      ["read", 0],
    ],
    normative: "1\nundefined\ntrue\nerror:ReferenceError\nundefined\n3\nxy\n",
    deno: "1\nundefined\nfalse\n2\nerror:SyntaxError\n2\nxy\n",
  },
  {
    name: "delete configurable property before var declaration",
    scripts: [
      "a = 1;",
      "delete a;",
      "var a = 2;",
      "delete a;",
      "let a = 3;",
      "a;",
    ],
    operations: [
      ["write", 1],
      ["delete", 0],
      ["var", 2],
      ["delete", 0],
      ["let", 3],
      ["read", 0],
    ],
    normative: "1\ntrue\nundefined\nfalse\nerror:SyntaxError\n2\nxy\n",
  },
  {
    name: "function declaration replaces configurable property",
    scripts: [
      "a = 1;",
      "function a() { return 2; }",
      "delete a;",
      "let a = 3;",
      "a;",
    ],
    operations: [
      ["write", 1],
      ["function", 2],
      ["delete", 0],
      ["let", 3],
      ["read", 0],
    ],
    normative: "1\nundefined\nfalse\nerror:SyntaxError\nfunction:2\nxy\n",
  },
  {
    name: "function after configurable var redeclaration",
    scripts: [
      "a = 1;",
      "var a = 2;",
      "function a() { return 3; }",
      "delete a;",
      "let a = 4;",
      "a;",
    ],
    operations: [
      ["write", 1],
      ["var", 2],
      ["function", 3],
      ["delete", 0],
      ["let", 4],
      ["read", 0],
    ],
    normative:
      "1\nundefined\nundefined\nfalse\nerror:SyntaxError\nfunction:3\nxy\n",
  },
  {
    name: "var redeclaration preserves function property restrictions",
    scripts: [
      "function a() { return 2; }",
      "var a = 3;",
      "delete a;",
      "let a = 4;",
      "a;",
    ],
    operations: [
      ["function", 2],
      ["var", 3],
      ["delete", 0],
      ["let", 4],
      ["read", 0],
    ],
    normative: "undefined\nundefined\nfalse\nerror:SyntaxError\n3\nxy\n",
  },
];

const host = createNodeHost();

for (const realm of [0, 1] as const) {
  for (const control of controls) {
    test(`Script observer model: realm ${realm}, ${control.name}`, async () => {
      const commands = control.operations.map(([kind, value]) => ({
        kind,
        value,
        name: "a" as const,
        realm,
      }));
      assert.equal(hostScriptModel(commands), control.normative);
      assert.equal(
        hostScriptModel(commands, true),
        control.deno ?? control.normative,
      );
      const source = `
const other = $262.createRealm();
const target = ${realm === 0 ? "$262" : "other"};
for (const source of ${JSON.stringify(control.scripts)}) {
  try {
    const value = target.evalScript(source);
    console.log(typeof value === "function" ? "function:" + value() : value);
  } catch (error) { console.log("error:" + error.name); }
}
console.log("xy");
`;
      const references = await hostScriptReferences(host, source);
      assertMatchingObservations([
        { stdout: control.normative, stderr: "", exitStatus: 0 },
        references[0]!,
      ]);
      assertMatchingObservations([
        {
          stdout: control.deno ?? control.normative,
          stderr: "",
          exitStatus: 0,
        },
        references[1]!,
      ]);
    });
  }
}

test("Script observer var names stay local to their realm", async () => {
  const commands: readonly ScriptCommand[] = [
    { kind: "write", name: "a", value: 1, realm: 0 },
    { kind: "var", name: "a", value: 2, realm: 0 },
    { kind: "let", name: "a", value: 3, realm: 1 },
    { kind: "read", name: "a", value: 0, realm: 1 },
    { kind: "let", name: "a", value: 4, realm: 0 },
    { kind: "read", name: "a", value: 0, realm: 0 },
  ];
  assert.equal(
    hostScriptModel(commands),
    "1\nundefined\nundefined\n3\nundefined\n4\nxy\n",
  );
  assert.equal(
    hostScriptModel(commands, true),
    "1\nundefined\nundefined\n3\nerror:SyntaxError\n2\nxy\n",
  );
  const references = await hostScriptReferences(
    host,
    `
const other = $262.createRealm();
console.log($262.evalScript("a = 1;"));
console.log($262.evalScript("var a = 2;"));
console.log(other.evalScript("let a = 3;"));
console.log(other.evalScript("a;"));
try { console.log($262.evalScript("let a = 4;")); }
catch (error) { console.log("error:" + error.name); }
console.log($262.evalScript("a;"));
console.log("xy");
`,
  );
  assertMatchingObservations([
    {
      stdout: "1\nundefined\nundefined\n3\nundefined\n4\nxy\n",
      stderr: "",
      exitStatus: 0,
    },
    references[0]!,
  ]);
  assertMatchingObservations([
    {
      stdout: "1\nundefined\nundefined\n3\nerror:SyntaxError\n2\nxy\n",
      stderr: "",
      exitStatus: 0,
    },
    references[1]!,
  ]);
});
