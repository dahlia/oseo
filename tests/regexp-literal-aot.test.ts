/**
 * Ahead-of-time literal compilation, from the frontend to generated C.
 *
 * The contract this suite owns is that a literal's pattern is compiled
 * once during the build. Everything a run would otherwise have to do,
 * parsing the pattern, resolving Unicode data, and building the matcher
 * program, is generated data by the time the C backend is done, while
 * every evaluation still allocates its own object.
 *
 * The suite composes the same command-line frontend a real build uses, so
 * the artifact it inspects describes the pinned Unicode release rather
 * than whichever tables the executing host carries.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { defaultComponents } from "../packages/cli/src/index.ts";
import {
  compileSource,
  printMir,
  searchRegExpMatcher,
} from "../packages/compiler/src/index.ts";
import type {
  MirProgram,
  RegExpMatcherProgram,
} from "../packages/compiler/src/index.ts";

function lower(source: string): MirProgram {
  const result = compileSource(defaultComponents.frontend, {
    source,
    sourceId: "regexp-literal.js",
  });
  assert.deepEqual(result.diagnostics, [], source);
  const mir = result.mir;
  if (mir == null) throw new Error("an accepted source lowers to MIR");
  return mir;
}

function artifacts(program: MirProgram): readonly RegExpMatcherProgram[] {
  const found: RegExpMatcherProgram[] = [];
  for (const unit of [program.script, ...program.functions]) {
    for (const block of unit.blocks) {
      for (const operation of block.operations) {
        if (operation.kind !== "regexp-literal") continue;
        const artifact = operation.regexpProgram;
        if (artifact == null) throw new Error("an operation carries one");
        found.push(artifact);
      }
    }
  }
  return found;
}

function emit(source: string): string {
  return cBackend.emit(lower(source)).source;
}

test("lowers one literal to one artifact-carrying operation", () => {
  const mir = lower("const pattern = /a(b)c/giu;\n");
  const found = artifacts(mir);
  assert.equal(found.length, 1);
  const artifact = found[0];
  if (artifact == null) throw new Error("one artifact was found");
  assert.equal(artifact.source, "a(b)c");
  assert.equal(artifact.flags.text, "giu");
  assert.equal(artifact.captures.length, 1);
  const text = printMir(mir);
  assert.match(text, /regexp-literal/u);
  assert.match(text, /safepoint regular expression literal allocation/u);
});

test("compiles two occurrences of one pattern to two descriptors", () => {
  // Object allocation and identity are never shared, so two occurrences
  // emit two descriptors and each evaluation of either allocates its own
  // object with its own lastIndex.
  const source = "const first = /a/g;\nconst second = /a/g;\n";
  const found = artifacts(lower(source));
  assert.equal(found.length, 2);
  assert.notEqual(found[0], found[1]);
  assert.deepEqual(found[0]?.instructions, found[1]?.instructions);
  const emitted = emit(source);
  const descriptors = [
    ...emitted.matchAll(/static const OseoRegExpLiteral regexp_literal_/gu),
  ];
  assert.equal(descriptors.length, 2);
  const calls = [
    ...emitted.matchAll(/oseo_regexp_literal\(context, &regexp_literal_/gu),
  ];
  assert.equal(calls.length, 2);
});

test("emits the compiled program as generated data", () => {
  const emitted = emit("const pattern = /(?<a>x)+|y/giu;\n");
  // The instruction array, its sets, its repetition table, and its group
  // names are all static data. A run that had to parse the pattern would
  // instead reach the dynamic constructor.
  assert.match(emitted, /static OseoRegExpInstruction regexp_instructions_/u);
  assert.match(emitted, /static uint32_t regexp_set_boundaries_/u);
  assert.match(emitted, /static uint32_t regexp_set_offsets_/u);
  assert.match(emitted, /static OseoRegExpRepeat regexp_repeats_/u);
  assert.match(emitted, /static OseoRegExpCapture regexp_captures_/u);
  assert.match(emitted, /static uint16_t regexp_name_units_/u);
  assert.match(emitted, /static OseoRegExpProgram regexp_program_/u);
  assert.doesNotMatch(emitted, /oseo_regexp_construct/u);
  assert.doesNotMatch(emitted, /oseo_internal_regexp_program_build/u);
});

test("carries the canonicalization table only where one is compared", () => {
  // Every other ignore-case decision is folded into a set while the
  // artifact is built, so only a pattern that compares two input
  // characters needs the table, and a pattern that does not must not pay
  // for it.
  const compared = emit("const pattern = /(à)\\1/i;\n");
  assert.match(compared, /static uint32_t regexp_canonical_characters_/u);
  assert.match(compared, /static uint32_t regexp_canonical_values_/u);
  const folded = emit("const pattern = /à/i;\n");
  assert.doesNotMatch(folded, /regexp_canonical_characters_/u);
});

test("expands a duplicate-named backreference and remaps targets", () => {
  // A backreference to a duplicated group name is the one place the
  // encoding is not one instruction per artifact instruction. At most one
  // candidate can have participated, so running them in order resolves the
  // same capture, and every later branch target shifts by the expansion.
  const source = "const pattern = /(?:(?<a>x)|(?<a>y))\\k<a>b|q/;\n";
  const found = artifacts(lower(source));
  const artifact = found[0];
  if (artifact == null) throw new Error("one artifact was found");
  const references = artifact.instructions.filter(
    (instruction) => instruction.kind === "backreference",
  );
  assert.equal(references.length, 1);
  assert.equal(references[0]?.kind, "backreference");
  assert(references[0]?.kind === "backreference");
  assert.equal(references[0].slots.length, 2);
  const emitted = emit(source);
  const encoded =
    /OseoRegExpInstruction regexp_instructions_\d+\[\] = \{(.+?)\};/su.exec(
      emitted,
    );
  assert(encoded != null);
  const written = encoded[1] ?? "";
  // Opcode 14 is the backreference, and both candidate registers appear.
  assert.equal([...written.matchAll(/\{14u, /gu)].length, 2);
  assert.equal(
    artifact.instructions.length + 1,
    [...written.matchAll(/\{\d+u, \d+u, \{/gu)].length,
  );
});

test("keeps an empty set addressable in generated data", () => {
  // A set the pattern can never match contributes no boundary. The
  // matcher still indexes the array to answer that the set holds nothing,
  // so a program whose every set is empty must not point at nothing.
  const emitted = emit("const pattern = /[^\\s\\S]/;\n");
  assert.match(
    emitted,
    /static uint32_t regexp_set_boundaries_\d+\[\] = \{0u\};/u,
  );
  assert.match(
    emitted,
    /static uint32_t regexp_set_offsets_\d+\[\] = \{0u, 0u\};/u,
  );
});

test("emits the written pattern and flag text for the accessors", () => {
  const emitted = emit("const pattern = /a\\/b/gi;\n");
  // "a\/b" and "gi" as UTF-16 code units, which is what source, flags,
  // and toString report without reconstructing text from instructions.
  assert.match(
    emitted,
    /static uint16_t regexp_source_units_\d+\[\] = \{97u, 92u, 47u, 98u\};/u,
  );
  assert.match(
    emitted,
    /static uint16_t regexp_flag_units_\d+\[\] = \{103u, 105u\};/u,
  );
});

test("keeps the artifact the semantic authority for every literal", () => {
  // The generated descriptor is an encoding of this artifact, so the
  // artifact's own executor is what a native run has to agree with.
  const cases: readonly (readonly [string, string])[] = [
    ["/(a|ab)(c|bcd)(d*)/", "abcd"],
    ["/(z)((a+)?(b+)?(c))*/", "zaacbbbcac"],
    ["/(a*)b\\1+/", "baaaac"],
    ["/(?<=a)b/", "ab"],
    ["/\\p{L}+/u", "abcé123"],
    ["/[a-z]+/i", "ABC"],
  ];
  for (const [literal, input] of cases) {
    const found = artifacts(lower(`const pattern = ${literal};\n`));
    const artifact = found[0];
    if (artifact == null) throw new Error("one artifact was found");
    const execution = searchRegExpMatcher({
      program: artifact,
      startIndex: 0,
      text: input,
    });
    assert.equal(execution.outcome, "matched", literal);
  }
});
