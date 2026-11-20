/*
 * The two patterns from yaml 2.9.0 retain the following ISC notice.
 *
 * Copyright Eemeli Aro <eemeli@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 *
 * The Semantic Versioning 2.0.0 pattern is from the specification
 * originally authored by Tom Preston-Werner, under CC BY 3.0.
 * <https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string>
 * <https://creativecommons.org/licenses/by/3.0/>
 *
 * The URI reference pattern comes from RFC 3986, Appendix B.
 * Copyright (C) The Internet Society (2005).
 * See the full copyright statement in the RFC.
 * <https://www.rfc-editor.org/rfc/rfc3986#appendix-B>
 *
 * The email address pattern comes from the WHATWG HTML Standard.
 * Copyright © WHATWG (Apple, Google, Mozilla, Microsoft).
 * The standard applies the BSD 3-Clause License to portions used in code.
 * <https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address>
 * <https://html.spec.whatwg.org/#intellectual-property-rights>
 * <https://opensource.org/license/bsd-3-clause>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

// Copyright (C) 2017 the V8 project authors. All rights reserved.
// Copyright (C) 2020 Apple Inc. All rights reserved.
// Copyright (C) 2024 Tan Meng. All rights reserved.
// Copyright 2009 the Sputnik authors.  All rights reserved.
// Copyright 2025 Mathias Bynens. All rights reserved.
// The Test262 portions follow the BSD license in
// ../../tests/test262/harness/LICENSE.

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

/**
 * The reviewed pattern corpus every regular expression probe measures.
 *
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) requires the probes to draw
 * their patterns from test262, from real dependency-free packages, and
 * from reviewed stress cases, so every entry names where it came from.
 * A `test262` entry cites one reviewed upstream path and carries the
 * exact pattern that path executes, which
 * *tests/regexp-probes.test.ts* checks against the reviewed subset. A
 * `package` entry cites the pinned dependency-free package and the file
 * inside it that evaluates the pattern. A `standard` entry cites the
 * document that publishes the pattern. A `stress` entry is constructed
 * here and says what it stresses.
 *
 * Inputs are described rather than written out so a multi-kilobyte
 * subject stays readable and stays one line of evidence: `unit` repeated
 * `repeat` times is the whole subject. Sizes are chosen so one ordinary
 * probe run stays within seconds; the resource probe owns the cases that
 * deliberately reach an owned boundary.
 */

/** Where one corpus pattern came from. */
export type RegExpProbeOrigin = "package" | "standard" | "stress" | "test262";

/**
 * One subject a probe runs one pattern over.
 *
 * The subject is `unit` repeated `repeat` times followed by `suffix`,
 * which is how a case whose whole point is that the input never
 * completes the pattern stays one readable line.
 */
export interface RegExpProbeInput {
  readonly id: string;
  readonly repeat: number;
  readonly suffix?: string;
  readonly unit: string;
}

/** One reviewed pattern with its provenance and subjects. */
export interface RegExpProbeCase {
  readonly flags: string;
  readonly id: string;
  readonly inputs: readonly RegExpProbeInput[];
  readonly note: string;
  readonly origin: RegExpProbeOrigin;
  readonly provenance: string;
  readonly source: string;
}

/** The subject one input describes. */
export function probeInputText(input: RegExpProbeInput): string {
  return input.unit.repeat(input.repeat) + (input.suffix ?? "");
}

const semverSource =
  "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
  "(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)" +
  "(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?" +
  "(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$";

const manyCaptureSource = "(x|y)".repeat(40);

const uriSource = "^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?";

const emailSource =
  "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9]" +
  "(?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?" +
  "(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$";

/**
 * The corpus.
 *
 * The order is stable because every probe reports one row per entry and
 * a report is compared against an earlier one by row.
 */
