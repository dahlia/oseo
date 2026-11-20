/* eslint-disable no-useless-concat -- Preserve pinned source text. */
// Copyright (C) 2016 the V8 project authors. All rights reserved.
// Copyright (C) 2017 Apple Inc. All rights reserved.
// Copyright (C) 2019 Leo Balter. All rights reserved.
// The Test262 portions follow the BSD license in
// ../../test262/harness/LICENSE.

/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This notice covers Oseo-authored code. Material derived from
 * Test262 retains its BSD license.
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
