import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printHir, printMir } from "@oseo/compiler";
import type { MirOperation, MirProgram } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

const specializations = ["disabled", "enabled"] as const;

function compiled(source: string, sourceId: string): MirProgram {
  const result = compileSource(babelFrontend, { source, sourceId });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  return result.mir;
}

function operationsOf(program: MirProgram): readonly MirOperation[] {
  return [program.script, ...program.functions].flatMap((item) =>
    item.blocks.flatMap((block) => block.operations),
  );
}

test("converts every admitted for-in head to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let assigned; const target = {}; const key = 'value';\n" +
      "for (const item in {}) console.log(item);\n" +
      "for (let item in {}) console.log(item);\n" +
      "for (var item in {}) console.log(item);\n" +
      "for (assigned in {}) console.log(assigned);\n" +
      "for (target.value in {}) {}\n" +
      "for (target[key] in {}) {}\n",
    sourceId: "for-in-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /for \(const %b\d+ item in object\{\}\)/u);
  assert.match(hir, /for \(let %b\d+ item in object\{\}\)/u);
  assert.match(hir, /for \(var %b\d+ item in object\{\}\)/u);
  assert.match(hir, /for \(%b\d+ assigned in object\{\}\)/u);
  assert.match(hir, /for \(%b\d+\(target\)\["value"\] in object\{\}\)/u);
  assert.match(hir, /for \(%b\d+\(target\)\[%b\d+\(key\)\] in object\{\}\)/u);
});

test("admits a private and a super for-in head target", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class A {}\n" +
      "class B extends A {\n" +
      "  #slot;\n" +
      "  m(source) {\n" +
      "    for (this.#slot in source) {}\n" +
      "    for (super.stored in source) {}\n" +
      "    for (super[this.#slot] in source) {}\n" +
      "  }\n" +
      "}\n",
    sourceId: "for-in-class-targets.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const operations = operationsOf(result.mir);
  const privateWrites = operations.filter(
    (operation) => operation.detail === "for-in private target",
  );
  const superStores = operations.filter(
    (operation) =>
      operation.kind === "property-set" &&
      operation.detail === "for-in property target" &&
      operation.superReference === true,
  );
  assert.equal(privateWrites.length, 1);
  assert.equal(superStores.length, 2);
  for (const store of superStores) assert.equal(store.arguments.length, 4);
});

test("lowers a for-in head to its own acquisition and step", () => {
  // ForIn/OfHeadEvaluation acquires the enumeration once, before the
  // loop, and ForIn/OfBodyEvaluation steps it once per iteration. Neither
  // reads a `next` method and neither is ever closed, so no iterator
  // operation may appear in the lowered program.
  for (const specialization of specializations) {
    const result = compileSource(
      babelFrontend,
      {
        source: "for (const key in { a: 1 }) console.log(key);\n",
        sourceId: "for-in-shape.ts",
      },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const text = printMir(result.mir);
    assert.match(text, /enumerate-get EnumerateObjectProperties/u);
    assert.match(text, /enumerate-next enumeration step/u);
    assert.doesNotMatch(text, /iterator-get/u);
    assert.doesNotMatch(text, /iterator-next/u);
    assert.doesNotMatch(text, /iterator-close/u);
    const operations = operationsOf(result.mir);
    assert.equal(
      operations.filter((operation) => operation.kind === "enumerate-get")
        .length,
      1,
    );
    assert.equal(
      operations.filter((operation) => operation.kind === "enumerate-next")
        .length,
      1,
    );
  }
});

test("creates a lexical for-in head binding before its subject runs", () => {
  // ForIn/OfHeadEvaluation creates the head environment before the
  // subject expression, and ForIn/OfBodyEvaluation creates a fresh one
  // per iteration, so a `let` or `const` head resets twice while a `var`
  // head has no cell of its own to reset.
  const lexical = compiled(
    "for (const key in { a: 1 }) {}\n",
    "for-in-lexical.ts",
  );
  const lexicalResets = operationsOf(lexical).filter(
    (operation) => operation.kind === "binding-reset",
  );
  assert.equal(lexicalResets.length, 2);
  const kinds = operationsOf(lexical).map((operation) => operation.kind);
  assert.ok(
    kinds.indexOf("binding-reset") < kinds.indexOf("enumerate-get"),
    "head environment precedes the subject",
  );
  const varHead = compiled(
    "var key; for (key in { a: 1 }) {}\n",
    "for-in-var.ts",
  );
  assert.equal(
    operationsOf(varHead).filter(
      (operation) => operation.kind === "binding-reset",
    ).length,
    0,
  );
});

test("orders a super for-in head's reference after each step", () => {
  // The enumerated key exists before the head reference runs, so the
  // receiver read, the key expression, GetSuperBase, and ToPropertyKey
  // all follow the step that produced it.
  const source =
    "class A {}\n" +
    "class B extends A {\n" +
    "  m(k, source) {\n" +
    "    for (super[k()] in source) {}\n" +
    "  }\n" +
    "}\n";
  for (const specialization of specializations) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "for-in-super-order.ts" },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const method = result.mir.functions.find((item) =>
      item.blocks.some((block) =>
        block.operations.some(
          (operation) => operation.detail === "for-in property target",
        ),
      ),
    );
    assert.ok(method != null);
    const operations = method.blocks.flatMap((block) => block.operations);
    const kinds = operations.map((operation) => operation.kind);
    const stepIndex = kinds.indexOf("enumerate-next");
    const receiverIndex = kinds.indexOf("receiver");
    const keyIndex = kinds.indexOf("call");
    const baseIndex = kinds.indexOf("super-base");
    const convertIndex = kinds.indexOf("property-key");
    const storeIndex = operations.findIndex(
      (operation) =>
        operation.kind === "property-set" &&
        operation.detail === "for-in property target",
    );
    assert.ok(stepIndex >= 0, "enumeration step");
    assert.ok(receiverIndex > stepIndex, "receiver read after the step");
    assert.ok(keyIndex > receiverIndex, "key expression after receiver");
    assert.ok(baseIndex > keyIndex, "GetSuperBase after the key expression");
    assert.ok(convertIndex > baseIndex, "ToPropertyKey after the reference");
    assert.ok(storeIndex > convertIndex, "store last");
    assert.equal(operations[storeIndex]?.superReference, true);
  }
});

