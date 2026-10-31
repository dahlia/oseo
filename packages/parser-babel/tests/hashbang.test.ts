import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSource,
  printHir,
  printMir,
  type Diagnostic,
} from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

/**
 * The four ECMA-262 2025 LineTerminator code points (12.3) and the CRLF
 * pair. A HashbangComment (12.5) is `#!` followed by SingleLineCommentChars,
 * so each of these ends the comment and an end of input ends it too.
 */
const lineTerminators = [
  ["LF", "\n"],
  ["CR", "\r"],
  ["CRLF", "\r\n"],
  ["LS", " "],
  ["PS", " "],
] as const;

/**
 * Comment bodies that would mean something outside a single-line comment:
 * a directive, an unterminated block comment, a second hashbang, and
 * non-ASCII text. None may change the goal symbol's strictness or extend
 * the comment past its line terminator.
 */
const bodies = [
  "",
  " /usr/bin/env node",
  '"use strict"',
  "'use strict';",
  "/* unterminated",
  "*/",
  "#!",
  "\\u000A",
  "é\u{1f600}",
] as const;

/**
 * Text that ECMA-262 2025 permits before no hashbang. The lexical goal
 * InputElementHashbangOrRegExp applies only at the start of a Script or
 * Module, so any
 * preceding WhiteSpace (including U+FEFF), LineTerminator, comment,
 * directive, statement, or hashbang leaves `#!` as an invalid token.
 */
const prefixes = [
  " ",
  "\t",
  "\v",
  "\f",
  " ",
  "﻿",
  "\n",
  "\r\n",
  " ",
  ";",
  "//c\n",
  "/*c*/",
  "/*\n*/",
  '"use strict";',
  '"use strict"\n',
  "#!\n",
] as const;

/**
 * Escaped spellings of `#` or `!`. A hashbang is matched on source code
 * points, and neither `#` nor `!` begins an IdentifierName, so every
 * spelling is an early SyntaxError rather than a comment.
 */
const escapes = [
  "\\u0023!",
  "\\u{23}!",
  "\\x23!",
  "\\043!",
  "#\\u0021",
  "#\\u{21}",
  "#\\x21",
  "#\\041",
  "\\u0023\\u0021",
] as const;

/** Source text placing `#!` inside a Script or Module, not at its start. */
const nestedPlacements = [
  ["function body", "function f() {", "\n}\n"],
  ["block", "{\n  ", "\n}\n"],
  ["after a statement", "1;\n", "\n"],
  ["class body", "class C {\n  ", "\n}\n"],
  ["expression", "let x = ", "\n"],
] as const;

type Goal = "module" | "script";

const goals: readonly Goal[] = ["script", "module"];

interface ParseOutcome {
  readonly diagnostics: readonly Diagnostic[];
  readonly parsed: boolean;
}

