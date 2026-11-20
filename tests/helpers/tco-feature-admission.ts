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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseHarnessDefinitions } from "../../tools/test262-source.ts";
import {
  parseReviewedSubset,
  parseTest262Case,
} from "../../tools/test262-source.ts";
import type {
  ParsedTest262Case,
  ReviewedTest262Entry,
  ReviewedTest262Subset,
} from "../../tools/test262-source.ts";
import type { Test262Harnesses } from "../../tools/test262.ts";

export const tcoFeature = "tail-call-optimization";
export const tcoRevision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";

/** Original pinned bodies, never shortened or rewritten for native tests. */
const subjects = [
  {
    path: "test/language/expressions/tagged-template/tco-call.js",
    sha256: "43bf6ad98c060a309bbd630e6bb64ff1d07a211513f7e606b7384612380ddf5c",
  },
  {
    path: "test/language/expressions/tagged-template/tco-member.js",
    sha256: "2eb3b051c3cd031040fd7c5d3915601daaefa8e2e779276c04af65b506a655f0",
  },
] as const;

interface TcoAdmissionSubject {
  readonly entry: ReviewedTest262Entry;
  readonly parsed: ParsedTest262Case;
  readonly source: string;
  readonly sourcePath: string;
}

interface TcoAdmission {
  readonly harnesses: Test262Harnesses;
  readonly reviewedHelper: string;
  readonly rootPath: string;
  readonly subjects: readonly TcoAdmissionSubject[];
  readonly subset: ReviewedTest262Subset;
  readonly upstreamHelper: string;
}

/**
 * Load the real admission list and the runner's reviewed harness sources.
 * This loader executes no subject and never adds a supported feature. Both
 * preparation and native tests use the same unchanged upstream bytes.
 */
export async function loadTcoAdmission(): Promise<TcoAdmission> {
  const subset = parseReviewedSubset(
    await readFile(new URL("../test262/subset.yaml", import.meta.url), "utf8"),
  );
  assert.equal(subset.suiteRevision, tcoRevision);
  const reviewedHelper = await readFile(
    new URL("../test262/harness/tcoHelper.js", import.meta.url),
    "utf8",
  );
  const upstreamHelper = await readFile(
    new URL(import.meta.resolve("test262/harness/tcoHelper.js")),
    "utf8",
  );
  const harnesses: Test262Harnesses = {
    base: await readFile(
      new URL("../test262/harness/base.js", import.meta.url),
      "utf8",
    ),
    done: "",
    includes: new Map([["tcoHelper.js", reviewedHelper]]),
    upstreamDefinitions: new Map([
      ["tcoHelper.js", parseHarnessDefinitions(upstreamHelper, "tcoHelper.js")],
    ]),
  };
  const loaded = await Promise.all(
    subjects.map(async (subject) => {
      const url = new URL(import.meta.resolve(`test262/${subject.path}`));
      const source = await readFile(url, "utf8");
      assert.equal(
        createHash("sha256").update(source).digest("hex"),
        subject.sha256,
        "The pinned upstream subject must remain unmodified.",
      );
      const entry = subset.tests.find((item) => item.path === subject.path);
      assert.ok(entry, "The original reviewed path must remain in the subset.");
      return {
        entry,
        parsed: parseTest262Case(source, subject.path, tcoRevision),
        source,
        sourcePath: fileURLToPath(url),
      };
    }),
  );
  return {
    harnesses,
    reviewedHelper,
    rootPath: dirname(
      fileURLToPath(import.meta.resolve("test262/package.json")),
    ),
    subjects: loaded,
    subset,
    upstreamHelper,
  };
}