test("binds a label to the for-in statement's own transfers", () => {
  const result = compileSource(babelFrontend, {
    source:
      "outer: for (const key in { a: 1 }) {\n" +
      "  for (const inner in { b: 1 }) {\n" +
      "    if (inner === 'b') continue outer;\n" +
      "    break outer;\n" +
      "  }\n" +
      "}\n",
    sourceId: "for-in-labels.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const text = printMir(result.mir);
  assert.match(text, /join for-in bb/u);
  assert.doesNotMatch(text, /iterator-close/u);
});

test("keeps every for-in head this unit does not admit rejected", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    ["for (const [a] in {}) {}", /for-in array pattern target is unsupported/u],
    [
      "let a; for ([a] in {}) {}",
      /for-in array pattern target is unsupported/u,
    ],
    [
      "for (var a = 1 in {}) {}",
      /for-in declaration needs one uninitialized binding/u,
    ],
    ["for (missing in {}) {}", /Unknown binding 'missing'/u],
    [
      "function outer() {\n" +
        "  with ({}) {\n" +
        "    (function () { 'use strict'; for (fresh in {}) {} })();\n" +
        "  }\n" +
        "}\n",
      /Assigning with fallback binding 'fresh' in strict code/u,
    ],
  ];
  for (const [source, message] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "for-in-boundary.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
  }
});

test("records a for-in with fallback target as an initializing name", () => {
  // Unit 8.5i folds `typeof` of an unresolvable name to "undefined". A
  // non-strict for-in head target reaches PutValue on an all-miss chain,
  // which ECMA-262 models as creating a global binding, so the fold must
  // stay rejected for that name.
  const result = compileSource(babelFrontend, {
    source:
      "function scope() {\n" +
      "  with ({}) { for (fresh in { a: 1 }) {} }\n" +
      "}\n" +
      "scope();\n" +
      "console.log(typeof fresh);\n",
    sourceId: "for-in-with-fallback.ts",
  });
  assert.equal(result.mir, undefined);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /typeof with fallback binding 'fresh'/u,
  );
});

test("converts every admitted object pattern for-in head to syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let bound; const holder = {}; const name = 'length';\n" +
      "for (const { length: item } in {}) console.log(item);\n" +
      "for (let { length: item } in {}) console.log(item);\n" +
      "for (var { length: item } in {}) console.log(item);\n" +
      "for ({ length: bound } in {}) console.log(bound);\n" +
      "for ({ [name]: holder.slot } in {}) {}\n" +
      "for (const { 0: first = 'D', ...rest } in {}) console.log(first);\n" +
      "for (const { 0: { length: nested } } in {}) console.log(nested);\n",
    sourceId: "for-in-object-pattern-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /for \(const \{"length": %b\d+ item\} in object\{\}\)/u);
  assert.match(hir, /for \(let \{"length": %b\d+ item\} in object\{\}\)/u);
  assert.match(hir, /for \(var \{"length": %b\d+ item\} in object\{\}\)/u);
  assert.match(hir, /for \(\{"length": %b\d+ bound\} in object\{\}\)/u);
  assert.match(
    hir,
    /for \(\{%b\d+\(name\): target %b\d+\(holder\)\["slot"\]\} in/u,
  );
  assert.match(hir, /\.\.\.%b\d+ rest\} in object\{\}\)/u);
  assert.match(hir, /\{"0": \{"length": %b\d+ nested\}\} in object\{\}\)/u);
});

