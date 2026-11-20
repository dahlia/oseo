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

/**
 * One built artifact per corpus entry, shared by every probe.
 *
 * The probes measure the artifact `@oseo/compiler` builds rather than a
 * copy of it, so the composition here is the one a real build uses: the
 * pinned Unicode tables come from `@oseo/cli`, which is the outer
 * composition root that owns them, and the admitted extension set is the
 * one the default command line admits.
 */

import {
  buildRegExpMatcher,
  parseRegExpPattern,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpMatcherProgram,
  RegExpPatternExtensions,
} from "../../packages/compiler/src/index.ts";
import {
  propertyEscapeSet,
  stringPropertyEscapeSet,
  unicodeMatcherData,
} from "../../packages/cli/src/index.ts";

import { regExpProbeCorpus } from "./corpus.ts";
import type { RegExpProbeCase } from "./corpus.ts";

/** The extension set the default command line admits. */
export const probeExtensions: RegExpPatternExtensions = {
  admitted: ["class-set-notation", "modifiers", "unicode-property-escapes"],
  unicodeProperty: (escape) =>
    propertyEscapeSet(escape) != null ||
    stringPropertyEscapeSet(escape) != null,
};

/**
 * One corpus entry with the artifact it builds and the storage that
 * artifact needs.
 *
 * `setBytes` charges every inversion-list boundary four bytes, which is
 * the width a code point needs in generated data, and `canonicalBytes`
 * charges the pair of code points one canonicalization entry stores.
 * Neither is read from emitted C; the size probe measures that
 * separately and the two are compared in the report.
 */
export interface ProbeArtifact {
  readonly canonicalBytes: number;
  readonly captures: number;
  readonly entry: RegExpProbeCase;
  readonly groupNames: number;
  readonly instructions: number;
  readonly program: RegExpMatcherProgram;
  readonly registers: number;
  readonly setBoundaries: number;
  readonly setBytes: number;
  readonly sets: number;
}

/** Build one corpus entry, throwing when the reviewed corpus is wrong. */
export function buildProbeArtifact(entry: RegExpProbeCase): ProbeArtifact {
  const parsed = parseRegExpPattern({
    extensions: probeExtensions,
    flags: entry.flags,
    source: entry.source,
  });
  const pattern = parsed.pattern;
  if (parsed.errors.length > 0 || pattern == null) {
    const first = parsed.errors[0];
    throw new Error(
      `Probe case ${entry.id} is not an admitted pattern: ` +
        `${first?.message ?? "no pattern was produced"}.`,
    );
  }
  const built = buildRegExpMatcher(pattern, {
    unicodeData: unicodeMatcherData,
  });
  const program = built.program;
  if (built.errors.length > 0 || program == null) {
    const first = built.errors[0];
    throw new Error(
      `Probe case ${entry.id} does not build an artifact: ` +
        `${first?.message ?? "no artifact was produced"}.`,
    );
  }
  let boundaries = 0;
  for (const set of program.sets) boundaries += set.length;
  const canonical = program.canonicalization?.characters.length ?? 0;
  return {
    canonicalBytes: canonical * 8,
    captures: program.captures.length,
    entry,
    groupNames: program.groupNames.length,
    instructions: program.instructions.length,
    program,
    registers: program.registers,
    setBoundaries: boundaries,
    setBytes: boundaries * 4,
    sets: program.sets.length,
  };
}

/** Build the complete corpus in its reviewed order. */
export function buildProbeCorpus(): readonly ProbeArtifact[] {
  return regExpProbeCorpus.map(buildProbeArtifact);
}