function parse(goal: Goal, source: string, sourceId: string): ParseOutcome {
  return goal === "script"
    ? babelFrontend.parse({ source, sourceId })
    : babelModuleFrontend.parseModule({ source, sourceId });
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Assert that `source` is rejected with one diagnostic at the `#` that
 * begins its misplaced hashbang, the first character the lexer cannot
 * accept.
 */
function assertRejectedAt(
  goal: Goal,
  source: string,
  before: string,
  label: string,
): void {
  const result = parse(goal, source, `file:///${label}.js`);
  assert.equal(result.parsed, false, label);
  assert.ok(result.diagnostics.length > 0, label);
  const [diagnostic] = result.diagnostics;
  assert.equal(diagnostic?.sourceId, `file:///${label}.js`, label);
  assert.equal(diagnostic?.byteRange?.start, utf8Length(before), label);
}

test("accepts a hashbang at the start of Script and Module source", () => {
  for (const goal of goals) {
    // A Module is strict, so `with` there would be a SyntaxError; the
    // Script variant proves the comment never makes the Script strict.
    const code = goal === "script" ? "with ({}) {}\n" : "export const x = 1;\n";
    for (const body of bodies) {
      for (const [name, terminator] of lineTerminators) {
        const label = `${goal}-${name}-${JSON.stringify(body)}`;
        const result = parse(goal, `#!${body}${terminator}${code}`, label);
        assert.deepEqual(result.diagnostics, [], label);
        assert.equal(result.parsed, true, label);
      }
      const atEnd = parse(goal, `#!${body}`, `${goal}-eof`);
      assert.deepEqual(atEnd.diagnostics, [], `${goal}-eof ${body}`);
      assert.equal(atEnd.parsed, true, `${goal}-eof ${body}`);
    }
  }
});

test("ends a hashbang at every line terminator", () => {
  for (const goal of goals) {
    for (const body of bodies) {
      for (const [name, terminator] of lineTerminators) {
        const comment = `#!${body}${terminator}`;
        const label = `${goal}-${name}-ends`;
        // The code after the terminator is scanned, so its error is
        // reported on the second line, at its first column.
        const result = parse(goal, `${comment})`, label);
        assert.equal(result.parsed, false, label);
        const [diagnostic] = result.diagnostics;
        assert.equal(diagnostic?.byteRange?.start, utf8Length(comment), label);
        assert.deepEqual(diagnostic?.range?.start, { column: 1, line: 2 });
      }
    }
  }
});

test("rejects a hashbang after any preceding source text", () => {
  for (const goal of goals) {
    for (const prefix of prefixes) {
      assertRejectedAt(
        goal,
        `${prefix}#!\n`,
        prefix,
        `${goal}-prefix-${JSON.stringify(prefix)}`,
      );
    }
    for (const [name, before, after] of nestedPlacements) {
      assertRejectedAt(
        goal,
        `${before}#!${after}`,
        before,
        `${goal}-nested-${name.replaceAll(" ", "-")}`,
      );
    }
  }
});

test("rejects escaped hashbang spellings at the start of source", () => {
  for (const goal of goals) {
    for (const spelling of escapes) {
      const label = `${goal}-escape-${spelling}`;
      const result = parse(goal, `${spelling}\n`, label);
      assert.equal(result.parsed, false, label);
      assert.ok(result.diagnostics.length > 0, label);
      assert.equal(result.diagnostics[0]?.range?.start.line, 1, label);
    }
  }
});

test("lowers a hashbang Script exactly like its line-comment twin", () => {
  for (const [name, terminator] of lineTerminators) {
    const loop = "for (const n of [1, 2]) total += n;";
    const code = `let total = 0;${terminator}${loop}`;
    const hashbang = compileSource(babelFrontend, {
      source: `#!x${terminator}${code}`,
      sourceId: "file:///twin.js",
    });
    // `//x` has the same length and line structure as `#!x`, so every
    // owned location and both IR printings must agree.
    const comment = compileSource(babelFrontend, {
      source: `//x${terminator}${code}`,
      sourceId: "file:///twin.js",
    });
    assert.deepEqual(hashbang.diagnostics, [], name);
    assert.deepEqual(hashbang.syntax, comment.syntax, name);
    assert.ok(hashbang.hir != null && comment.hir != null, name);
    assert.ok(hashbang.mir != null && comment.mir != null, name);
    assert.equal(printHir(hashbang.hir), printHir(comment.hir), name);
    assert.equal(printMir(hashbang.mir), printMir(comment.mir), name);
  }
});

test("converts a hashbang Module exactly like its line-comment twin", () => {
  const code = 'import { a } from "./a.js";\nexport const b = a;\n';
  const hashbang = babelModuleFrontend.parseModule({
    source: `#!/usr/bin/env node\n${code}`,
    sourceId: "file:///app/main.js",
  });
  const comment = babelModuleFrontend.parseModule({
    source: `///usr/bin/env node\n${code}`,
    sourceId: "file:///app/main.js",
  });
  assert.equal(hashbang.parsed, true);
  assert.deepEqual(hashbang.module, comment.module);
});

test("keeps dynamic hashbang source behind the ADR 0016 boundary", () => {
  // A hashbang inside eval or Function source text is an InputElement of
  // that later parse, which this profile does not perform; the compiler
  // reports the dynamic source boundary at the call site instead.
  for (const source of ["Function('#!\\n', '');", "new Function('#!');"]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "file:///dynamic.js",
    });
    assert.equal(result.hir, undefined, source);
    assert.equal(result.diagnostics.length, 1, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
  }
  // Direct and indirect calls of %eval% compile; their String argument,
  // hashbang included, meets the ADR 0016 boundary at run time instead,
  // which tests/native.ts observes.
  for (const source of ["eval('#!\\n');", "(0, eval)('#!\\n');"]) {
    const indirect = compileSource(babelFrontend, {
      source,
      sourceId: "file:///dynamic.js",
    });
    assert.deepEqual(indirect.diagnostics, []);
    assert.ok(indirect.mir != null);
    assert.match(printMir(indirect.mir), /constant "#!\\n"/u);
  }
});