test("lowers an object pattern for-in head with no iterator operation", () => {
  // The head's own destructuring reads properties of the enumerated key
  // string; nothing in it acquires or closes an iterator, and neither
  // specialization policy changes the two owned enumeration operations.
  for (const specialization of specializations) {
    const result = compileSource(
      babelFrontend,
      {
        source:
          "const holder = {};\n" +
          "for (const { length: size, 0: head, ...rest } in { a: 1 }) {\n" +
          "  holder.seen = size + head;\n" +
          "}\n",
        sourceId: "for-in-object-pattern-shape.ts",
      },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const text = printMir(result.mir);
    assert.match(text, /enumerate-get EnumerateObjectProperties/u);
    assert.match(text, /enumerate-next enumeration step/u);
    assert.match(text, /object-coercible RequireObjectCoercible/u);
    assert.match(text, /object-rest CopyDataProperties for object binding/u);
    assert.doesNotMatch(text, /iterator-get/u);
    assert.doesNotMatch(text, /iterator-next/u);
    assert.doesNotMatch(text, /iterator-close/u);
    const operations = operationsOf(result.mir);
    assert.equal(
      operations.filter((operation) => operation.kind === "enumerate-get")
        .length,
      1,
    );
    assert.equal(
      operations.filter((operation) => operation.kind === "enumerate-next")
        .length,
      1,
    );
  }
});

test("orders an object pattern for-in head after each step", () => {
  // ForIn/OfBodyEvaluation supplies the key before the head pattern runs,
  // so RequireObjectCoercible of that key, each property name, each
  // target reference, and the GetV that follows it all come after the
  // step. An AssignmentProperty evaluates its name first, then its
  // target, then the value it stores.
  const source =
    "class A {}\n" +
    "class B extends A {\n" +
    "  m(k, source) {\n" +
    "    for ({ [k()]: super.stored = 1 } in source) {}\n" +
    "  }\n" +
    "}\n";
  for (const specialization of specializations) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "for-in-object-pattern-order.ts" },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const method = result.mir.functions.find((item) =>
      item.blocks.some((block) =>
        block.operations.some(
          (operation) => operation.detail === "destructuring member target",
        ),
      ),
    );
    assert.ok(method != null);
    const operations = method.blocks.flatMap((block) => block.operations);
    const kinds = operations.map((operation) => operation.kind);
    const stepIndex = kinds.indexOf("enumerate-next");
    const coercibleIndex = kinds.indexOf("object-coercible");
    const keyIndex = kinds.indexOf("call");
    const receiverIndex = kinds.indexOf("receiver");
    const baseIndex = kinds.indexOf("super-base");
    const readIndex = operations.findIndex(
      (operation) => operation.detail === "GetV for object binding",
    );
    const storeIndex = operations.findIndex(
      (operation) => operation.detail === "destructuring member target",
    );
    assert.ok(stepIndex >= 0, "enumeration step");
    assert.ok(coercibleIndex > stepIndex, "ToObject of the key after the step");
    assert.ok(keyIndex > coercibleIndex, "property name after the key object");
    assert.ok(receiverIndex > keyIndex, "target reference after its name");
    assert.ok(baseIndex > receiverIndex, "GetSuperBase after the receiver");
    assert.ok(readIndex > baseIndex, "GetV after the target reference");
    assert.ok(storeIndex > readIndex, "store last");
    assert.equal(operations[storeIndex]?.superReference, true);
  }
});

test("admits a private and a member leaf in an object pattern head", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class A {}\n" +
      "class B extends A {\n" +
      "  #slot;\n" +
      "  m(source) {\n" +
      "    for ({ 0: this.#slot, length: super.size } in source) {}\n" +
      "  }\n" +
      "}\n",
    sourceId: "for-in-object-pattern-class-leaves.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const operations = operationsOf(result.mir);
  assert.equal(
    operations.filter(
      (operation) => operation.detail === "destructuring private target",
    ).length,
    1,
  );
  const superStores = operations.filter(
    (operation) =>
      operation.kind === "property-set" &&
      operation.detail === "destructuring member target" &&
      operation.superReference === true,
  );
  assert.equal(superStores.length, 1);
  assert.equal(superStores[0]?.arguments.length, 4);
});

