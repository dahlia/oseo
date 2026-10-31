/* eslint-disable no-useless-concat -- Preserve pinned source text. */
// Derived from Test262; BSD license in completion-record-cases.LICENSE.
import type { CompletionRecordCase } from "./completion-record-cases.ts";

/** Eleven pinned completion subjects with original assertions. */
export const residualCompletionCases: readonly CompletionRecordCase[] = [
  {
    path: "test/language/comments/hashbang/eval-indirec" + "t.js",
    strict: true,
    indirect: true,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 1)\nassert.sameValue(",
      ", undefined);",
    ],
    sources: ["#!\n", "#!\n1", "#!2\n"],
  },
  {
    path: "test/language/comments/hashbang/eval.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 1)\nassert.sameValue(",
      ", undefined);",
    ],
    sources: ["#!\n", "#!\n1", "#!2\n"],
  },
  {
    path: "test/language/comments/hashbang/no-line-sepa" + "rator.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["#!"],
  },
  {
    path: "test/language/statements/async-function/cptn" + "-decl.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 1);"],
    sources: ["async function f() {}", "1; async function f() {}"],
  },
  {
    path: "test/language/statements/class/cptn-decl.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 1);"],
    sources: ["class C {}", "1; class C {}"],
  },
  {
    path: "test/language/statements/for-of/cptn-decl-ab" + "rupt-empty.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 3);\n\nassert.sameValue(\n  ",
      ",\n  undefined\n);\nassert.sameValue(\n  ",
      ",\n  6\n);",
    ],
    sources: [
      "1; for (var a of [0]) { break; }",
      "2; for (var b of [0]) { 3; break; }",
      "4; outer: do { for (var a of [0]) { continue" +
        " outer; } } while (false)",
      "5; outer: do { for (var b of [0]) { 6; conti" +
        "nue outer; } } while (false)",
    ],
  },
  {
    path: "test/language/statements/for-of/cptn-decl-it" + "r.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 3);"],
    sources: ["1; for (var a of [0]) { }", "2; for (var b of [0]) { 3; }"],
  },
  {
    path: "test/language/statements/for-of/cptn-decl-no" + "-itr.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);",
    ],
    sources: ["1; for (var a of []) { }", "2; for (var b of []) { 3; }"],
  },
  {
    path: "test/language/statements/for-of/cptn-expr-ab" + "rupt-empty.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 3);\n\nassert.sameValue(\n  ",
      ",\n  undefined\n);\nassert.sameValue(\n  ",
      ",\n  6\n);",
    ],
    sources: [
      "var a; 1; for (a of [0]) { break; }",
      "var b; 2; for (b of [0]) { 3; break; }",
      "var a; 4; outer: do { for (a of [0]) { conti" +
        "nue outer; } } while (false)",
      "var b; 5; outer: do { for (b of [0]) { 6; co" +
        "ntinue outer; } } while (false)",
    ],
  },
  {
    path: "test/language/statements/for-of/cptn-expr-it" + "r.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 3);"],
    sources: [
      "var a; 1; for (a of [0]) { }",
      "var b; 2; for (b of [0]) { 3; }",
    ],
  },
  {
    path: "test/language/statements/for-of/cptn-expr-no" + "-itr.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);",
    ],
    sources: ["var a; 1; for (a of []) { }", "var b; 2; for (b of []) { 3; }"],
  },
];