export const regExpProbeCorpus: readonly RegExpProbeCase[] = [
  {
    flags: "",
    id: "choice-graph",
    inputs: [
      { id: "spec", repeat: 1, unit: "aabaac" },
      { id: "long", repeat: 512, unit: "aabaac" },
    ],
    note:
      "The edition's own worked example of choice order over a " +
      "quantified disjunction, which no automaton preserves for free.",
    origin: "test262",
    provenance: "test/built-ins/RegExp/S15.10.2.5_A1_T3.js",
    source: "(aa|aabaac|ba|b|c)*",
  },
  {
    flags: "",
    id: "capture-reset",
    inputs: [
      { id: "spec", repeat: 1, unit: "zaacbbbcac" },
      { id: "long", repeat: 256, unit: "zaacbbbcac" },
    ],
    note:
      "The edition's capture-reset example: an inner capture that " +
      "did not participate in the last iteration reads undefined.",
    origin: "test262",
    provenance: "test/built-ins/RegExp/S15.10.2.5_A1_T4.js",
    source: "(z)((a+)?(b+)?(c))*",
  },
  {
    flags: "",
    id: "lazy-bounded",
    inputs: [
      { id: "short", repeat: 1, unit: "abcdefghi" },
      { id: "long", repeat: 512, unit: "abcdefghi" },
    ],
    note:
      "A lazy bounded quantifier, the counter-directed half of " +
      "repetition priority.",
    origin: "test262",
    provenance: "test/built-ins/RegExp/prototype/exec/S15.10.6.2_A1_T4.js",
    source: "a[a-z]{2,4}?",
  },
  {
    flags: "",
    id: "class-pair",
    inputs: [
      { id: "short", repeat: 1, unit: "abcdefghijklmn" },
      { id: "long", repeat: 512, unit: "abcdefghijklmn" },
    ],
    note:
      "The smallest ordinary pattern: one class and one character, " +
      "which is the shape a string search would specialize.",
    origin: "test262",
    provenance: "test/built-ins/RegExp/prototype/exec/S15.10.6.2_A1_T21.js",
    source: "[a-z]n",
  },
  {
    flags: "",
    id: "lookbehind-greedy",
    inputs: [
      { id: "short", repeat: 1, unit: "ab12b23b34c" },
      { id: "long", repeat: 256, unit: "ab12b23b34c" },
    ],
    note:
      "A greedy loop inside a lookbehind, which runs backward and " +
      "keeps the captures its body set.",
    origin: "test262",
    provenance: "test/built-ins/RegExp/lookBehind/greedy-loop.js",
    source: "(?<=((?:b\\d{2})+))c",
  },
  {
    flags: "i",
    id: "lookbehind-backreference",
    inputs: [
      { id: "short", repeat: 1, unit: "aabAaBa" },
      { id: "long", repeat: 256, unit: "aabAaBa" },
    ],
    note:
      "The one shape that has to canonicalize two input characters " +
      "at match time rather than while the artifact is built.",
    origin: "test262",
    provenance: "test/built-ins/RegExp/lookBehind/back-references.js",
    source: "((\\w)\\w)(?<=\\1\\2\\1)",
  },
  {
    flags: "u",
    id: "property-escape-negated",
    inputs: [
      { id: "ascii", repeat: 64, unit: "abcdefghijklmnop" },
      { id: "mixed", repeat: 64, unit: "abcdefgé一\u{1f600}" },
    ],
    note:
      "A negated property escape, which the builder resolves into " +
      "an inversion list from the pinned tables.",
    origin: "test262",
    provenance:
      "test/built-ins/RegExp/prototype/exec/regexp-builtin-exec-v-u-flag.js",
    source: "\\P{ASCII}",
  },
  {
    flags: "",
    id: "named-group-alternation",
    inputs: [
      { id: "short", repeat: 1, unit: "the quick brown fox jumps" },
      { id: "long", repeat: 128, unit: "the quick brown fox jumps. " },
    ],
    note:
      "A named capturing group over an alternation, with the " +
      "group-name table an artifact carries for the result object.",
    origin: "test262",
    provenance:
      "test/built-ins/RegExp/named-groups/non-unicode-property-names-valid.js",
    source: "(?<animal>fox|dog)",
  },
  {
    flags: "v",
    id: "class-set-difference",
    inputs: [
      { id: "accept", repeat: 1, unit: "ABCDEF" },
      { id: "reject", repeat: 1, unit: "ABC0DEF" },
    ],
    note:
      "Class set notation, whose operands the builder resolves and " +
      "subtracts while it builds the artifact.",
    origin: "test262",
    provenance:
      "test/built-ins/RegExp/unicodeSets/generated/" +
      "character-property-escape-difference-character-class.js",
    source: "^[\\p{ASCII_Hex_Digit}--[0-9]]+$",
  },
  {
    flags: "u",
    id: "yaml-control-characters",
    inputs: [
      { id: "plain", repeat: 64, unit: "key: value\n" },
      { id: "control", repeat: 1, unit: "key: va\u0001lue" },
    ],
    note:
      "A Unicode-mode class of control and surrogate ranges, which a " +
      "real serializer runs over every scalar it writes.",
    origin: "package",
    provenance: "yaml 2.9.0, dist/stringify/stringifyString.js",
    source: "[\\x00-\\x08\\x0b-\\x1f\\x7f-\\x9f\\u{D800}-\\u{DFFF}]",
  },
  {
    flags: "s",
    id: "yaml-tag-split",
    inputs: [
      { id: "handle", repeat: 1, unit: "!e!tag:example.org,2026:type" },
      { id: "long", repeat: 24, unit: "!prefix!suffix" },
    ],
    note:
      "An anchored greedy split, where the leading `.*` walks back " +
      "one character at a time until the trailing group can start.",
    origin: "package",
    provenance: "yaml 2.9.0, dist/doc/directives.js",
    source: "^(.*!)([^!]*)$",
  },
  {
    flags: "",
    id: "semver",
    inputs: [
      { id: "release", repeat: 1, unit: "1.24.7" },
      { id: "prerelease", repeat: 1, unit: "10.20.30-rc.1+build.7" },
      { id: "reject", repeat: 1, unit: "1.24.7-" },
    ],
    note:
      "The published SemVer 2.0.0 pattern: nine groups, nested " +
      "alternation, and a rejection that backtracks through all of it.",
    origin: "standard",
    provenance:
      "https://semver.org/#is-there-a-suggested-regular-" +
      "expression-regex-to-check-a-semver-string",
    source: semverSource,
  },
  {
    flags: "",
    id: "uri-reference",
    inputs: [
      { id: "absolute", repeat: 1, unit: "https://example.org/a/b?c=d#e" },
      { id: "relative", repeat: 1, unit: "../a/b" },
    ],
    note:
      "The URI parser published in RFC 3986 appendix B, which is " +
      "all negated classes and optional groups.",
    origin: "standard",
    provenance: "https://www.rfc-editor.org/rfc/rfc3986#appendix-B",
    source: uriSource,
  },
  {
    flags: "",
    id: "email-address",
    inputs: [
      { id: "accept", repeat: 1, unit: "probe.user@lists.example.org" },
      { id: "reject", repeat: 1, unit: "probe.user@lists.example.org." },
    ],
    note:
      "The HTML email-input pattern, whose rejection walks the " +
      "trailing-label loop back through every label.",
    origin: "standard",
    provenance:
      "https://html.spec.whatwg.org/multipage/" +
      "input.html#valid-e-mail-address",
    source: emailSource,
  },
  {
    flags: "g",
    id: "word-scan",
    inputs: [{ id: "prose", repeat: 128, unit: "the quick brown fox jumps. " }],
    note:
      "A word scan over prose, the shape a word-boundary assertion " +
      "and a global search meet most often.",
    origin: "standard",
    provenance: "ECMA-262 22.2.2.6, the \\b assertion over \\w",
    source: "\\b\\w+\\b",
  },
  {
    flags: "",
    id: "nested-quantifier",
    inputs: [
      { id: "reject-16", repeat: 16, suffix: "!", unit: "a" },
      { id: "reject-18", repeat: 18, suffix: "!", unit: "a" },
    ],
    note:
      "The classic exponential choice tree: every partition of the " +
      "run of `a` is one distinct path to the failing anchor.",
    origin: "stress",
    provenance: "Constructed adversarial case.",
    source: "(a+)+$",
  },
  {
    flags: "",
    id: "ambiguous-alternation",
    inputs: [
      { id: "reject-14", repeat: 14, suffix: "b", unit: "a" },
      { id: "reject-16", repeat: 16, suffix: "b", unit: "a" },
    ],
    note:
      "The same tree reached through an alternation rather than a " +
      "nested quantifier.",
    origin: "stress",
    provenance: "Constructed adversarial case.",
    source: "^(a|aa)+$",
  },
  {
    flags: "",
    id: "large-bounded-repetition",
    inputs: [
      { id: "accept", repeat: 1, unit: "aaaaaaaaaab" },
      { id: "reject", repeat: 1, unit: "aaaaaaaaaa" },
    ],
    note:
      "A bounded repetition whose bound is far larger than any " +
      "input, which a counter keeps as one loop and an automaton " +
      "would have to unroll.",
    origin: "stress",
    provenance: "Constructed size case.",
    source: "a{0,2000}b",
  },
  {
    flags: "",
    id: "many-captures",
    inputs: [{ id: "accept", repeat: 20, unit: "xy" }],
    note:
      "Forty capturing groups, which sets the register file and the " +
      "trail width a match has to restore.",
    origin: "stress",
    provenance: "Constructed capture-count case.",
    source: manyCaptureSource,
  },
  {
    flags: "",
    id: "empty-repetition",
    inputs: [{ id: "reject", repeat: 24, unit: "a" }],
    note:
      "An empty body under two quantifiers, where empty-progress " +
      "failure is the only thing that terminates the loop.",
    origin: "stress",
    provenance: "Constructed empty-match case.",
    source: "(a*)*b",
  },
  {
    flags: "",
    id: "deep-lookaround",
    inputs: [{ id: "accept", repeat: 64, unit: "abc" }],
    note:
      "Nested assertions, each of which opens a lookaround frame " +
      "the executor has to unwind exactly.",
    origin: "stress",
    provenance: "Constructed assertion-depth case.",
    source: "(?=(?=(?=a)a)a)abc",
  },
  {
    flags: "",
    id: "lazy-any-scan",
    inputs: [{ id: "late", repeat: 256, unit: "abcdefghij" }],
    note:
      "A lazy scan over every character, which advances one " +
      "position for every step of the search loop.",
    origin: "stress",
    provenance: "Constructed scan case.",
    source: "[\\s\\S]*?jx",
  },
  {
    flags: "u",
    id: "script-run",
    inputs: [{ id: "greek", repeat: 64, unit: "αβγΑ 12 " }],
    note:
      "Two property escapes in one pattern, which is the largest " +
      "table demand an ordinary pattern makes.",
    origin: "stress",
    provenance: "Constructed Unicode-table case.",
    source: "\\p{Script=Greek}+\\s\\p{Nd}+",
  },
  {
    flags: "",
    id: "unicode-whitespace",
    inputs: [
      { id: "leading", repeat: 1, unit: "\u00a0\ufeff\u2028 x" },
      { id: "ascii", repeat: 1, unit: "   x" },
    ],
    note:
      "The edition's WhiteSpace is not ASCII: it holds NBSP, ZWNBSP, " +
      "and every Space_Separator, and its LineTerminator holds U+2028 " +
      "and U+2029, so `\\s` is the one class escape a component cannot " +
      "map to an ASCII or a Unicode mode of its own.",
    origin: "stress",
    provenance: "ECMA-262 12.2, WhiteSpace and LineTerminator.",
    source: "\\s+",
  },
  {
    flags: "y",
    id: "sticky-attempt",
    inputs: [
      { id: "offset", repeat: 1, unit: "ba" },
      { id: "start", repeat: 1, unit: "ab" },
    ],
    note:
      "A sticky pattern attempts only at its starting position, which " +
      "the artifact carries and the owned search honors, so it is the " +
      "one flag besides the Unicode modes that changes a single " +
      "attempt rather than the loop above it.",
    origin: "stress",
    provenance: "ECMA-262 22.2.7.2, RegExpBuiltinExec sticky handling.",
    source: "a",
  },
  {
    flags: "m",
    id: "line-terminator-class",
    inputs: [
      { id: "separator", repeat: 1, unit: "a\u2028b" },
      { id: "vertical-tab", repeat: 1, unit: "a\u000bb" },
    ],
    note:
      "The edition's LineTerminator is LF, CR, U+2028, and U+2029, so " +
      "`^` under `m` matches after a line separator and not after a " +
      "vertical tab. A component's newline convention is a build or a " +
      "context choice rather than that set.",
    origin: "stress",
    provenance: "ECMA-262 12.3, LineTerminator.",
    source: "^b",
  },
  {
    flags: "iu",
    id: "folded-word-character",
    inputs: [
      { id: "folded", repeat: 1, unit: "a\u017fb\u212ac" },
      { id: "ascii", repeat: 1, unit: "abc" },
    ],
    note:
      "The edition's WordCharacters is ASCII only until `i` and a " +
      "unicode-mode flag are both set: U+017F and U+212A fold into the " +
      "basic set, so `\\w` admits them, which is a second class escape " +
      "no component's ASCII or Unicode mode reproduces.",
    origin: "stress",
    provenance: "ECMA-262 22.2.2.9, WordCharacters.",
    source: "\\w+",
  },
  {
    flags: "",
    id: "unset-backreference",
    inputs: [
      { id: "unset", repeat: 1, unit: "bc" },
      { id: "set", repeat: 1, unit: "aac" },
    ],
    note:
      "A reference to a group that did not participate, which the " +
      "edition matches as the empty string and an engine may refuse.",
    origin: "stress",
    provenance: "Constructed backreference case.",
    source: "(?:(a)|b)\\1c",
  },
  {
    flags: "iu",
    id: "ignore-case-closure",
    inputs: [{ id: "mixed", repeat: 64, unit: "Straße SS ſK " }],
    note:
      "An ignore-case class whose closure the builder computes from " +
      "the pinned folding table and stores in the artifact.",
    origin: "stress",
    provenance: "Constructed case-folding case.",
    source: "[a-zſK]+",
  },
];