test("creates each lexical object pattern binding before the subject", () => {
  // ForIn/OfHeadEvaluation creates the head environment before the
  // subject expression, and ForIn/OfBodyEvaluation creates a fresh one
  // per iteration, so each lexical leaf resets twice while a `var` head
  // writes hoisted cells and resets none.
  const lexical = compiled(
    "for (const { 0: head, length: size } in { a: 1 }) {}\n",
    "for-in-object-pattern-lexical.ts",
  );
  const lexicalOperations = operationsOf(lexical);
  assert.equal(
    lexicalOperations.filter((operation) => operation.kind === "binding-reset")
      .length,
    4,
  );
  const kinds = lexicalOperations.map((operation) => operation.kind);
  assert.ok(
    kinds.indexOf("binding-reset") < kinds.indexOf("enumerate-get"),
    "head environment precedes the subject",
  );
  const varHead = compiled(
    "for (var { 0: head } in { a: 1 }) {}\n",
    "for-in-object-pattern-var.ts",
  );
  assert.equal(
    operationsOf(varHead).filter(
      (operation) => operation.kind === "binding-reset",
    ).length,
    0,
  );
});

test("reports the head temporal dead zone of an object pattern head", () => {
  const result = compileSource(babelFrontend, {
    source: "for (const { 0: head } in { [head]: 1 }) {}\n",
    sourceId: "for-in-object-pattern-tdz.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const operations = operationsOf(result.mir);
  const kinds = operations.map((operation) => operation.kind);
  const resetIndex = kinds.indexOf("binding-reset");
  const readIndex = kinds.indexOf("read");
  assert.ok(resetIndex >= 0 && readIndex > resetIndex, "cell before the read");
  assert.ok(readIndex < kinds.indexOf("enumerate-get"), "read in the subject");
  // The subject's computed key reads the head's own uninitialized cell,
  // not an outer binding of the same name.
  assert.equal(
    operations[readIndex]?.bindingId,
    operations[resetIndex]?.bindingId,
  );
});

test("keeps every for-in array pattern position rejected", () => {
  // The head always supplies a String key and this realm creates no
  // string iterator, so every array pattern a for-in head could reach
  // takes one boundary rather than answering with a TypeError where
  // ECMA-262 destructures code units.
  const cases: readonly string[] = [
    "for (const [a] in {}) {}",
    "let a; for ([a] in {}) {}",
    "for (const { 0: [a] } in {}) {}",
    "let a; for ({ 0: [a] } in {}) {}",
    "for (const { 0: [a] = 1 } in {}) {}",
    "for (const { 0: { 1: [a] } } in {}) {}",
    "let a; for ({ 0: { 1: [a] } } in {}) {}",
  ];
  for (const source of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "for-in-array-pattern.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /for-in array pattern target is unsupported/u,
      source,
    );
  }
  // A reserved word used as a binding name is an early error rather than
  // a profile boundary, so it is reported wherever it appears in the
  // head, including beside a rejected array pattern.
  const early: readonly string[] = [
    "for (const { a: this } in {}) {}",
    "for (const { a: this, b: [x] } in {}) {}",
    "for (let { b: [x], a: this } in {}) {}",
  ];
  for (const source of early) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "for-in-head-reserved-word.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /reserved word this cannot be a binding name/u,
      source,
    );
  }
});

test("records an object pattern fallback leaf as an initializing name", () => {
  // A non-strict pattern leaf that resolves through `with` reaches
  // PutValue on an all-miss chain exactly as a direct head target does,
  // so the Unit 8.5i `typeof` fold stays rejected for that name and a
  // strict fallback write keeps its own rejection.
  const nonStrict = compileSource(babelFrontend, {
    source:
      "function scope() {\n" +
      "  with ({}) { for ({ length: fresh } in { a: 1 }) {} }\n" +
      "}\n" +
      "scope();\n" +
      "console.log(typeof fresh);\n",
    sourceId: "for-in-object-pattern-fallback.ts",
  });
  assert.equal(nonStrict.mir, undefined);
  assert.match(
    nonStrict.diagnostics[0]?.message ?? "",
    /typeof with fallback binding 'fresh'/u,
  );
  const strict = compileSource(babelFrontend, {
    source:
      "function outer() {\n" +
      "  with ({}) {\n" +
      "    (function () {\n" +
      "      'use strict';\n" +
      "      for ({ length: fresh } in {}) {}\n" +
      "    })();\n" +
      "  }\n" +
      "}\n",
    sourceId: "for-in-object-pattern-strict-fallback.ts",
  });
  assert.equal(strict.mir, undefined);
  assert.match(
    strict.diagnostics[0]?.message ?? "",
    /Assigning with fallback binding 'fresh' in strict code/u,
  );
});
